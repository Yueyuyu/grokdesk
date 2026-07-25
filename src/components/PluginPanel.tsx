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
import { useI18n } from "../i18n/I18nProvider";
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
  const { formatNumber, t } = useI18n();
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
          ? `${message} ${t("extensions.reconnectNotice")}`
          : message,
      );
      await refresh();
    },
    [connected, refresh, t],
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
          <h1>{t("nav.plugins")}</h1>
          <p>{t("plugins.description")}</p>
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
            {t("plugins.syncMarketplace")}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={readOnly || Boolean(action)}
            onClick={() => setInstallOpen(true)}
          >
            <DownloadSimple size={16} />
            {t("plugins.install")}
          </button>
        </div>
      </header>

      {preview ? (
        <div className="extension-banner">
          {t("plugins.preview.before")} <code>grok plugin</code>{" "}
          {t("plugins.preview.after")}
        </div>
      ) : null}

      {unavailable ? (
        <section className="feature-empty-state">
          <span><PuzzlePiece size={24} /></span>
          <h2>{t("extensions.runtimeRequired")}</h2>
          <p>{t("plugins.runtimeRequiredDescription")}</p>
          <button type="button" className="primary-button" onClick={onOpenSettings}>
            {t("common.openSettings")}
          </button>
        </section>
      ) : (
        <>
          <section
            className="extension-toolbar"
            aria-label={t("plugins.catalogControls")}
          >
            <div
              className="extension-tabs"
              role="tablist"
              aria-label={t("plugins.views")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "installed"}
                className={view === "installed" ? "is-active" : ""}
                onClick={() => setView("installed")}
              >
                {t("plugins.installed")}{" "}
                <span>{formatNumber(installedCount)}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "marketplace"}
                className={view === "marketplace" ? "is-active" : ""}
                onClick={() => setView("marketplace")}
              >
                {t("plugins.marketplace")}{" "}
                <span>{formatNumber(marketplaceCount)}</span>
              </button>
            </div>
            <label className="extension-search">
              <MagnifyingGlass size={15} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("plugins.search")}
                aria-label={t("plugins.search")}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("plugins.clearSearch")}
                >
                  <X size={13} />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => void refresh()}
              disabled={loading || Boolean(action)}
              aria-label={t("plugins.refresh")}
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
              <h2>{t("plugins.loading")}</h2>
              <p>{t("extensions.runtimeSource")}</p>
            </section>
          ) : visiblePlugins.length === 0 ? (
            <section className="feature-empty-state feature-empty-state--compact">
              <span>{view === "installed" ? <PuzzlePiece size={24} /> : <Storefront size={24} />}</span>
              <h2>
                {query
                  ? t("plugins.noMatch")
                  : view === "installed"
                    ? t("plugins.noneInstalled")
                    : t("plugins.marketplaceUnavailable")}
              </h2>
              <p>
                {query
                  ? t("plugins.noMatchDescription")
                  : view === "installed"
                    ? t("plugins.noneInstalledDescription")
                    : t("plugins.marketplaceUnavailableDescription")}
              </p>
              {!query && view === "installed" && !readOnly ? (
                <button type="button" className="primary-button" onClick={() => setInstallOpen(true)}>
                  {t("plugins.installFirst")}
                </button>
              ) : null}
            </section>
          ) : (
            <section className="extension-list" aria-live="polite">
              {visiblePlugins.map((plugin) => {
                const componentLabels = [
                  plugin.skillCount > 0
                    ? t("plugins.component.skills", {
                        count: formatNumber(plugin.skillCount),
                      })
                    : null,
                  plugin.commandCount > 0
                    ? t("plugins.component.commands", {
                        count: formatNumber(plugin.commandCount),
                      })
                    : null,
                  plugin.agentCount > 0
                    ? t("plugins.component.agents", {
                        count: formatNumber(plugin.agentCount),
                      })
                    : null,
                  plugin.hookCount > 0
                    ? t("plugins.component.hooks", {
                        count: formatNumber(plugin.hookCount),
                      })
                    : null,
                  plugin.mcpServerCount > 0
                    ? t("plugins.component.mcp", {
                        count: formatNumber(plugin.mcpServerCount),
                      })
                    : null,
                ].filter((label): label is string => Boolean(label));
                const pending = action?.endsWith(`:${plugin.name}`) === true;
                return (
                  <article className="extension-card" key={`${plugin.status}:${plugin.name}`}>
                    <div className="extension-card__icon"><PuzzlePiece size={20} /></div>
                    <div className="extension-card__content">
                      <div className="extension-card__title">
                        <h2>{plugin.name}</h2>
                        <span className={`extension-status ${plugin.enabled ? "is-enabled" : ""}`}>
                          {isInstalledPlugin(plugin)
                            ? plugin.enabled
                              ? t("common.enabled")
                              : t("common.disabled")
                            : plugin.marketplace || t("plugins.available")}
                        </span>
                      </div>
                      <p>
                        {plugin.description || t("plugins.noDescription")}
                      </p>
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
                          {plugin.enabled
                            ? t("plugins.disable")
                            : t("plugins.enable")}
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
                          {t("common.update")}
                        </button>
                        <button
                          type="button"
                          className="icon-button extension-card__delete"
                          disabled={Boolean(action)}
                          onClick={() => {
                            setKeepPluginData(true);
                            setUninstallTarget(plugin);
                          }}
                          aria-label={t("plugins.uninstallAria", {
                            name: plugin.name,
                          })}
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
                <h2>{t("plugins.installTrusted")}</h2>
                <p>{t("plugins.installDescription")}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setInstallOpen(false)}
                aria-label={t("plugins.closeInstaller")}
              >
                <X size={16} />
              </button>
            </header>
            <div className="extension-dialog__body">
              <label>
                <span>{t("plugins.source")}</span>
                <input
                  value={installSource}
                  onChange={(event) => setInstallSource(event.target.value)}
                  placeholder={t("plugins.sourcePlaceholder", {
                    path: localPluginExample,
                  })}
                  autoFocus
                />
              </label>
              <label className="extension-confirm-check">
                <input
                  type="checkbox"
                  checked={sourceTrusted}
                  onChange={(event) => setSourceTrusted(event.target.checked)}
                />
                <span>{t("plugins.trustSource")}</span>
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setInstallOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary-button" disabled={!installSource.trim() || !sourceTrusted || Boolean(action)}>
                {action === "install" ? <SpinnerGap size={15} className="spin" /> : <DownloadSimple size={15} />}
                {t("common.install")}
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
                <h2 id="plugin-uninstall-title">
                  {t("plugins.uninstallTitle", {
                    name: uninstallTarget.name,
                  })}
                </h2>
                <p>{t("plugins.uninstallDescription")}</p>
              </div>
            </header>
            <div className="extension-dialog__body">
              <label className="extension-confirm-check">
                <input type="checkbox" checked={keepPluginData} onChange={(event) => setKeepPluginData(event.target.checked)} />
                <span>{t("plugins.keepData")}</span>
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setUninstallTarget(null)}
              >
                {t("common.cancel")}
              </button>
              <button type="button" className="danger-button" disabled={Boolean(action)} onClick={() => void confirmUninstall()}>
                {action?.startsWith("uninstall:") ? <SpinnerGap size={15} className="spin" /> : <Trash size={15} />}
                {t("plugins.confirmUninstall")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
