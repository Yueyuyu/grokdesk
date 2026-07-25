import {
  ArrowClockwise,
  CheckCircle,
  Database,
  DownloadSimple,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { formatAttachmentSize } from "../lib/attachments";
import type { TaskStorageStatus } from "../lib/taskPersistence";

interface TaskStorageSettingsProps {
  status: TaskStorageStatus;
  notice: string | null;
  taskCount: number;
  taskCapacity: number;
  storageReady: boolean;
  actionsDisabled: boolean;
  onExport: () => Promise<boolean>;
  onRestore: () => Promise<boolean>;
  onRetry: () => Promise<void>;
}

export function TaskStorageSettings({
  status,
  notice,
  taskCount,
  taskCapacity,
  storageReady,
  actionsDisabled,
  onExport,
  onRestore,
  onRetry,
}: TaskStorageSettingsProps) {
  const { formatDate, formatNumber, locale, t } = useI18n();
  const [action, setAction] = useState<"export" | "restore" | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const busy =
    actionsDisabled ||
    action !== null ||
    status.phase === "loading" ||
    status.phase === "saving";
  const atCapacity = taskCount >= taskCapacity;
  const statusKind =
    status.phase === "error" || atCapacity
      ? "error"
      : status.phase === "loading" || status.phase === "saving"
        ? "busy"
        : "saved";
  const formatSavedAt = (value: number | null) =>
    value
      ? formatDate(value, {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : t("storage.neverSaved");
  const statusMessage =
    notice ??
    (status.phase === "error"
      ? status.message
      : status.phase === "loading"
        ? t("storage.loading")
        : status.phase === "saving"
          ? t("storage.saving")
          : status.recoveredFromBackup
            ? t("storage.recoveredBackup")
            : status.recoveredFromShadow
              ? t("storage.recoveredShadow")
              : status.migratedFromLegacy
                ? t("storage.migrated")
                : status.mode === "native"
                  ? t("storage.savedNative")
                  : t("storage.savedBrowser"));

  const runAction = async (
    nextAction: "export" | "restore",
    operation: () => Promise<boolean>,
  ) => {
    setAction(nextAction);
    setFeedback(null);
    try {
      const completed = await operation();
      if (completed) {
        setFeedback({
          kind: "success",
          message:
            nextAction === "export"
              ? t("storage.exportSuccess")
              : t("storage.restoreSuccess"),
        });
      }
    } catch (cause) {
      setFeedback({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setAction(null);
    }
  };

  return (
    <div className={`task-storage-summary task-storage-summary--${statusKind}`}>
      <div className="task-storage-summary__heading">
        <span className="settings-row__icon">
          <Database size={21} />
        </span>
        <span>
          <strong>
            {status.mode === "native"
              ? t("storage.native")
              : t("storage.browser")}
          </strong>
          <small role="status" aria-live="polite">
            {statusMessage}
          </small>
        </span>
        <span
          className="task-storage-summary__state"
          aria-label={t(`storage.phase.${status.phase}`)}
        >
          {statusKind === "busy" ? (
            <SpinnerGap size={17} className="spin" />
          ) : statusKind === "error" ? (
            <WarningCircle size={17} weight="fill" />
          ) : (
            <CheckCircle size={17} weight="fill" />
          )}
        </span>
      </div>

      <dl>
        <div>
          <dt>{t("storage.allTasks")}</dt>
          <dd className={atCapacity ? "is-warning" : undefined}>
            {formatNumber(taskCount)} / {formatNumber(taskCapacity)}
          </dd>
        </div>
        <div>
          <dt>{t("storage.lastSaved")}</dt>
          <dd>{formatSavedAt(status.lastSavedAtMs)}</dd>
        </div>
        <div>
          <dt>{t("storage.size")}</dt>
          <dd>
            {status.byteLength
              ? formatAttachmentSize(status.byteLength, locale)
              : t("storage.empty")}
          </dd>
        </div>
        <div>
          <dt>{t("storage.recoveryProtection")}</dt>
          <dd>
            {status.mode === "native"
              ? t("storage.nativeProtection")
              : t("storage.browserProtection")}
          </dd>
        </div>
      </dl>

      <div className="task-storage-summary__notice">
        {t("storage.securityNotice")}
      </div>
      {feedback ? (
        <div
          className={`task-storage-summary__feedback is-${feedback.kind}`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="runtime-summary__actions">
        {status.phase === "error" ? (
          <button
            type="button"
            className="secondary-button"
            disabled={action !== null}
            onClick={() => void onRetry().catch(() => undefined)}
          >
            <ArrowClockwise size={16} />
            {t("storage.retry")}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !storageReady}
          title={
            !storageReady
              ? t("storage.exportNotReady")
              : actionsDisabled
                ? t("storage.waitForBackground")
                : undefined
          }
          onClick={() => void runAction("export", onExport)}
        >
          <DownloadSimple size={16} />
          {action === "export"
            ? t("storage.exporting")
            : t("storage.exportBackup")}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          title={
            actionsDisabled ? t("storage.waitForBackground") : undefined
          }
          onClick={() => void runAction("restore", onRestore)}
        >
          <UploadSimple size={16} />
          {action === "restore"
            ? t("storage.restoring")
            : t("storage.restoreBackup")}
        </button>
      </div>
    </div>
  );
}
