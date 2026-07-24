import {
  DownloadSimple,
  FolderOpen,
} from "@phosphor-icons/react";
import { getAuthenticationLabel } from "../lib/runtime";
import { isWorkspaceSelected } from "../lib/workspace";
import type {
  RuntimeLaunchProfile,
  RuntimeModelState,
  RuntimeStatus,
  ThemePreference,
} from "../types";
import { RuntimeModelSettings } from "./RuntimeModelSettings";

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
  preview: boolean;
  onConnect: () => Promise<unknown>;
  onDisconnect: () => Promise<void>;
  onInstall: () => Promise<unknown>;
  onConfigureRuntimeProfile: (
    profile: RuntimeLaunchProfile,
  ) => Promise<void>;
  onRefreshRuntimeModels: () => Promise<unknown>;
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
  preview,
  onConnect,
  onDisconnect,
  onInstall,
  onConfigureRuntimeProfile,
  onRefreshRuntimeModels,
}: FeaturePanelProps) {
  const authenticationState = connected
    ? "verified"
    : runtime?.authenticationState;
  const authenticationLabel = getAuthenticationLabel(
    authenticationState,
    connected,
  );
  const canUseAccount = runtime?.available === true;
  const workspaceReady = isWorkspaceSelected(workspacePath);
  const canVerifyAccount =
    canUseAccount &&
    authenticationState !== "missing" &&
    authenticationState !== "expired";
  const canApplyModelToCurrent =
    canVerifyAccount && workspaceReady && !taskHasConversation;

  return (
    <main className="feature-panel feature-panel--settings">
      <header className="feature-panel__header">
        <div><h1>Settings</h1><p>Runtime、模型、工作区与界面偏好。</p></div>
        <span className="version-chip">GrokDesk v0.2.8</span>
      </header>

      {preview ? (
        <div className="settings-preview-note">
          浏览器预览模式：安装、OAuth 与订阅数据均为本机浏览器中的模拟状态。
        </div>
      ) : null}

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="theme-control" role="group" aria-label="Theme">
          {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
            <button type="button" key={option} className={theme === option ? "is-active" : ""} onClick={() => onThemeChange(option)}>
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Workspace</h2>
        <div className="workspace-path">
          <FolderOpen size={18} />
          <span title={workspacePath || undefined}>{workspacePath || "No project folder selected"}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={onChooseWorkspace}
            disabled={workspaceSwitchDisabled}
          >
            Choose folder
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Grok Build runtime</h2>
        <div className="runtime-summary">
          <div>
            <span className={`status-dot ${runtime?.available ? "status-dot--green" : "status-dot--amber"}`} />
            <span><strong>{runtime?.version || "Checking runtime…"}</strong><small>{runtime?.executablePath || "grok executable not found"}</small></span>
          </div>
          <dl>
            <div><dt>Official OAuth</dt><dd>{authenticationLabel}</dd></div>
            <div><dt>ACP transport</dt><dd>{connected ? "已连接" : runtime?.available ? "待连接" : "Runtime 未安装"}</dd></div>
            <div><dt>Command</dt><dd><code>grok agent stdio</code></dd></div>
          </dl>
          <div className="runtime-summary__actions">
            <button
              type="button"
              className={runtime?.available ? "secondary-button" : "primary-button"}
              disabled={installing}
              onClick={() => void onInstall().catch(() => undefined)}
            >
              <DownloadSimple size={16} />
              {installing ? "正在安装…" : runtime?.available ? "更新 Runtime" : "安装 Runtime"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canVerifyAccount || (!connected && !workspaceReady)}
              onClick={() => void (connected ? onDisconnect() : onConnect()).catch(() => undefined)}
            >
              {connected ? "断开 ACP" : "连接 ACP"}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Model & reasoning</h2>
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
