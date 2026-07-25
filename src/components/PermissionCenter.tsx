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
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import {
  AUDIT_RETENTION_DAYS,
  MAX_AUDIT_EVENTS,
} from "../lib/audit";
import {
  isFallbackRuntimeTool,
  runtimeToolActionTranslationKey,
} from "../lib/localizedRuntimeUi";
import { localizeTaskTitle } from "../lib/tasks";
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

const filters: Array<{ id: AuditFilter; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "permissions.allActivity" },
  { id: "permission", labelKey: "nav.permissions" },
  { id: "tool", labelKey: "permissions.grokTools" },
  { id: "command", labelKey: "permissions.commands" },
];

const statusLabelKeys: Record<AuditEventStatus, TranslationKey> = {
  pending: "common.pending",
  running: "common.running",
  allowed: "permissions.allowed",
  denied: "common.denied",
  cancelled: "permissions.cancelled",
  succeeded: "permissions.succeeded",
  failed: "common.failed",
  stopped: "common.stopped",
  interrupted: "common.interrupted",
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

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
  const { formatDate, formatNumber, t } = useI18n();
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const taskTitles = useMemo(
    () =>
      new Map(
        tasks.map((task) => [
          task.id,
          localizeTaskTitle(task.title, t("sidebar.newTask")),
        ]),
      ),
    [t, tasks],
  );
  const formatAuditTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : formatDate(date, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  };
  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) return null;
    if (durationMs < 1_000) {
      return t("tests.duration.milliseconds", {
        value: formatNumber(durationMs),
      });
    }
    if (durationMs < 60_000) {
      return t("tests.duration.seconds", {
        value: formatNumber(durationMs / 1_000, {
          maximumFractionDigits: 1,
        }),
      });
    }
    return t("tests.duration.minutesSeconds", {
      minutes: formatNumber(Math.floor(durationMs / 60_000)),
      seconds: formatNumber(
        Math.round((durationMs % 60_000) / 1_000),
      ),
    });
  };
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
        `${event.title} ${event.detail} ${t(statusLabelKeys[event.status])} ${taskTitle}`,
      ).includes(normalizedQuery);
    });
  }, [deferredQuery, events, filter, t, taskTitles]);

  if (!workspaceReady) {
    return (
      <main className="feature-panel permission-center">
        <header className="feature-panel__header permission-center__header">
          <span className="feature-panel__icon"><ShieldCheck size={22} /></span>
          <div>
            <h1>{t("permissions.title")}</h1>
            <p>{t("permissions.workspaceDescription")}</p>
          </div>
        </header>
        <div className="feature-empty-state">
          <span><FolderOpen size={23} /></span>
          <h2>{t("permissions.chooseWorkspaceTitle")}</h2>
          <p>{t("permissions.chooseWorkspaceDescription")}</p>
          <button
            type="button"
            className="primary-button"
            onClick={onChooseWorkspace}
          >
            {t("common.chooseFolder")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="feature-panel permission-center">
      <header className="feature-panel__header permission-center__header">
        <span className="feature-panel__icon"><ShieldCheck size={22} /></span>
        <div>
          <h1>{t("permissions.title")}</h1>
          <p>{t("permissions.description")}</p>
        </div>
        <span className="version-chip">
          {t("permissions.retention", {
            days: formatNumber(AUDIT_RETENTION_DAYS),
          })}
        </span>
      </header>

      {preview ? (
        <div className="settings-preview-note permission-center__preview-note">
          {t("permissions.previewNotice")}
        </div>
      ) : null}

      <section
        className="audit-summary"
        aria-label={t("permissions.activitySummary")}
      >
        <div>
          <span>{t("permissions.totalRecords")}</span>
          <strong>{formatNumber(counts.all)}</strong>
        </div>
        <div>
          <span>{t("nav.permissions")}</span>
          <strong>{formatNumber(counts.permission)}</strong>
        </div>
        <div>
          <span>{t("permissions.inProgress")}</span>
          <strong>{formatNumber(counts.active)}</strong>
        </div>
        <div className={counts.attention > 0 ? "has-attention" : ""}>
          <span>{t("permissions.needsAttention")}</span>
          <strong>{formatNumber(counts.attention)}</strong>
        </div>
      </section>

      <section className="audit-privacy-note">
        <Info size={16} />
        <span>
          {t("permissions.privacyNotice", {
            count: formatNumber(MAX_AUDIT_EVENTS),
          })}
        </span>
      </section>

      <div className="audit-toolbar">
        <div
          className="extension-tabs"
          role="tablist"
          aria-label={t("permissions.activityType")}
        >
          {filters.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id)}
            >
              {t(item.labelKey)}
              <span>{formatNumber(counts[item.id])}</span>
            </button>
          ))}
        </div>
        <label className="extension-search audit-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("permissions.search")}
            aria-label={t("permissions.searchLocal")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("permissions.clearSearch")}
            >
              <X size={12} />
            </button>
          ) : <span />}
        </label>
        <button
          type="button"
          className="secondary-button audit-clear-button"
          disabled={events.length === 0 || clearDisabled}
          onClick={() => setConfirmClear(true)}
        >
          <Trash size={14} /> {t("permissions.clearHistory")}
        </button>
      </div>

      <section
        className="audit-list"
        aria-label={t("permissions.localHistory")}
      >
        {visibleEvents.length > 0 ? (
          visibleEvents.map((event) => {
            const duration = formatDuration(event.durationMs);
            const taskTitle = event.taskId ? taskTitles.get(event.taskId) : null;
            const toolActionKey =
              event.kind === "tool"
                ? runtimeToolActionTranslationKey(event.detail)
                : null;
            const eventTitle =
              event.kind === "tool" && isFallbackRuntimeTool(event.title)
                ? t("runtime.tool.fallback")
                : event.title;
            const eventDetail = toolActionKey
              ? t(toolActionKey)
              : event.detail;
            return (
              <article className="audit-event" key={event.id}>
                <span className={`audit-event__icon audit-event__icon--${event.kind}`}><EventIcon kind={event.kind} /></span>
                <div className="audit-event__body">
                  <div className="audit-event__heading">
                    <strong title={eventTitle}>{eventTitle}</strong>
                    <span className={`audit-status audit-status--${event.status}`}>
                      <StatusIcon status={event.status} />
                      {t(statusLabelKeys[event.status])}
                    </span>
                  </div>
                  <p>{eventDetail}</p>
                  <footer>
                    <span>
                      {event.kind === "permission"
                        ? t("permissions.permission")
                        : event.kind === "command"
                          ? t("permissions.workspaceCommand")
                          : t("permissions.grokTool")}
                    </span>
                    {taskTitle ? <><span aria-hidden="true">·</span><span title={taskTitle}>{taskTitle}</span></> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.updatedAt}>{formatAuditTime(event.updatedAt)}</time>
                    {duration ? <><span aria-hidden="true">·</span><span>{duration}</span></> : null}
                    {event.exitCode !== null ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t("tests.exitCode", {
                            code: formatNumber(event.exitCode),
                          })}
                        </span>
                      </>
                    ) : null}
                  </footer>
                </div>
              </article>
            );
          })
        ) : (
          <div className="feature-empty-state feature-empty-state--compact audit-empty-state">
            <span>{counts.all === 0 ? <ShieldCheck size={23} /> : <MagnifyingGlass size={22} />}</span>
            <h2>
              {counts.all === 0
                ? preview
                  ? t("permissions.emptyPreviewTitle")
                  : t("permissions.emptyTitle")
                : t("permissions.noMatchTitle")}
            </h2>
            <p>
              {counts.all === 0
                ? preview
                  ? t("permissions.emptyPreviewDescription")
                  : t("permissions.emptyDescription")
                : t("permissions.noMatchDescription")}
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
                <h2 id="clear-audit-title">
                  {t("permissions.clearTitle")}
                </h2>
                <p>
                  {t("permissions.clearDescription", {
                    count: formatNumber(events.length),
                  })}
                </p>
              </div>
            </header>
            <div className="task-delete-dialog__actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmClear(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
              >
                {t("permissions.clearHistory")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
