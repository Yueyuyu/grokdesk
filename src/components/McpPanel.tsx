import {
  ArrowClockwise,
  Plus,
  PlugsConnected,
  SpinnerGap,
  Trash,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  addGrokMcpServer,
  diagnoseGrokMcpServer,
  listGrokMcpServers,
  removeGrokMcpServer,
} from "../lib/desktop";
import { isValidMcpName, parseMcpArgumentLines } from "../lib/extensions";
import { detectAppPlatform, localPathExample } from "../lib/platform";
import { isWorkspaceSelected } from "../lib/workspace";
import type {
  AddMcpServerInput,
  GrokMcpCatalog,
  GrokMcpServerSummary,
  McpScope,
  McpTransport,
} from "../types";

interface McpPanelProps {
  workspacePath: string;
  runtimeAvailable: boolean;
  preview: boolean;
  connected: boolean;
  onOpenSettings: () => void;
}

interface McpDraft {
  name: string;
  transport: McpTransport;
  scope: McpScope;
  target: string;
  argumentLines: string;
}

const emptyCatalog: GrokMcpCatalog = { servers: [], message: null };
const emptyDraft = (workspaceReady: boolean): McpDraft => ({
  name: "",
  transport: "http",
  scope: workspaceReady ? "project" : "user",
  target: "",
  argumentLines: "",
});
const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function McpPanel({
  workspacePath,
  runtimeAvailable,
  preview,
  connected,
  onOpenSettings,
}: McpPanelProps) {
  const localProjectExample = localPathExample(detectAppPlatform());
  const workspaceReady = isWorkspaceSelected(workspacePath);
  const [catalog, setCatalog] = useState<GrokMcpCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doctorResults, setDoctorResults] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<McpDraft>(() => emptyDraft(workspaceReady));
  const [removeTarget, setRemoveTarget] =
    useState<GrokMcpServerSummary | null>(null);
  const [removeScope, setRemoveScope] = useState<McpScope>("user");

  const refresh = useCallback(async () => {
    if (!runtimeAvailable && !preview) {
      setCatalog(emptyCatalog);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCatalog(await listGrokMcpServers(workspacePath));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [preview, runtimeAvailable, workspacePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!workspaceReady && draft.scope === "project") {
      setDraft((current) => ({ ...current, scope: "user" }));
    }
  }, [draft.scope, workspaceReady]);

  const withRestartNotice = useCallback(
    (message: string) =>
      connected
        ? `${message} 重新连接 ACP 后，新配置会进入 Grok 会话。`
        : message,
    [connected],
  );

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (action || !isValidMcpName(draft.name) || !draft.target.trim()) return;
    const input: AddMcpServerInput = {
      name: draft.name.trim(),
      transport: draft.transport,
      scope: draft.scope,
      target: draft.target.trim(),
      args:
        draft.transport === "stdio"
          ? parseMcpArgumentLines(draft.argumentLines)
          : [],
    };
    setAction("add");
    setError(null);
    setNotice(null);
    try {
      const result = await addGrokMcpServer(workspacePath, input);
      setNotice(withRestartNotice(result.message));
      setAddOpen(false);
      setDraft(emptyDraft(workspaceReady));
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  };

  const diagnose = async (server: GrokMcpServerSummary) => {
    if (action) return;
    setAction(`doctor:${server.name}`);
    setError(null);
    try {
      const result = await diagnoseGrokMcpServer(workspacePath, server.name);
      setDoctorResults((current) => ({ ...current, [server.name]: result.message }));
    } catch (cause) {
      setDoctorResults((current) => ({
        ...current,
        [server.name]: `诊断失败：${errorMessage(cause)}`,
      }));
    } finally {
      setAction(null);
    }
  };

  const openRemove = (server: GrokMcpServerSummary) => {
    const reportedScope = server.scope?.toLocaleLowerCase();
    setRemoveScope(
      reportedScope === "project" && workspaceReady ? "project" : "user",
    );
    setRemoveTarget(server);
  };

  const confirmRemove = async () => {
    if (!removeTarget || action) return;
    setAction(`remove:${removeTarget.name}`);
    setError(null);
    setNotice(null);
    try {
      const result = await removeGrokMcpServer(
        workspacePath,
        removeTarget.name,
        removeScope,
      );
      setNotice(withRestartNotice(result.message));
      setRemoveTarget(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  };

  const unavailable = !runtimeAvailable && !preview;
  const readOnly = preview || unavailable;

  return (
    <main className="feature-panel extension-panel">
      <header className="feature-panel__header extension-panel__header">
        <span className="feature-panel__icon"><PlugsConnected size={22} /></span>
        <div>
          <h1>MCP servers</h1>
          <p>读取、诊断并管理官方 Grok Runtime 使用的工具连接。</p>
        </div>
        <div className="extension-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(action)}
          >
            <ArrowClockwise size={16} className={loading ? "spin" : ""} />
            刷新
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setDraft(emptyDraft(workspaceReady));
              setAddOpen(true);
            }}
            disabled={readOnly || Boolean(action)}
          >
            <Plus size={16} />
            添加服务器
          </button>
        </div>
      </header>

      {preview ? (
        <div className="extension-banner">
          浏览器预览不读取或伪造本机 MCP 配置。安装版会通过官方 <code>grok mcp</code> 命令显示真实结果。
        </div>
      ) : null}

      {catalog.message ? <div className="extension-inline-note">{catalog.message}</div> : null}
      {notice ? <div className="extension-inline-note extension-inline-note--success">{notice}</div> : null}
      {error ? <div className="extension-inline-note extension-inline-note--error" role="alert">{error}</div> : null}

      {unavailable ? (
        <section className="feature-empty-state">
          <span><PlugsConnected size={24} /></span>
          <h2>需要 Grok Runtime</h2>
          <p>安装官方 Runtime 后，才能读取和管理真实 MCP 配置。</p>
          <button type="button" className="primary-button" onClick={onOpenSettings}>打开设置</button>
        </section>
      ) : loading && catalog.servers.length === 0 ? (
        <section className="feature-empty-state">
          <span><SpinnerGap size={24} className="spin" /></span>
          <h2>正在读取 MCP 配置</h2>
          <p>数据直接来自本机官方 Runtime。</p>
        </section>
      ) : catalog.servers.length === 0 ? (
        <section className="feature-empty-state feature-empty-state--compact">
          <span><PlugsConnected size={24} /></span>
          <h2>尚未配置 MCP 服务器</h2>
          <p>可以添加原生 HTTP / SSE 端点，或一个本地 stdio 命令。Grok Runtime 会负责连接与 OAuth。</p>
          {!readOnly ? (
            <button type="button" className="primary-button" onClick={() => setAddOpen(true)}>
              添加第一个服务器
            </button>
          ) : null}
        </section>
      ) : (
        <section className="extension-list extension-list--mcp" aria-live="polite">
          {catalog.servers.map((server) => {
            const diagnosis = doctorResults[server.name];
            const diagnosing = action === `doctor:${server.name}`;
            return (
              <article className="extension-card extension-card--mcp" key={`${server.scope}:${server.name}`}>
                <div className="extension-card__icon"><PlugsConnected size={20} /></div>
                <div className="extension-card__content">
                  <div className="extension-card__title">
                    <h2>{server.name}</h2>
                    <span className={`extension-status ${server.enabled ? "is-enabled" : ""}`}>
                      {server.enabled ? server.status || "已启用" : "已停用"}
                    </span>
                  </div>
                  <p className="extension-endpoint" title={server.endpoint || undefined}>
                    {server.endpoint || "官方 CLI 未公开连接地址"}
                  </p>
                  <div className="extension-meta">
                    <span>{server.transport}</span>
                    {server.scope ? <span>{server.scope}</span> : null}
                    {server.source ? <span>{server.source}</span> : null}
                    {server.toolCount > 0 ? <span>{server.toolCount} tools</span> : null}
                  </div>
                  {diagnosis ? <div className="extension-diagnostic" role="status">{diagnosis}</div> : null}
                </div>
                <div className="extension-card__actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(action)}
                    onClick={() => void diagnose(server)}
                  >
                    {diagnosing ? <SpinnerGap size={14} className="spin" /> : <Wrench size={14} />}
                    诊断
                  </button>
                  <button
                    type="button"
                    className="icon-button extension-card__delete"
                    disabled={Boolean(action)}
                    onClick={() => openRemove(server)}
                    aria-label={`Remove ${server.name}`}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {addOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <form className="extension-dialog extension-dialog--wide" onSubmit={(event) => void submitAdd(event)}>
            <header>
              <span><Plus size={19} /></span>
              <div>
                <h2>添加 MCP 服务器</h2>
                <p>配置由官方 Grok CLI 写入；GrokDesk 不保存表单内容或认证令牌。</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setAddOpen(false)} aria-label="Close MCP form">
                <X size={16} />
              </button>
            </header>
            <div className="extension-dialog__body extension-form-grid">
              <label>
                <span>名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如 sentry 或 project-tools"
                  aria-invalid={draft.name.length > 0 && !isValidMcpName(draft.name)}
                  autoFocus
                />
                {draft.name.length > 0 && !isValidMcpName(draft.name) ? (
                  <small>仅支持字母、数字、连字符和下划线。</small>
                ) : null}
              </label>
              <label>
                <span>传输方式</span>
                <select
                  value={draft.transport}
                  onChange={(event) => setDraft((current) => ({ ...current, transport: event.target.value as McpTransport }))}
                >
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                  <option value="stdio">stdio（本地进程）</option>
                </select>
              </label>
              <label>
                <span>配置范围</span>
                <select
                  value={draft.scope}
                  onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as McpScope }))}
                >
                  <option value="user">用户级：所有项目</option>
                  <option value="project" disabled={!workspaceReady}>项目级：当前工作区</option>
                </select>
                {!workspaceReady ? <small>选择工作区后才能写入项目级配置。</small> : null}
              </label>
              <label className="extension-form-grid__full">
                <span>{draft.transport === "stdio" ? "启动命令" : "服务器 URL"}</span>
                <input
                  value={draft.target}
                  onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
                  placeholder={draft.transport === "stdio" ? "例如 npx" : "https://mcp.example.com/mcp"}
                />
              </label>
              {draft.transport === "stdio" ? (
                <label className="extension-form-grid__full">
                  <span>命令参数（每行一个）</span>
                  <textarea
                    rows={4}
                    value={draft.argumentLines}
                    onChange={(event) => setDraft((current) => ({ ...current, argumentLines: event.target.value }))}
                    placeholder={`-y\n@modelcontextprotocol/server-filesystem\n${localProjectExample}`}
                  />
                </label>
              ) : null}
              <div className="extension-security-note extension-form-grid__full">
                不要在这里粘贴 Token。远程 OAuth 由 Grok Runtime 处理；静态凭据请在官方配置中使用 <code>{"${VAR}"}</code> 环境变量引用。
              </div>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setAddOpen(false)}>取消</button>
              <button type="submit" className="primary-button" disabled={!isValidMcpName(draft.name) || !draft.target.trim() || Boolean(action)}>
                {action === "add" ? <SpinnerGap size={15} className="spin" /> : <Plus size={15} />}
                添加服务器
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {removeTarget ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="extension-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-remove-title">
            <header>
              <span className="is-danger"><Trash size={19} /></span>
              <div>
                <h2 id="mcp-remove-title">移除 {removeTarget.name}？</h2>
                <p>这会从所选 Grok 配置范围删除服务器定义，不会删除第三方账号或远程数据。</p>
              </div>
            </header>
            <div className="extension-dialog__body">
              <label>
                <span>从哪个范围删除</span>
                <select value={removeScope} onChange={(event) => setRemoveScope(event.target.value as McpScope)}>
                  <option value="user">用户级配置</option>
                  <option value="project" disabled={!workspaceReady}>当前项目配置</option>
                </select>
              </label>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setRemoveTarget(null)}>取消</button>
              <button type="button" className="danger-button" disabled={Boolean(action)} onClick={() => void confirmRemove()}>
                {action?.startsWith("remove:") ? <SpinnerGap size={15} className="spin" /> : <Trash size={15} />}
                确认移除
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
