import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { AppUpdateController } from "../hooks/useAppUpdate";
import { formatUpdateSize } from "../lib/appUpdate";

interface AppUpdatePanelProps {
  preview: boolean;
  restartBlocked: boolean;
  updater: AppUpdateController;
}

type Confirmation = "download" | "install" | null;

const formatCheckedAt = (value: string | null) => {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export function AppUpdatePanel({
  preview,
  restartBlocked,
  updater,
}: AppUpdatePanelProps) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const { state } = updater;
  const checking = state.phase === "checking";
  const downloading = state.phase === "downloading";
  const installing =
    state.phase === "installing" || state.phase === "restarting";
  const updateKnown = Boolean(state.availableVersion);
  const downloaded = state.phase === "downloaded";
  const downloadedLabel = state.progress.totalBytes
    ? `${formatUpdateSize(state.progress.downloadedBytes)} / ${formatUpdateSize(state.progress.totalBytes)}`
    : state.progress.downloadedBytes > 0
      ? formatUpdateSize(state.progress.downloadedBytes)
      : "Preparing signed package…";

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
            Updates are verified with GrokDesk&apos;s dedicated updater signature.
          </small>
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Check for GrokDesk updates"
          title="Check for updates"
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
            <strong>No simulated updates</strong>
            <small>
              Browser preview never invents a release, signature, download, or installation result. Open the installed desktop app to check GitHub Releases.
            </small>
          </span>
        </div>
      ) : state.phase === "current" ? (
        <div className="app-update__message app-update__message--success">
          <CheckCircle size={17} weight="fill" />
          <span>
            <strong>You&apos;re up to date</strong>
            <small>Last checked {formatCheckedAt(state.checkedAt)}.</small>
          </span>
        </div>
      ) : state.phase === "error" ? (
        <div className="app-update__message app-update__message--error">
          <WarningCircle size={17} weight="fill" />
          <span>
            <strong>Update check needs attention</strong>
            <small>{state.error}</small>
          </span>
        </div>
      ) : updateKnown ? (
        <>
          <div className="app-update__release">
            <div>
              <span className="status-dot status-dot--blue" />
              <span>
                <strong>GrokDesk {state.availableVersion} is available</strong>
                <small>
                  Checked {formatCheckedAt(state.checkedAt)}
                  {state.publishedAt
                    ? ` · published ${new Date(state.publishedAt).toLocaleDateString()}`
                    : ""}
                </small>
              </span>
            </div>
            {state.notes ? <p>{state.notes}</p> : null}
          </div>

          {downloading ? (
            <div className="app-update__progress" aria-live="polite">
              <div>
                <span>Downloading signed update</span>
                <strong>
                  {state.progress.percent !== null
                    ? `${state.progress.percent}%`
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
                <strong>Verified update is ready</strong>
                <small>
                  Installation closes GrokDesk and restarts into {state.availableVersion}.
                </small>
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="app-update__message">
          <ArrowClockwise size={17} className={checking ? "spin" : undefined} />
          <span>
            <strong>{checking ? "Checking GitHub Releases…" : "Automatic update check"}</strong>
            <small>
              GrokDesk checks metadata automatically, but never downloads, installs, or restarts without confirmation.
            </small>
          </span>
        </div>
      )}

      {confirmation ? (
        <div className="app-update__confirmation" role="alert">
          <span>
            <strong>
              {confirmation === "download"
                ? `Download GrokDesk ${state.availableVersion}?`
                : `Install GrokDesk ${state.availableVersion} and restart now?`}
            </strong>
            <small>
              {confirmation === "download"
                ? "The package must pass the updater signature check before it can be installed."
                : "Save any terminal work first. The application will close during installation."}
            </small>
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmation(null)}
            >
              Cancel
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
              {confirmation === "download" ? "Confirm download" : "Install & restart"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-update__actions">
        <small>
          {restartBlocked
            ? "Finish running Grok tasks, permissions, and terminal commands before installing."
            : "Download and restart always require separate confirmation."}
        </small>
        {installing ? (
          <button
            type="button"
            className="primary-button"
            disabled
          >
            {state.phase === "restarting" ? "Restarting…" : "Installing…"}
          </button>
        ) : downloaded ? (
          <button
            type="button"
            className="primary-button"
            disabled={restartBlocked || installing}
            onClick={() => setConfirmation("install")}
          >
            {installing ? "Installing…" : "Install & restart"}
          </button>
        ) : updateKnown ? (
          <button
            type="button"
            className="primary-button"
            disabled={downloading || installing}
            onClick={() => setConfirmation("download")}
          >
            <DownloadSimple size={15} />
            {downloading ? "Downloading…" : "Download update"}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={preview || checking}
            onClick={() => void updater.checkForUpdates()}
          >
            <ArrowClockwise size={15} className={checking ? "spin" : undefined} />
            {checking ? "Checking…" : "Check now"}
          </button>
        )}
      </div>
    </div>
  );
}
