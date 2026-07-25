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
import { useI18n } from "../i18n/I18nProvider";
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
  const { t } = useI18n();
  const setupStep = getRuntimeSetupStep(runtime);
  const runtimeReady = runtime?.available === true;
  const accountReady = setupStep === "ready";

  return (
    <main className="onboarding-panel">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <img src={appIcon} alt="" />
          <div>
            <span>GrokDesk</span>
            <h1 id="onboarding-title">{t("onboarding.title")}</h1>
            <p>{t("onboarding.description")}</p>
          </div>
        </header>

        {preview ? (
          <div className="preview-notice" role="note">
            <Info size={18} weight="fill" />
            <span>
              {t("onboarding.previewNotice")}
            </span>
          </div>
        ) : null}

        <ol className="setup-list">
          <li className={runtimeReady ? "is-complete" : "is-active"}>
            <span className="setup-list__icon">
              {runtimeReady ? <Check size={19} weight="bold" /> : <DownloadSimple size={20} />}
            </span>
            <div>
              <strong>{t("onboarding.installTitle")}</strong>
              <p>
                {runtimeReady
                  ? t("onboarding.runtimeReady", {
                      version:
                        runtime?.version || t("onboarding.officialRuntime"),
                    })
                  : t("onboarding.installDescription")}
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
                {installing
                  ? t("common.installing")
                  : setupStep === "checking"
                    ? t("common.checking")
                    : t("settings.runtime.install")}
              </button>
            ) : (
              <span className="setup-list__done">{t("common.done")}</span>
            )}
          </li>

          <li className={accountReady ? "is-complete" : runtimeReady ? "is-active" : ""}>
            <span className="setup-list__icon">
              {accountReady ? <Check size={19} weight="bold" /> : <UserCircle size={20} />}
            </span>
            <div>
              <strong>{t("onboarding.signInTitle")}</strong>
              <p>
                {t("onboarding.signInDescription.before")}{" "}
                <code>grok login --oauth</code>{" "}
                {t("onboarding.signInDescription.after")}
              </p>
            </div>
            {accountReady ? (
              <span className="setup-list__done">{t("common.done")}</span>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={!runtimeReady || signingIn}
                onClick={() => void onSignIn().catch(() => undefined)}
              >
                <ArrowSquareOut size={16} />
                {signingIn
                  ? t("onboarding.waitingOAuth")
                  : t("onboarding.signInAction")}
              </button>
            )}
          </li>

          <li>
            <span className="setup-list__icon"><CreditCard size={20} /></span>
            <div>
              <strong>{t("onboarding.subscriptionTitle")}</strong>
              <p>{t("onboarding.subscriptionDescription")}</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onManageSubscription().catch(() => undefined)}
            >
              {t("onboarding.viewPlans")} <ArrowRight size={15} />
            </button>
          </li>
        </ol>

        <footer className="onboarding-footer">
          <span>
            <ShieldCheck size={17} /> {t("onboarding.credentialNotice")}
          </span>
          <button type="button" onClick={onOpenSettings}>
            <GearSix size={15} /> {t("onboarding.openSettings")}
          </button>
        </footer>
      </section>
    </main>
  );
}
