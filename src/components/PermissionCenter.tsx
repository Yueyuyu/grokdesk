import {
  CheckCircle,
  FolderOpen,
  Info,
  MagnifyingGlass,
  ShieldCheck,
  SpinnerGap,
  TerminalWindow,
  Trash,
  WarningCircle,
  Wrench,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import {
  AUDIT_RETENTION_DAYS,
  MAX_AUDIT_EVENTS,
} from "../lib/audit";
import type {
  AuditEvent,
  AuditEventKind,
  AuditEventStatus,
  GrokTask,
} from "../types";

interface PermissionCenterProps {
  events: AuditEvent[];
  tasks: GrokTask[];
  workspaceReady: boolean;
  preview: boolean;
  clearDisabled: boolean;
  onClear: () => void;
  onChooseWorkspace: () => void;
}

type AuditFilter = "all" | AuditEventKind;

const filters: Array<{ id: AuditFilter; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "permission", label: "Permissions" },
  { id: "tool", label: "Grok tools" },
  { id: "command", label: "Commands" },
];

const statusLabels: Record<AuditEventStatus, string> = {
  pending: "Waiting",
  running: "Running",
  allowed: "Allowed",
  denied: "Denied",
  cancelled: "Cancelled",
  succeeded: "Succeeded",
  failed: "Failed",
  stopped: "Stopped",
  interrupted: "Interrupted",
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const formatAuditTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return null;
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1_000)}s`;
};

const isAttentionStatus = (status: AuditEventStatus) =>
  status === "denied" || status === "failed" || status === "interrupted";

function EventIcon({ kind }: { kind: AuditEventKind }) {
  if (kind === "permission") return <ShieldCheck size={18} />;
  if (kind === "command") return <TerminalWindow size={18} />;
  return <Wrench size={18} />;
}

function StatusIcon({ status }: { status: AuditEventStatus }) {
  if (status === "pending" || status === "running") {
    return <SpinnerGap size={13} className="spin" />;
  }
  if (status === "allowed" || status === "succeeded") {
    return <CheckCircle size={13} weight="fill" />;
  }
  if (status === "denied" || status === "failed") {
    return <XCircle size={13} weight="fill" />;
  }
  return <WarningCircle size={13} weight="fill" />;
}

export function PermissionCenter({
  events,
  tasks,
  workspaceReady,
  preview,
  clearDisabled,
  onClear,
  onChooseWorkspace,
}: PermissionCenterProps) {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const taskTitles = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks],
  );
  const counts = useMemo(
    () => ({
      all: events.length,
      permission: events.filter((event) => event.kind === "permission").length,
      tool: events.filter((event) => event.kind === "tool").length,
      command: events.filter((event) => event.kind === "command").length,
      active: events.filter(
        (event) => event.status === "pending" || event.status === "running",
      ).length,
      attention: events.filter((event) => isAttentionStatus(event.status)).length,
    }),
    [events],
  );
  const visibleEvents = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);
    return events.filter((event) => {
      if (filter !== "all" && event.kind !== filter) return false;
      if (!normalizedQuery) return true;
      const taskTitle = event.taskId ? taskTitles.get(event.taskId) ?? "" : "";
      return normalize(
        `${event.title} ${event.detail} ${statusLabels[event.status]} ${taskTitle}`,
      ).includes(normalizedQuery);
    });
  }, [deferredQuery, events, filter, taskTitles]);

  if (!workspaceReady) {
    return (
      <main className="feature-panel permission-center">
        <header className="feature-panel__header permission-center__header">
          <span className="feature-panel__icon"><ShieldCheck size={22} /></span>
          <div><h1>Permissions & activity</h1><p>Local decisions and execution metadata for one workspace.</p></div>
        </header>
        <div className="feature-empty-state">
          <span><FolderOpen size={23} /></span>
          <h2>Choose a workspace first</h2>
          <p>Permission and execution history is isolated by project folder, so GrokDesk needs an active workspace before it can show records.</p>
          <button type="button" className="primary-button" onClick={onChooseWorkspace}>Choose folder</button>
        </div>
      </main>
    );
  }

  return (
    <main className="feature-panel permission-center">
      <header className="feature-panel__header permission-center__header">
        <span className="feature-panel__icon"><ShieldCheck size={22} /></span>
        <div>
          <h1>Permissions & activity</h1>
          <p>Review what Grok requested, what you decided, and what ran locally.</p>
        </div>
        <span className="version-chip">Local · {AUDIT_RETENTION_DAYS} days</span>
      </header>

      {preview ? (
        <div className="settings-preview-note permission-center__preview-note">
          浏览器预览模式不会创建或伪造权限、工具或终端审计记录。真实历史只来自安装后的桌面客户端。
        </div>
      ) : null}

      <section className="audit-summary" aria-label="Activity summary">
        <div><span>Total records</span><strong>{counts.all}</strong></div>
        <div><span>Permissions</span><strong>{counts.permission}</strong></div>
        <div><span>In progress</span><strong>{counts.active}</strong></div>
        <div className={counts.attention > 0 ? "has-attention" : ""}><span>Needs attention</span><strong>{counts.attention}</strong></div>
      </section>

      <section className="audit-privacy-note">
        <Info size={16} />
        <span>
          Metadata only: GrokDesk never stores prompt or response text, terminal output, attachment contents, OAuth tokens, or MCP headers here. Sensitive command arguments are redacted before local persistence. History is capped at {MAX_AUDIT_EVENTS} records.
        </span>
      </section>

      <div className="audit-toolbar">
        <div className="extension-tabs" role="tablist" aria-label="Activity type">
          {filters.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}<span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="extension-search audit-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search activity"
            aria-label="Search local activity"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear activity search"><X size={12} /></button>
          ) : <span />}
        </label>
        <button
          type="button"
          className="secondary-button audit-clear-button"
          disabled={events.length === 0 || clearDisabled}
          onClick={() => setConfirmClear(true)}
        >
          <Trash size={14} /> Clear history
        </button>
      </div>

      <section className="audit-list" aria-label="Local activity history">
        {visibleEvents.length > 0 ? (
          visibleEvents.map((event) => {
            const duration = formatDuration(event.durationMs);
            const taskTitle = event.taskId ? taskTitles.get(event.taskId) : null;
            return (
              <article className="audit-event" key={event.id}>
                <span className={`audit-event__icon audit-event__icon--${event.kind}`}><EventIcon kind={event.kind} /></span>
                <div className="audit-event__body">
                  <div className="audit-event__heading">
                    <strong title={event.title}>{event.title}</strong>
                    <span className={`audit-status audit-status--${event.status}`}><StatusIcon status={event.status} />{statusLabels[event.status]}</span>
                  </div>
                  <p>{event.detail}</p>
                  <footer>
                    <span>{event.kind === "permission" ? "Permission" : event.kind === "command" ? "Workspace command" : "Grok tool"}</span>
                    {taskTitle ? <><span aria-hidden="true">·</span><span title={taskTitle}>{taskTitle}</span></> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.updatedAt}>{formatAuditTime(event.updatedAt)}</time>
                    {duration ? <><span aria-hidden="true">·</span><span>{duration}</span></> : null}
                    {event.exitCode !== null ? <><span aria-hidden="true">·</span><span>Exit {event.exitCode}</span></> : null}
                  </footer>
                </div>
              </article>
            );
          })
        ) : (
          <div className="feature-empty-state feature-empty-state--compact audit-empty-state">
            <span>{counts.all === 0 ? <ShieldCheck size={23} /> : <MagnifyingGlass size={22} />}</span>
            <h2>{counts.all === 0 ? (preview ? "No simulated audit data" : "No local activity yet") : "No matching activity"}</h2>
            <p>
              {counts.all === 0
                ? preview
                  ? "Install and run GrokDesk to record real permission decisions and execution metadata."
                  : "New Grok permission decisions, tool lifecycles, and workspace command results will appear here."
                : "Try another filter or search term. Your stored history was not changed."}
            </p>
          </div>
        )}
      </section>

      {confirmClear ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="task-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-audit-title">
            <header>
              <span><Trash size={19} /></span>
              <div>
                <h2 id="clear-audit-title">Clear this workspace history?</h2>
                <p>{events.length} local permission and execution records will be removed. Tasks, transcripts, terminal output, files, and Runtime state are not affected.</p>
              </div>
            </header>
            <div className="task-delete-dialog__actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button type="button" className="danger-button" onClick={() => { onClear(); setConfirmClear(false); }}>Clear history</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
