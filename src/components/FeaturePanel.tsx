import {
  ArrowSquareOut,
  ArrowClockwise,
  CreditCard,
  DownloadSimple,
  FolderOpen,
  Info,
  UserCircle,
} from "@phosphor-icons/react";
import { formatCreditUsage, getAuthenticationLabel } from "../lib/runtime";
import { isWorkspaceSelected } from "../lib/workspace";
import type { GrokSubscription, RuntimeStatus, ThemePreference } from "../types";

interface FeaturePanelProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  workspacePath: string;
  onChooseWorkspace: () => void;
  workspaceSwitchDisabled: boolean;
  runtime: RuntimeStatus | null;
  subscription: GrokSubscription | null;
  connected: boolean;
  installing: boolean;
  signingIn: boolean;
  subscriptionLoading: boolean;
  preview: boolean;
  onConnect: () => Promise<unknown>;
  onDisconnect: () => Promise<void>;
  onInstall: () => Promise<unknown>;
  onSignIn: () => Promise<void>;
  onVerifySubscription: () => Promise<unknown>;
  onManageSubscription: () => Promise<void>;
}

function formatPeriodEnd(value: string | null | undefined) {
  if (!value) return "尚未查询";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

export function FeaturePanel({
  theme,
  onThemeChange,
  workspacePath,
  onChooseWorkspace,
  workspaceSwitchDisabled,
  runtime,
  subscription,
  connected,
  installing,
  signingIn,
  subscriptionLoading,
  preview,
  onConnect,
  onDisconnect,
  onInstall,
  onSignIn,
  onVerifySubscription,
  onManageSubscription,
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
  const subscriptionUnavailable = subscription?.availability === "unsupported";
  const subscriptionPlaceholder = subscriptionUnavailable
    ? "官方 CLI 暂不提供"
    : canVerifyAccount && !workspaceReady
      ? "选择工作区后查询"
      : "尚未查询";
  const periodEnd = subscriptionUnavailable
    ? subscriptionPlaceholder
    : formatPeriodEnd(subscription?.periodEnd);

  return (
    <main className="feature-panel feature-panel--settings">
      <header className="feature-panel__header">
        <div><h1>Settings</h1><p>Runtime、Grok 账号、订阅与界面偏好。</p></div>
        <span className="version-chip">GrokDesk v0.1.9</span>
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
        <h2>Grok account & subscription</h2>
        <div className="account-summary">
          <div className="account-summary__heading">
            <span className="settings-row__icon"><UserCircle size={21} /></span>
            <span>
              <strong>{authenticationLabel}</strong>
              <small>通过官方 Grok OAuth 登录；GrokDesk 不保存 Token。</small>
            </span>
          </div>
          <dl>
            <div><dt>当前套餐</dt><dd>{subscription?.tier || subscriptionPlaceholder}</dd></div>
            <div><dt>额度用量</dt><dd>{subscriptionUnavailable ? subscriptionPlaceholder : formatCreditUsage(subscription?.creditUsagePercent ?? null)}</dd></div>
            <div><dt>本周期结束</dt><dd>{periodEnd}</dd></div>
          </dl>
          {canVerifyAccount && !workspaceReady ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>登录已完成。选择项目文件夹后，GrokDesk 会启动 ACP 并自动刷新账号信息。</span>
            </div>
          ) : subscription?.message ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>{subscription.message}</span>
            </div>
          ) : null}
          <div className="runtime-summary__actions account-summary__actions">
            <button
              type="button"
              className={canVerifyAccount ? "secondary-button" : "primary-button"}
              disabled={!canUseAccount || signingIn}
              onClick={() => void onSignIn().catch(() => undefined)}
            >
              <ArrowSquareOut size={16} />
              {signingIn
                ? "等待 OAuth…"
                : canVerifyAccount
                  ? "重新登录 / 切换账号"
                  : "使用 Grok 账号登录"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!canVerifyAccount || !workspaceReady || subscriptionLoading}
              onClick={() => void onVerifySubscription().catch(() => undefined)}
            >
              <ArrowClockwise size={16} />
              {subscriptionLoading ? "正在刷新…" : "刷新账号与订阅"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onManageSubscription().catch(() => undefined)}
            >
              <CreditCard size={16} /> 管理 / 升级订阅
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
