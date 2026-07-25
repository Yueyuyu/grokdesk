import {
  DownloadSimple,
  FolderOpen,
} from "@phosphor-icons/react";
import { useI18n } from "../i18n/I18nProvider";
import type { LocalePreference, TranslationKey } from "../i18n/types";
import { isWorkspaceSelected } from "../lib/workspace";
import type {
  RuntimeLaunchProfile,
  RuntimeModelState,
  RuntimeStatus,
  ThemePreference,
} from "../types";
import type { AppUpdateController } from "../hooks/useAppUpdate";
import { AppUpdatePanel } from "./AppUpdatePanel";
import { RuntimeModelSettings } from "./RuntimeModelSettings";
import { TaskStorageSettings } from "./TaskStorageSettings";
import type { TaskStorageStatus } from "../lib/taskPersistence";

interface FeaturePanelProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  workspacePath: string;
  onChooseWorkspace: () => void;
  workspaceSwitchDisabled: boolean;
  runtime: RuntimeStatus | null;
  connected: boolean;
  installing: boolean;
  modelConfiguring: boolean;
  modelCatalogLoading: boolean;
  modelChangeDisabled: boolean;
  runtimeModelState: RuntimeModelState | null;
  runtimeProfile: RuntimeLaunchProfile | null;
  defaultRuntimeProfile: RuntimeLaunchProfile;
  taskHasConversation: boolean;
  taskStorageStatus: TaskStorageStatus;
  taskStorageNotice: string | null;
  taskCount: number;
  taskCapacity: number;
  taskStorageReady: boolean;
  preview: boolean;
  updateRestartBlocked: boolean;
  updater: AppUpdateController;
  onConnect: () => Promise<unknown>;
  onDisconnect: () => Promise<void>;
  onInstall: () => Promise<unknown>;
  onConfigureRuntimeProfile: (
    profile: RuntimeLaunchProfile,
  ) => Promise<void>;
  onRefreshRuntimeModels: () => Promise<unknown>;
  onExportTaskStore: () => Promise<boolean>;
  onRestoreTaskStore: () => Promise<boolean>;
  onRetryTaskStorage: () => Promise<void>;
}

export function FeaturePanel({
  theme,
  onThemeChange,
  workspacePath,
  onChooseWorkspace,
  workspaceSwitchDisabled,
  runtime,
  connected,
  installing,
  modelConfiguring,
  modelCatalogLoading,
  modelChangeDisabled,
  runtimeModelState,
  runtimeProfile,
  defaultRuntimeProfile,
  taskHasConversation,
  taskStorageStatus,
  taskStorageNotice,
  taskCount,
  taskCapacity,
  taskStorageReady,
  preview,
  updateRestartBlocked,
  updater,
  onConnect,
  onDisconnect,
  onInstall,
  onConfigureRuntimeProfile,
  onRefreshRuntimeModels,
  onExportTaskStore,
  onRestoreTaskStore,
  onRetryTaskStorage,
}: FeaturePanelProps) {
  const { loading: localeLoading, preference, setPreference, t } = useI18n();
  const authenticationState = connected
    ? "verified"
    : runtime?.authenticationState;
  const authenticationLabel =
    connected || authenticationState === "verified"
      ? t("runtime.auth.verified")
      : authenticationState === "configured"
        ? t("runtime.auth.configured")
        : authenticationState === "expired"
          ? t("runtime.auth.expired")
          : t("runtime.auth.missing");
  const canUseAccount = runtime?.available === true;
  const workspaceReady = isWorkspaceSelected(workspacePath);
  const canVerifyAccount =
    canUseAccount &&
    authenticationState !== "missing" &&
    authenticationState !== "expired";
  const canApplyModelToCurrent =
    canVerifyAccount && workspaceReady && !taskHasConversation;
  const localeOptions: Array<{
    value: LocalePreference;
    labelKey: TranslationKey;
  }> = [
    { value: "system", labelKey: "locale.system" },
    { value: "zh-CN", labelKey: "locale.zh-CN" },
    { value: "en", labelKey: "locale.en" },
    { value: "ja", labelKey: "locale.ja" },
    { value: "ko", labelKey: "locale.ko" },
    { value: "de", labelKey: "locale.de" },
  ];

  return (
    <main className="feature-panel feature-panel--settings">
      <header className="feature-panel__header">
        <div>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.description")}</p>
        </div>
        <span className={`version-chip ${updater.state.phase === "available" ? "version-chip--update" : ""}`}>
          GrokDesk v{updater.state.currentVersion}
        </span>
      </header>

      {preview ? (
        <div className="settings-preview-note">
          {t("settings.previewNotice")}
        </div>
      ) : null}

      <section className="settings-section">
        <h2>{t("settings.appearance")}</h2>
        <div
          className="theme-control"
          role="group"
          aria-label={t("settings.theme")}
        >
          {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
            <button type="button" key={option} className={theme === option ? "is-active" : ""} onClick={() => onThemeChange(option)}>
              {t(`settings.theme.${option}` as TranslationKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.workspace")}</h2>
        <div className="workspace-path">
          <FolderOpen size={18} />
          <span title={workspacePath || undefined}>
            {workspacePath || t("settings.workspace.empty")}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={onChooseWorkspace}
            disabled={workspaceSwitchDisabled}
          >
            {t("common.chooseFolder")}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.storage")}</h2>
        <TaskStorageSettings
          status={taskStorageStatus}
          notice={taskStorageNotice}
          taskCount={taskCount}
          taskCapacity={taskCapacity}
          storageReady={taskStorageReady}
          actionsDisabled={updateRestartBlocked}
          onExport={onExportTaskStore}
          onRestore={onRestoreTaskStore}
          onRetry={onRetryTaskStorage}
        />
      </section>

      <section className="settings-section">
        <h2>{t("locale.settingTitle")}</h2>
        <div
          className="locale-control"
          aria-busy={localeLoading ? "true" : undefined}
        >
          <label htmlFor="interface-language">
            <span>{t("locale.settingDescription")}</span>
            <select
              id="interface-language"
              value={preference}
              onChange={(event) =>
                setPreference(event.target.value as LocalePreference)
              }
            >
              {localeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          {localeLoading ? (
            <span className="locale-control__status" role="status">
              {t("locale.switching")}
            </span>
          ) : null}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.runtime")}</h2>
        <div className="runtime-summary">
          <div>
            <span className={`status-dot ${runtime?.available ? "status-dot--green" : "status-dot--amber"}`} />
            <span>
              <strong>{runtime?.version || t("settings.runtime.checking")}</strong>
              <small>
                {runtime?.executablePath || t("settings.runtime.notFound")}
              </small>
            </span>
          </div>
          <dl>
            <div>
              <dt>{t("settings.runtime.oauth")}</dt>
              <dd>{authenticationLabel}</dd>
            </div>
            <div>
              <dt>{t("settings.runtime.transport")}</dt>
              <dd>
                {connected
                  ? t("common.connected")
                  : runtime?.available
                    ? t("settings.runtime.waitingConnection")
                    : t("settings.runtime.notInstalled")}
              </dd>
            </div>
            <div>
              <dt>{t("settings.runtime.command")}</dt>
              <dd><code>grok agent stdio</code></dd>
            </div>
          </dl>
          <div className="runtime-summary__actions">
            <button
              type="button"
              className={runtime?.available ? "secondary-button" : "primary-button"}
              disabled={installing}
              onClick={() => void onInstall().catch(() => undefined)}
            >
              <DownloadSimple size={16} />
              {installing
                ? t("common.installing")
                : runtime?.available
                  ? t("settings.runtime.update")
                  : t("settings.runtime.install")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canVerifyAccount || (!connected && !workspaceReady)}
              onClick={() => void (connected ? onDisconnect() : onConnect()).catch(() => undefined)}
            >
              {connected
                ? t("settings.runtime.disconnect")
                : t("settings.runtime.connect")}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.updates")}</h2>
        <AppUpdatePanel
          preview={preview}
          restartBlocked={updateRestartBlocked}
          updater={updater}
        />
      </section>

      <section className="settings-section">
        <h2>{t("settings.models")}</h2>
        <RuntimeModelSettings
          preview={preview}
          runtimeAvailable={runtime?.available === true}
          canApplyToCurrent={canApplyModelToCurrent}
          taskHasConversation={taskHasConversation}
          loading={modelCatalogLoading}
          configuring={modelConfiguring}
          disabled={modelChangeDisabled}
          modelState={runtimeModelState}
          runtimeProfile={runtimeProfile}
          defaultRuntimeProfile={defaultRuntimeProfile}
          onConfigure={onConfigureRuntimeProfile}
          onRefresh={onRefreshRuntimeModels}
        />
      </section>

    </main>
  );
}
