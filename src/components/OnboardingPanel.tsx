import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  CreditCard,
  DownloadSimple,
  GearSix,
  Info,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react";
import appIcon from "../assets/grokdesk-icon.png";
import { getRuntimeSetupStep } from "../lib/runtime";
import type { RuntimeStatus } from "../types";

interface OnboardingPanelProps {
  runtime: RuntimeStatus | null;
  installing: boolean;
  signingIn: boolean;
  preview: boolean;
  onInstall: () => Promise<unknown>;
  onSignIn: () => Promise<unknown>;
  onManageSubscription: () => Promise<unknown>;
  onOpenSettings: () => void;
}

export function OnboardingPanel({
  runtime,
  installing,
  signingIn,
  preview,
  onInstall,
  onSignIn,
  onManageSubscription,
  onOpenSettings,
}: OnboardingPanelProps) {
  const setupStep = getRuntimeSetupStep(runtime);
  const runtimeReady = runtime?.available === true;
  const accountReady = setupStep === "ready";

  return (
    <main className="onboarding-panel">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <img src={appIcon} alt="" />
          <div>
            <span>GrokDesk v0.1.2</span>
            <h1 id="onboarding-title">三步开始使用 GrokDesk</h1>
            <p>
              不需要先打开终端。GrokDesk 可以安装官方 Grok Runtime，随后直接跳转到官方 OAuth 登录。
            </p>
          </div>
        </header>

        {preview ? (
          <div className="preview-notice" role="note">
            <Info size={18} weight="fill" />
            <span>
              当前是浏览器预览。下面的安装与登录只模拟界面状态，不会安装软件、访问账号或保存凭据。
            </span>
          </div>
        ) : null}

        <ol className="setup-list">
          <li className={runtimeReady ? "is-complete" : "is-active"}>
            <span className="setup-list__icon">
              {runtimeReady ? <Check size={19} weight="bold" /> : <DownloadSimple size={20} />}
            </span>
            <div>
              <strong>安装官方 Grok Runtime</strong>
              <p>
                {runtimeReady
                  ? `${runtime?.version || "Official runtime"} 已就绪`
                  : "由 xAI 官方安装脚本完成，安装日志会显示在右侧 Terminal。"}
              </p>
            </div>
            {!runtimeReady ? (
              <button
                type="button"
                className="primary-button"
                disabled={installing || setupStep === "checking"}
                onClick={() => void onInstall().catch(() => undefined)}
              >
                <DownloadSimple size={16} />
                {installing ? "正在安装…" : setupStep === "checking" ? "正在检测…" : "安装 Runtime"}
              </button>
            ) : (
              <span className="setup-list__done">已完成</span>
            )}
          </li>

          <li className={accountReady ? "is-complete" : runtimeReady ? "is-active" : ""}>
            <span className="setup-list__icon">
              {accountReady ? <Check size={19} weight="bold" /> : <UserCircle size={20} />}
            </span>
            <div>
              <strong>登录 Grok 账号</strong>
              <p>
                使用官方 <code>grok login --oauth</code> 流程；OAuth 凭据仍由官方 CLI 管理。
              </p>
            </div>
            {accountReady ? (
              <span className="setup-list__done">已完成</span>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={!runtimeReady || signingIn}
                onClick={() => void onSignIn().catch(() => undefined)}
              >
                <ArrowSquareOut size={16} />
                {signingIn ? "等待 OAuth…" : "使用 Grok 登录"}
              </button>
            )}
          </li>

          <li>
            <span className="setup-list__icon"><CreditCard size={20} /></span>
            <div>
              <strong>查看或升级订阅（可选）</strong>
              <p>打开官方 SuperGrok 页面；登录完成后可在 Settings 查看账号套餐与用量。</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onManageSubscription().catch(() => undefined)}
            >
              查看方案 <ArrowRight size={15} />
            </button>
          </li>
        </ol>

        <footer className="onboarding-footer">
          <span><ShieldCheck size={17} /> GrokDesk 不读取或保存 OAuth Token。</span>
          <button type="button" onClick={onOpenSettings}>
            <GearSix size={15} /> 打开完整设置
          </button>
        </footer>
      </section>
    </main>
  );
}
