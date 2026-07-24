import {
  ArrowClockwise,
  DownloadSimple,
  MagnifyingGlass,
  PuzzlePiece,
  SpinnerGap,
  Storefront,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  installGrokPlugin,
  listGrokPlugins,
  refreshGrokPluginMarketplaces,
  setGrokPluginEnabled,
  uninstallGrokPlugin,
  updateGrokPlugin,
} from "../lib/desktop";
import {
  filterPlugins,
  isInstalledPlugin,
  pluginComponentLabels,
  type PluginCatalogView,
} from "../lib/extensions";
import { detectAppPlatform, localPathExample } from "../lib/platform";
import type { GrokPluginCatalog, GrokPluginSummary } from "../types";

interface PluginPanelProps {
  workspacePath: string;
  runtimeAvailable: boolean;
  preview: boolean;
  connected: boolean;
  onOpenSettings: () => void;
}

const emptyCatalog: GrokPluginCatalog = {
  plugins: [],
  marketplaceAvailable: false,
  message: null,
};

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function PluginPanel({
  workspacePath,
  runtimeAvailable,
  preview,
  connected,
  onOpenSettings,
}: PluginPanelProps) {
  const localPluginExample = localPathExample(
    detectAppPlatform(),
    "plugin",
  );
  const [catalog, setCatalog] = useState<GrokPluginCatalog>(emptyCatalog);
  const [view, setView] = useState<PluginCatalogView>("installed");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installSource, setInstallSource] = useState("");
  const [sourceTrusted, setSourceTrusted] = useState(false);
  const [uninstallTarget, setUninstallTarget] =
    useState<GrokPluginSummary | null>(null);
  const [keepPluginData, setKeepPluginData] = useState(true);

  const refresh = useCallback(async () => {
    if (!runtimeAvailable && !preview) {
      setCatalog(emptyCatalog);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCatalog(await listGrokPlugins(workspacePath));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [preview, runtimeAvailable, workspacePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installedCount = useMemo(
    () => catalog.plugins.filter(isInstalledPlugin).length,
    [catalog.plugins],
  );
  const marketplaceCount = catalog.plugins.length - installedCount;
  const visiblePlugins = useMemo(
    () => filterPlugins(catalog.plugins, view, deferredQuery),
    [catalog.plugins, deferredQuery, view],
  );

  const finishAction = useCallback(
    async (message: string) => {
      setNotice(
        connected
          ? `${message} 重新连接 ACP 后，新配置会进入 Grok 会话。`
          : message,
      );
      await refresh();
    },
    [connected, refresh],
  );

  const runPluginAction = useCallback(
    async (
      key: string,
      operation: () => Promise<{ message: string }>,
    ) => {
      if (action) return false;
      setAction(key);
      setError(null);
      setNotice(null);
      try {
        const result = await operation();
        await finishAction(result.message);
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        setAction(null);
      }
    },
    [action, finishAction],
  );

  const submitInstall = async (event: FormEvent) => {
    event.preventDefault();
    if (!installSource.trim() || !sourceTrusted) return;
    const succeeded = await runPluginAction("install", () =>
      installGrokPlugin(workspacePath, installSource, sourceTrusted),
    );
    if (succeeded) {
      setInstallOpen(false);
      setInstallSource("");
      setSourceTrusted(false);
      setView("installed");
    }
  };

  const confirmUninstall = async () => {
    const target = uninstallTarget;
    if (!target) return;
    const succeeded = await runPluginAction(`uninstall:${target.name}`, () =>
      uninstallGrokPlugin(workspacePath, target.name, keepPluginData),
    );
    if (succeeded) setUninstallTarget(null);
  };

  const unavailable = !runtimeAvailable && !preview;
  const readOnly = preview || unavailable;

  return (
    <main className="feature-panel extension-panel">
      <header className="feature-panel__header extension-panel__header">
        <span className="feature-panel__icon"><PuzzlePiece size={22} /></span>
        <div>
          <h1>Plugins</h1>
          <p>读取并管理官方 Grok Runtime 的插件与市场目录。</p>
        </div>
        <div className="extension-header-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={readOnly || Boolean(action)}
            onClick={() =>
              void runPluginAction("marketplace", () =>
                refreshGrokPluginMarketplaces(workspacePath),
              )
            }
          >
            <Storefront size={16} />
            同步市场
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={readOnly || Boolean(action)}
            onClick={() => setInstallOpen(true)}
          >
            <DownloadSimple size={16} />
            安装插件
          </button>
        </div>
      </header>

      {preview ? (
        <div className="extension-banner">
          浏览器预览不读取或伪造本机插件。安装版会通过官方 <code>grok plugin</code> 命令显示真实结果。
        </div>
      ) : null}

      {unavailable ? (
        <section className="feature-empty-state">
          <span><PuzzlePiece size={24} /></span>
          <h2>需要 Grok Runtime</h2>
          <p>安装官方 Runtime 后，才能发现、启用和更新真实插件。</p>
          <button type="button" className="primary-button" onClick={onOpenSettings}>
            打开设置
          </button>
        </section>
      ) : (
        <>
          <section className="extension-toolbar" aria-label="Plugin catalog controls">
            <div className="extension-tabs" role="tablist" aria-label="Plugin views">
              <button
                type="button"
                role="tab"
                aria-selected={view === "installed"}
                className={view === "installed" ? "is-active" : ""}
                onClick={() => setView("installed")}
              >
                已安装 <span>{installedCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "marketplace"}
                className={view === "marketplace" ? "is-active" : ""}
                onClick={() => setView("marketplace")}
              >
                市场 <span>{marketplaceCount}</span>
              </button>
            </div>
            <label className="extension-search">
              <MagnifyingGlass size={15} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索插件"
                aria-label="Search plugins"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear plugin search">
                  <X size={13} />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => void refresh()}
              disabled={loading || Boolean(action)}
              aria-label="Refresh plugins"
            >
              <ArrowClockwise size={17} className={loading ? "spin" : ""} />
            </button>
          </section>

          {catalog.message ? <div className="extension-inline-note">{catalog.message}</div> : null}
          {notice ? <div className="extension-inline-note extension-inline-note--success">{notice}</div> : null}
          {error ? <div className="extension-inline-note extension-inline-note--error" role="alert">{error}</div> : null}

          {loading && catalog.plugins.length === 0 ? (
            <section className="feature-empty-state">
              <span><SpinnerGap size={24} className="spin" /></span>
              <h2>正在读取 Grok 插件</h2>
              <p>数据直接来自本机官方 Runtime。</p>
            </section>
          ) : visiblePlugins.length === 0 ? (
            <section className="feature-empty-state feature-empty-state--compact">
              <span>{view === "installed" ? <PuzzlePiece size={24} /> : <Storefront size={24} />}</span>
              <h2>{query ? "没有匹配的插件" : view === "installed" ? "尚未安装插件" : "市场目录暂不可用"}</h2>
              <p>
                {query
                  ? "换一个名称或清除搜索条件。"
                  : view === "installed"
                    ? "从 Git URL、GitHub shorthand 或本地目录安装可信插件。"
                    : "同步市场后会显示官方 Grok CLI 返回的可用插件。"}
              </p>
              {!query && view === "installed" && !readOnly ? (
                <button type="button" className="primary-button" onClick={() => setInstallOpen(true)}>
                  安装第一个插件
                </button>
              ) : null}
            </section>
          ) : (
            <section className="extension-list" aria-live="polite">
              {visiblePlugins.map((plugin) => {
                const componentLabels = pluginComponentLabels(plugin);
                const pending = action?.endsWith(`:${plugin.name}`) === true;
                return (
                  <article className="extension-card" key={`${plugin.status}:${plugin.name}`}>
                    <div className="extension-card__icon"><PuzzlePiece size={20} /></div>
                    <div className="extension-card__content">
                      <div className="extension-card__title">
                        <h2>{plugin.name}</h2>
                        <span className={`extension-status ${plugin.enabled ? "is-enabled" : ""}`}>
                          {isInstalledPlugin(plugin)
                            ? plugin.enabled ? "已启用" : "已停用"
                            : plugin.marketplace || "可安装"}
                        </span>
                      </div>
                      <p>{plugin.description || "官方 Grok Runtime 未提供插件说明。"}</p>
                      <div className="extension-meta">
                        {plugin.version ? <span>v{plugin.version}</span> : null}
                        {plugin.scope ? <span>{plugin.scope}</span> : null}
                        {componentLabels.map((label) => <span key={label}>{label}</span>)}
                      </div>
                    </div>
                    {isInstalledPlugin(plugin) ? (
                      <div className="extension-card__actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={Boolean(action)}
                          onClick={() =>
                            void runPluginAction(`toggle:${plugin.name}`, () =>
                              setGrokPluginEnabled(workspacePath, plugin.name, !plugin.enabled),
                            )
                          }
                        >
                          {pending ? <SpinnerGap size={14} className="spin" /> : null}
                          {plugin.enabled ? "停用" : "启用"}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={Boolean(action)}
                          onClick={() =>
                            void runPluginAction(`update:${plugin.name}`, () =>
                              updateGrokPlugin(workspacePath, plugin.name),
                            )
                          }
                        >
                          更新
                        </button>
                        <button
                          type="button"
                          className="icon-button extension-card__delete"
                          disabled={Boolean(action)}
                          onClick={() => {
                            setKeepPluginData(true);
                            setUninstallTarget(plugin);
                          }}
                          aria-label={`Uninstall ${plugin.name}`}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {installOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <form className="extension-dialog" onSubmit={(event) => void submitInstall(event)}>
            <header>
              <span><DownloadSimple size={19} /></span>
              <div>
                <h2>安装可信插件</h2>
                <p>支持 GitHub shorthand、Git URL 或本地目录。插件可包含 hooks 和 MCP 服务。</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setInstallOpen(false)} aria-label="Close plugin installer">
                <X size={16} />
              </button>
            </header>
            <div className="extension-dialog__body">
              <label>
                <span>插件来源</span>
                <input
                  value={installSource}
                  onChange={(event) => setInstallSource(event.target.value)}
                  placeholder={`owner/repo、https://… 或 ${localPluginExample}`}
                  autoFocus
                />
              </label>
              <label className="extension-confirm-check">
                <input
                  type="checkbox"
                  checked={sourceTrusted}
                  onChange={(event) => setSourceTrusted(event.target.checked)}
                />
                <span>我确认信任这个来源，并允许官方 Grok Runtime 激活它包含的代码与工具。</span>
              </label>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setInstallOpen(false)}>取消</button>
              <button type="submit" className="primary-button" disabled={!installSource.trim() || !sourceTrusted || Boolean(action)}>
                {action === "install" ? <SpinnerGap size={15} className="spin" /> : <DownloadSimple size={15} />}
                安装
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {uninstallTarget ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="extension-dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-uninstall-title">
            <header>
              <span className="is-danger"><Trash size={19} /></span>
              <div>
                <h2 id="plugin-uninstall-title">卸载 {uninstallTarget.name}？</h2>
                <p>插件将从 Grok Runtime 移除；当前 ACP 会话不会自动重启。</p>
              </div>
            </header>
            <div className="extension-dialog__body">
              <label className="extension-confirm-check">
                <input type="checkbox" checked={keepPluginData} onChange={(event) => setKeepPluginData(event.target.checked)} />
                <span>保留插件数据，便于以后重新安装</span>
              </label>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setUninstallTarget(null)}>取消</button>
              <button type="button" className="danger-button" disabled={Boolean(action)} onClick={() => void confirmUninstall()}>
                {action?.startsWith("uninstall:") ? <SpinnerGap size={15} className="spin" /> : <Trash size={15} />}
                确认卸载
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
