import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { AppUpdateController } from "../hooks/useAppUpdate";
import { useI18n } from "../i18n/I18nProvider";
import { formatUpdateSize } from "../lib/appUpdate";

interface AppUpdatePanelProps {
  preview: boolean;
  restartBlocked: boolean;
  updater: AppUpdateController;
}

type Confirmation = "download" | "install" | null;

export function AppUpdatePanel({
  preview,
  restartBlocked,
  updater,
}: AppUpdatePanelProps) {
  const { formatDate, formatNumber, locale, t } = useI18n();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const { state } = updater;
  const checking = state.phase === "checking";
  const downloading = state.phase === "downloading";
  const installing =
    state.phase === "installing" || state.phase === "restarting";
  const updateKnown = Boolean(state.availableVersion);
  const downloaded = state.phase === "downloaded";
  const downloadedLabel = state.progress.totalBytes
    ? `${formatUpdateSize(state.progress.downloadedBytes, locale)} / ${formatUpdateSize(state.progress.totalBytes, locale)}`
    : state.progress.downloadedBytes > 0
      ? formatUpdateSize(state.progress.downloadedBytes, locale)
      : t("updates.preparingPackage");
  const formatCheckedAt = (value: string | null) =>
    value
      ? formatDate(value, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("updates.notChecked");

  const confirmDownload = async () => {
    setConfirmation(null);
    await updater.downloadUpdate();
  };

  const confirmInstall = async () => {
    setConfirmation(null);
    await updater.installAndRestart();
  };

  return (
    <div className="app-update">
      <div className="app-update__heading">
        <span className="app-update__icon"><ShieldCheck size={19} /></span>
        <span>
          <strong>GrokDesk {state.currentVersion}</strong>
          <small>
            {t("updates.signatureNotice")}
          </small>
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("updates.checkAria")}
          title={t("updates.check")}
          disabled={preview || checking || downloading || installing}
          onClick={() => void updater.checkForUpdates()}
        >
          <ArrowClockwise size={15} className={checking ? "spin" : undefined} />
        </button>
      </div>

      {preview ? (
        <div className="app-update__message app-update__message--preview">
          <WarningCircle size={17} />
          <span>
            <strong>{t("updates.previewTitle")}</strong>
            <small>{t("updates.previewDescription")}</small>
          </span>
        </div>
      ) : state.phase === "current" ? (
        <div className="app-update__message app-update__message--success">
          <CheckCircle size={17} weight="fill" />
          <span>
            <strong>{t("updates.current")}</strong>
            <small>
              {t("updates.lastChecked", {
                time: formatCheckedAt(state.checkedAt),
              })}
            </small>
          </span>
        </div>
      ) : state.phase === "error" ? (
        <div className="app-update__message app-update__message--error">
          <WarningCircle size={17} weight="fill" />
          <span>
            <strong>{t("updates.errorTitle")}</strong>
            <small>{state.error}</small>
          </span>
        </div>
      ) : updateKnown ? (
        <>
          <div className="app-update__release">
            <div>
              <span className="status-dot status-dot--blue" />
              <span>
                <strong>
                  {t("updates.available", {
                    version: state.availableVersion ?? "",
                  })}
                </strong>
                <small>
                  {t("updates.checked", {
                    time: formatCheckedAt(state.checkedAt),
                  })}
                  {state.publishedAt
                    ? ` · ${t("updates.published", {
                        date: formatDate(state.publishedAt, {
                          dateStyle: "medium",
                        }),
                      })}`
                    : ""}
                </small>
              </span>
            </div>
            {state.notes ? <p>{state.notes}</p> : null}
          </div>

          {downloading ? (
            <div className="app-update__progress" aria-live="polite">
              <div>
                <span>{t("updates.downloadingSigned")}</span>
                <strong>
                  {state.progress.percent !== null
                    ? formatNumber(state.progress.percent / 100, {
                        style: "percent",
                        maximumFractionDigits: 0,
                      })
                    : downloadedLabel}
                </strong>
              </div>
              <span>
                <i
                  style={{
                    width: `${state.progress.percent ?? 12}%`,
                  }}
                />
              </span>
            </div>
          ) : null}

          {downloaded ? (
            <div className="app-update__message app-update__message--success">
              <CheckCircle size={17} weight="fill" />
              <span>
                <strong>{t("updates.ready")}</strong>
                <small>
                  {t("updates.readyDescription", {
                    version: state.availableVersion ?? "",
                  })}
                </small>
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="app-update__message">
          <ArrowClockwise size={17} className={checking ? "spin" : undefined} />
          <span>
            <strong>
              {checking ? t("updates.checkingGithub") : t("updates.automatic")}
            </strong>
            <small>{t("updates.automaticDescription")}</small>
          </span>
        </div>
      )}

      {confirmation ? (
        <div className="app-update__confirmation" role="alert">
          <span>
            <strong>
              {confirmation === "download"
                ? t("updates.confirmDownloadTitle", {
                    version: state.availableVersion ?? "",
                  })
                : t("updates.confirmInstallTitle", {
                    version: state.availableVersion ?? "",
                  })}
            </strong>
            <small>
              {confirmation === "download"
                ? t("updates.confirmDownloadDescription")
                : t("updates.confirmInstallDescription")}
            </small>
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmation(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                void (confirmation === "download"
                  ? confirmDownload()
                  : confirmInstall())
              }
            >
              {confirmation === "download"
                ? t("updates.confirmDownload")
                : t("updates.installRestart")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-update__actions">
        <small>
          {restartBlocked
            ? t("updates.blockedNotice")
            : t("updates.confirmationNotice")}
        </small>
        {installing ? (
          <button
            type="button"
            className="primary-button"
            disabled
          >
            {state.phase === "restarting"
              ? t("updates.restarting")
              : t("common.installing")}
          </button>
        ) : downloaded ? (
          <button
            type="button"
            className="primary-button"
            disabled={restartBlocked || installing}
            onClick={() => setConfirmation("install")}
          >
            {installing ? t("common.installing") : t("updates.installRestart")}
          </button>
        ) : updateKnown ? (
          <button
            type="button"
            className="primary-button"
            disabled={downloading || installing}
            onClick={() => setConfirmation("download")}
          >
            <DownloadSimple size={15} />
            {downloading ? t("common.downloading") : t("updates.download")}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={preview || checking}
            onClick={() => void updater.checkForUpdates()}
          >
            <ArrowClockwise size={15} className={checking ? "spin" : undefined} />
            {checking ? t("common.checking") : t("updates.checkNow")}
          </button>
        )}
      </div>
    </div>
  );
}
