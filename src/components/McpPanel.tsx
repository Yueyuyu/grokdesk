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
import { useI18n } from "../i18n/I18nProvider";
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
  const { formatNumber, t } = useI18n();
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
        ? `${message} ${t("extensions.reconnectNotice")}`
        : message,
    [connected, t],
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
        [server.name]: t("mcp.diagnosisFailed", {
          error: errorMessage(cause),
        }),
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
          <h1>{t("mcp.title")}</h1>
          <p>{t("mcp.description")}</p>
        </div>
        <div className="extension-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(action)}
          >
            <ArrowClockwise size={16} className={loading ? "spin" : ""} />
            {t("common.refresh")}
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
            {t("mcp.addServer")}
          </button>
        </div>
      </header>

      {preview ? (
        <div className="extension-banner">
          {t("mcp.preview.before")} <code>grok mcp</code>{" "}
          {t("mcp.preview.after")}
        </div>
      ) : null}

      {catalog.message ? <div className="extension-inline-note">{catalog.message}</div> : null}
      {notice ? <div className="extension-inline-note extension-inline-note--success">{notice}</div> : null}
      {error ? <div className="extension-inline-note extension-inline-note--error" role="alert">{error}</div> : null}

      {unavailable ? (
        <section className="feature-empty-state">
          <span><PlugsConnected size={24} /></span>
          <h2>{t("extensions.runtimeRequired")}</h2>
          <p>{t("mcp.runtimeRequiredDescription")}</p>
          <button
            type="button"
            className="primary-button"
            onClick={onOpenSettings}
          >
            {t("common.openSettings")}
          </button>
        </section>
      ) : loading && catalog.servers.length === 0 ? (
        <section className="feature-empty-state">
          <span><SpinnerGap size={24} className="spin" /></span>
          <h2>{t("mcp.loading")}</h2>
          <p>{t("extensions.runtimeSource")}</p>
        </section>
      ) : catalog.servers.length === 0 ? (
        <section className="feature-empty-state feature-empty-state--compact">
          <span><PlugsConnected size={24} /></span>
          <h2>{t("mcp.emptyTitle")}</h2>
          <p>{t("mcp.emptyDescription")}</p>
          {!readOnly ? (
            <button type="button" className="primary-button" onClick={() => setAddOpen(true)}>
              {t("mcp.addFirst")}
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
                      {server.enabled
                        ? server.status || t("common.enabled")
                        : t("common.disabled")}
                    </span>
                  </div>
                  <p className="extension-endpoint" title={server.endpoint || undefined}>
                    {server.endpoint || t("mcp.endpointUnavailable")}
                  </p>
                  <div className="extension-meta">
                    <span>{server.transport}</span>
                    {server.scope ? <span>{server.scope}</span> : null}
                    {server.source ? <span>{server.source}</span> : null}
                    {server.toolCount > 0 ? (
                      <span>
                        {t("mcp.toolCount", {
                          count: formatNumber(server.toolCount),
                        })}
                      </span>
                    ) : null}
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
                    {t("mcp.diagnose")}
                  </button>
                  <button
                    type="button"
                    className="icon-button extension-card__delete"
                    disabled={Boolean(action)}
                    onClick={() => openRemove(server)}
                    aria-label={t("mcp.removeAria", {
                      name: server.name,
                    })}
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
                <h2>{t("mcp.addTitle")}</h2>
                <p>{t("mcp.addDescription")}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setAddOpen(false)}
                aria-label={t("mcp.closeForm")}
              >
                <X size={16} />
              </button>
            </header>
            <div className="extension-dialog__body extension-form-grid">
              <label>
                <span>{t("mcp.name")}</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t("mcp.namePlaceholder")}
                  aria-invalid={draft.name.length > 0 && !isValidMcpName(draft.name)}
                  autoFocus
                />
                {draft.name.length > 0 && !isValidMcpName(draft.name) ? (
                  <small>{t("mcp.nameValidation")}</small>
                ) : null}
              </label>
              <label>
                <span>{t("mcp.transport")}</span>
                <select
                  value={draft.transport}
                  onChange={(event) => setDraft((current) => ({ ...current, transport: event.target.value as McpTransport }))}
                >
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                  <option value="stdio">
                    {t("mcp.stdioLocal")}
                  </option>
                </select>
              </label>
              <label>
                <span>{t("mcp.scope")}</span>
                <select
                  value={draft.scope}
                  onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as McpScope }))}
                >
                  <option value="user">{t("mcp.scopeUserAll")}</option>
                  <option value="project" disabled={!workspaceReady}>
                    {t("mcp.scopeProjectCurrent")}
                  </option>
                </select>
                {!workspaceReady ? (
                  <small>{t("mcp.scopeWorkspaceRequired")}</small>
                ) : null}
              </label>
              <label className="extension-form-grid__full">
                <span>
                  {draft.transport === "stdio"
                    ? t("mcp.startCommand")
                    : t("mcp.serverUrl")}
                </span>
                <input
                  value={draft.target}
                  onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
                  placeholder={
                    draft.transport === "stdio"
                      ? t("mcp.commandPlaceholder")
                      : "https://mcp.example.com/mcp"
                  }
                />
              </label>
              {draft.transport === "stdio" ? (
                <label className="extension-form-grid__full">
                  <span>{t("mcp.arguments")}</span>
                  <textarea
                    rows={4}
                    value={draft.argumentLines}
                    onChange={(event) => setDraft((current) => ({ ...current, argumentLines: event.target.value }))}
                    placeholder={`-y\n@modelcontextprotocol/server-filesystem\n${localProjectExample}`}
                  />
                </label>
              ) : null}
              <div className="extension-security-note extension-form-grid__full">
                {t("mcp.securityNote.before")} <code>{"${VAR}"}</code>{" "}
                {t("mcp.securityNote.after")}
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAddOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary-button" disabled={!isValidMcpName(draft.name) || !draft.target.trim() || Boolean(action)}>
                {action === "add" ? <SpinnerGap size={15} className="spin" /> : <Plus size={15} />}
                {t("mcp.addServer")}
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
                <h2 id="mcp-remove-title">
                  {t("mcp.removeTitle", { name: removeTarget.name })}
                </h2>
                <p>{t("mcp.removeDescription")}</p>
              </div>
            </header>
            <div className="extension-dialog__body">
              <label>
                <span>{t("mcp.removeScope")}</span>
                <select value={removeScope} onChange={(event) => setRemoveScope(event.target.value as McpScope)}>
                  <option value="user">{t("mcp.scopeUser")}</option>
                  <option value="project" disabled={!workspaceReady}>
                    {t("mcp.scopeProject")}
                  </option>
                </select>
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRemoveTarget(null)}
              >
                {t("common.cancel")}
              </button>
              <button type="button" className="danger-button" disabled={Boolean(action)} onClick={() => void confirmRemove()}>
                {action?.startsWith("remove:") ? <SpinnerGap size={15} className="spin" /> : <Trash size={15} />}
                {t("mcp.confirmRemove")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
