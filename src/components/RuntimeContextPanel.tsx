import {
  ArrowClockwise,
  FileText,
  MagnifyingGlass,
  PuzzlePiece,
  ShareNetwork,
  ShieldCheck,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import { inspectGrokContext } from "../lib/desktop";
import {
  filterRuntimeSkills,
  formatContextBytes,
  formatContextTokens,
} from "../lib/runtimeContext";
import { localizeTaskTitle } from "../lib/tasks";
import type {
  GrokTask,
  PromptCapabilities,
  RuntimeContextSnapshot,
} from "../types";

interface RuntimeContextPanelProps {
  preview: boolean;
  workspacePath: string;
  workspaceReady: boolean;
  runtimeAvailable: boolean;
  connected: boolean;
  busy: boolean;
  promptCapabilities: PromptCapabilities | null;
  task: GrokTask | null;
  onChooseWorkspace: () => void;
  onOpenSettings: () => void;
  onReconnect: () => Promise<unknown>;
}

const taskStatusKeys: Record<GrokTask["status"], TranslationKey> = {
  idle: "context.taskStatus.idle",
  running: "common.running",
  complete: "common.complete",
  error: "common.error",
};

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function RuntimeContextPanel({
  preview,
  workspacePath,
  workspaceReady,
  runtimeAvailable,
  connected,
  busy,
  promptCapabilities,
  task,
  onChooseWorkspace,
  onOpenSettings,
  onReconnect,
}: RuntimeContextPanelProps) {
  const { formatNumber, locale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<RuntimeContextSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const deferredQuery = useDeferredValue(query);
  const capabilityLabel = (supported: boolean | undefined) => {
    if (supported === undefined) return t("context.startAcpToInspect");
    return supported ? t("context.supported") : t("context.notReported");
  };
  const trustLabel = (trusted: boolean | null) => {
    if (trusted === null) return t("context.trustNotReported");
    return trusted
      ? t("context.trustedWorkspace")
      : t("context.untrustedWorkspace");
  };

  const refresh = useCallback(async () => {
    if (preview || !workspaceReady || !runtimeAvailable) {
      setSnapshot(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await inspectGrokContext(workspacePath);
      if (requestId === requestIdRef.current) setSnapshot(next);
    } catch (cause) {
      if (requestId === requestIdRef.current) setError(errorMessage(cause));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [preview, runtimeAvailable, workspacePath, workspaceReady]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const visibleSkills = useMemo(
    () => filterRuntimeSkills(snapshot?.skills ?? [], deferredQuery),
    [deferredQuery, snapshot?.skills],
  );

  const reconnect = async () => {
    if (reconnecting || busy || !task) return;
    setReconnecting(true);
    setError(null);
    setNotice(null);
    try {
      await onReconnect();
      setNotice(t("context.reconnected"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReconnecting(false);
    }
  };

  if (preview) {
    return (
      <div className="context-panel context-panel--empty">
        <span><ShieldCheck size={21} /></span>
        <strong>{t("context.previewTitle")}</strong>
        <p>{t("context.previewDescription")}</p>
      </div>
    );
  }

  if (!workspaceReady) {
    return (
      <div className="context-panel context-panel--empty">
        <span><FileText size={21} /></span>
        <strong>{t("common.chooseWorkspace")}</strong>
        <p>{t("context.chooseWorkspaceDescription")}</p>
        <button type="button" className="primary-button" onClick={onChooseWorkspace}>
          {t("common.chooseWorkspace")}
        </button>
      </div>
    );
  }

  if (!runtimeAvailable) {
    return (
      <div className="context-panel context-panel--empty">
        <span><PuzzlePiece size={21} /></span>
        <strong>{t("context.runtimeRequired")}</strong>
        <p>{t("context.runtimeRequiredDescription")}</p>
        <button type="button" className="primary-button" onClick={onOpenSettings}>
          {t("common.openSettings")}
        </button>
      </div>
    );
  }

  if (!snapshot && loading) {
    return (
      <div className="context-panel context-panel--empty">
        <span><SpinnerGap size={21} className="spin" /></span>
        <strong>{t("context.reading")}</strong>
        <p>{t("context.readingDescription")}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="context-panel context-panel--empty">
        <span><ShareNetwork size={21} /></span>
        <strong>{t("context.unavailable")}</strong>
        <p>{error || t("context.unavailableDescription")}</p>
        <button type="button" className="secondary-button" onClick={() => void refresh()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const counts = snapshot.counts;
  const taskTitle = task
    ? localizeTaskTitle(task.title, t("sidebar.newTask"))
    : null;

  return (
    <div className="context-panel">
      <header className="context-panel__header">
        <div>
          <span className="context-eyebrow">
            {t("context.officialDiscovery")}
          </span>
          <strong>Grok {snapshot.grokVersion}</strong>
          <small>
            {snapshot.channel === "unknown"
              ? t("context.defaultChannel")
              : snapshot.channel}
            {` · ${trustLabel(snapshot.projectTrusted)}`}
          </small>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => void refresh()}
          disabled={loading || reconnecting}
          aria-label={t("context.refreshAria")}
        >
          <ArrowClockwise size={16} className={loading ? "spin" : undefined} />
        </button>
      </header>

      {error ? <div className="context-inline-note context-inline-note--error" role="alert">{error}</div> : null}
      {notice ? <div className="context-inline-note context-inline-note--success">{notice}</div> : null}

      <section className="context-section">
        <div className="context-section__heading">
          <h2>{t("context.activeTask")}</h2>
          <span className={connected ? "is-connected" : ""}>
            {connected ? t("common.connected") : t("common.disconnected")}
          </span>
        </div>
        <dl className="context-facts">
          <div>
            <dt>{t("context.task")}</dt>
            <dd title={taskTitle ?? undefined}>
              {taskTitle || t("context.noActiveTask")}
            </dd>
          </div>
          <div>
            <dt>{t("context.status")}</dt>
            <dd>
              {task
                ? t(taskStatusKeys[task.status])
                : t("context.taskStatus.idle")}
            </dd>
          </div>
          <div>
            <dt>{t("context.savedContext")}</dt>
            <dd>
              {task
                ? t("context.savedContextSummary", {
                    messages: formatNumber(task.messages.length),
                    plans: formatNumber(task.plan.length),
                    tools: formatNumber(task.tools.length),
                  })
                : t("common.none")}
            </dd>
          </div>
        </dl>
        <div
          className="context-capabilities"
          aria-label={t("context.promptCapabilities")}
        >
          <div>
            <span>{t("context.images")}</span>
            <strong>{capabilityLabel(promptCapabilities?.image)}</strong>
          </div>
          <div>
            <span>{t("context.audio")}</span>
            <strong>{capabilityLabel(promptCapabilities?.audio)}</strong>
          </div>
          <div>
            <span>{t("context.embeddedContext")}</span>
            <strong>
              {capabilityLabel(promptCapabilities?.embeddedContext)}
            </strong>
          </div>
        </div>
        <button
          type="button"
          className="secondary-button context-reconnect"
          disabled={busy || reconnecting || !task}
          onClick={() => void reconnect()}
        >
          {reconnecting ? <SpinnerGap size={14} className="spin" /> : <ArrowClockwise size={14} />}
          {reconnecting
            ? t("context.reconnecting")
            : connected
              ? t("context.reconnect")
              : t("context.startAcp")}
        </button>
      </section>

      <section className="context-section">
        <div className="context-section__heading">
          <h2>{t("context.projectInstructions")}</h2>
          <span>{formatNumber(snapshot.projectInstructions.length)}</span>
        </div>
        {snapshot.projectInstructions.length === 0 ? (
          <p className="context-section__empty">
            {t("context.noProjectInstructions")}
          </p>
        ) : (
          <div className="context-instruction-list">
            {snapshot.projectInstructions.map((instruction) => (
              <article key={`${instruction.scope}:${instruction.path}`}>
                <FileText size={15} />
                <div>
                  <strong title={instruction.path}>{instruction.path}</strong>
                  <span>{instruction.scope} · {instruction.fileType.replaceAll("_", " ")}</span>
                </div>
                <small>
                  {formatContextBytes(instruction.sizeBytes, locale)}
                  <br />
                  {formatContextTokens(
                    instruction.approxTokens,
                    locale,
                    t("context.tokens"),
                  )}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="context-section context-skills-section">
        <div className="context-section__heading">
          <h2>{t("context.discoveredSkills")}</h2>
          <span>{formatNumber(snapshot.skills.length)}</span>
        </div>
        <label className="context-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("context.filterSkills")}
            aria-label={t("context.filterSkills")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("context.clearSkillsFilter")}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>
        {visibleSkills.length === 0 ? (
          <p className="context-section__empty">
            {t("context.noMatchingSkills")}
          </p>
        ) : (
          <div className="context-skill-list" aria-live="polite">
            {visibleSkills.map((skill) => (
              <article key={`${skill.sourceType}:${skill.name}`}>
                <span><PuzzlePiece size={15} /></span>
                <div>
                  <strong>{skill.name}</strong>
                  <p>
                    {skill.description || t("context.noSkillDescription")}
                  </p>
                  <small>
                    {skill.sourceType} ·{" "}
                    {skill.userInvocable
                      ? t("context.userInvocable")
                      : t("context.runtimeOnly")}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="context-section">
        <div className="context-section__heading">
          <h2>{t("context.runtimeComposition")}</h2>
          <span>{t("context.currentWorkspace")}</span>
        </div>
        <div className="context-count-grid">
          <div><strong>{formatNumber(counts.agents)}</strong><span>{t("context.agents")}</span></div>
          <div><strong>{formatNumber(counts.plugins)}</strong><span>{t("nav.plugins")}</span></div>
          <div><strong>{formatNumber(counts.mcpServers)}</strong><span>MCP</span></div>
          <div><strong>{formatNumber(counts.hooks)}</strong><span>{t("context.hooks")}</span></div>
          <div><strong>{formatNumber(counts.lspServers)}</strong><span>LSP</span></div>
          <div><strong>{formatNumber(counts.configLayers)}</strong><span>{t("context.configLayers")}</span></div>
        </div>
        <p className="context-permission-summary">
          {t("context.permissionsSummary", {
            loaded: formatNumber(counts.permissionRulesLoaded),
            skipped: formatNumber(counts.permissionRulesSkipped),
            sources: formatNumber(counts.permissionSources),
          })}
        </p>
      </section>

      <section className="context-note">
        {t("context.safetyNote.before")}{" "}
        <code>grok inspect --json</code>{" "}
        {t("context.safetyNote.after")}
      </section>
    </div>
  );
}
