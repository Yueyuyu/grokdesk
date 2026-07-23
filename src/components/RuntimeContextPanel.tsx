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
import { inspectGrokContext } from "../lib/desktop";
import {
  filterRuntimeSkills,
  formatContextBytes,
  formatContextTokens,
} from "../lib/runtimeContext";
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

const capabilityLabel = (supported: boolean | undefined) => {
  if (supported === undefined) return "Start ACP to inspect";
  return supported ? "Supported" : "Not reported";
};

const trustLabel = (trusted: boolean | null) => {
  if (trusted === null) return "trust not reported";
  return trusted ? "trusted workspace" : "workspace not trusted";
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
  const [snapshot, setSnapshot] = useState<RuntimeContextSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const deferredQuery = useDeferredValue(query);

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
      setNotice("ACP reconnected with the current Runtime context.");
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
        <strong>No simulated Runtime context</strong>
        <p>
          The browser preview does not invent Skills, project instructions,
          configuration, ACP capabilities, or session identifiers.
        </p>
      </div>
    );
  }

  if (!workspaceReady) {
    return (
      <div className="context-panel context-panel--empty">
        <span><FileText size={21} /></span>
        <strong>Choose a workspace</strong>
        <p>Runtime context is discovered for the selected project folder.</p>
        <button type="button" className="primary-button" onClick={onChooseWorkspace}>
          Choose workspace
        </button>
      </div>
    );
  }

  if (!runtimeAvailable) {
    return (
      <div className="context-panel context-panel--empty">
        <span><PuzzlePiece size={21} /></span>
        <strong>Official Runtime required</strong>
        <p>Install Grok Runtime before reading its real project context and Skills.</p>
        <button type="button" className="primary-button" onClick={onOpenSettings}>
          Open Settings
        </button>
      </div>
    );
  }

  if (!snapshot && loading) {
    return (
      <div className="context-panel context-panel--empty">
        <span><SpinnerGap size={21} className="spin" /></span>
        <strong>Reading Runtime context</strong>
        <p>GrokDesk is querying the official CLI for this workspace.</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="context-panel context-panel--empty">
        <span><ShareNetwork size={21} /></span>
        <strong>Runtime context unavailable</strong>
        <p>{error || "The official CLI did not return a readable context snapshot."}</p>
        <button type="button" className="secondary-button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  const counts = snapshot.counts;

  return (
    <div className="context-panel">
      <header className="context-panel__header">
        <div>
          <span className="context-eyebrow">Official Runtime discovery</span>
          <strong>Grok {snapshot.grokVersion}</strong>
          <small>
            {snapshot.channel === "unknown" ? "Default channel" : snapshot.channel}
            {` · ${trustLabel(snapshot.projectTrusted)}`}
          </small>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => void refresh()}
          disabled={loading || reconnecting}
          aria-label="Refresh Runtime context"
        >
          <ArrowClockwise size={16} className={loading ? "spin" : undefined} />
        </button>
      </header>

      {error ? <div className="context-inline-note context-inline-note--error" role="alert">{error}</div> : null}
      {notice ? <div className="context-inline-note context-inline-note--success">{notice}</div> : null}

      <section className="context-section">
        <div className="context-section__heading">
          <h2>Active task and ACP</h2>
          <span className={connected ? "is-connected" : ""}>{connected ? "Connected" : "Not connected"}</span>
        </div>
        <dl className="context-facts">
          <div><dt>Task</dt><dd title={task?.title}>{task?.title || "No active task"}</dd></div>
          <div><dt>Status</dt><dd>{task?.status || "idle"}</dd></div>
          <div><dt>Saved context</dt><dd>{task ? `${task.messages.length} messages · ${task.plan.length} plan steps · ${task.tools.length} tools` : "None"}</dd></div>
        </dl>
        <div className="context-capabilities" aria-label="ACP prompt capabilities">
          <div><span>Images</span><strong>{capabilityLabel(promptCapabilities?.image)}</strong></div>
          <div><span>Audio</span><strong>{capabilityLabel(promptCapabilities?.audio)}</strong></div>
          <div><span>Embedded context</span><strong>{capabilityLabel(promptCapabilities?.embeddedContext)}</strong></div>
        </div>
        <button
          type="button"
          className="secondary-button context-reconnect"
          disabled={busy || reconnecting || !task}
          onClick={() => void reconnect()}
        >
          {reconnecting ? <SpinnerGap size={14} className="spin" /> : <ArrowClockwise size={14} />}
          {reconnecting ? "Reconnecting…" : connected ? "Reconnect ACP" : "Start ACP"}
        </button>
      </section>

      <section className="context-section">
        <div className="context-section__heading">
          <h2>Project instructions</h2>
          <span>{snapshot.projectInstructions.length}</span>
        </div>
        {snapshot.projectInstructions.length === 0 ? (
          <p className="context-section__empty">The Runtime reported no project instruction files.</p>
        ) : (
          <div className="context-instruction-list">
            {snapshot.projectInstructions.map((instruction) => (
              <article key={`${instruction.scope}:${instruction.path}`}>
                <FileText size={15} />
                <div>
                  <strong title={instruction.path}>{instruction.path}</strong>
                  <span>{instruction.scope} · {instruction.fileType.replaceAll("_", " ")}</span>
                </div>
                <small>{formatContextBytes(instruction.sizeBytes)}<br />{formatContextTokens(instruction.approxTokens)}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="context-section context-skills-section">
        <div className="context-section__heading">
          <h2>Discovered Skills</h2>
          <span>{snapshot.skills.length}</span>
        </div>
        <label className="context-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter Runtime Skills"
            aria-label="Filter Runtime Skills"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear Skills filter">
              <X size={12} />
            </button>
          ) : null}
        </label>
        {visibleSkills.length === 0 ? (
          <p className="context-section__empty">No Runtime Skills match this filter.</p>
        ) : (
          <div className="context-skill-list" aria-live="polite">
            {visibleSkills.map((skill) => (
              <article key={`${skill.sourceType}:${skill.name}`}>
                <span><PuzzlePiece size={15} /></span>
                <div>
                  <strong>{skill.name}</strong>
                  <p>{skill.description || "The Runtime did not provide a description."}</p>
                  <small>{skill.sourceType} · {skill.userInvocable ? "user-invocable" : "Runtime-only"}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="context-section">
        <div className="context-section__heading">
          <h2>Runtime composition</h2>
          <span>Current workspace</span>
        </div>
        <div className="context-count-grid">
          <div><strong>{counts.agents}</strong><span>Agents</span></div>
          <div><strong>{counts.plugins}</strong><span>Plugins</span></div>
          <div><strong>{counts.mcpServers}</strong><span>MCP</span></div>
          <div><strong>{counts.hooks}</strong><span>Hooks</span></div>
          <div><strong>{counts.lspServers}</strong><span>LSP</span></div>
          <div><strong>{counts.configLayers}</strong><span>Config layers</span></div>
        </div>
        <p className="context-permission-summary">
          Permissions: {counts.permissionRulesLoaded} loaded · {counts.permissionRulesSkipped} skipped · {counts.permissionSources} sources
        </p>
      </section>

      <section className="context-note">
        This view projects safe metadata from <code>grok inspect --json</code> and excludes credential values, absolute source paths, MCP names, endpoints, and headers. Refresh reads discovery again; reconnect ACP to apply changed instructions, Skills, Plugins, or MCP configuration.
      </section>
    </div>
  );
}
