import {
  ArrowClockwise,
  ArrowSquareOut,
  CreditCard,
  Info,
  UserCircle,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { buildLocalActivity, type LocalActivityDay } from "../lib/localActivity";
import { localizeTaskTitle } from "../lib/tasks";
import type {
  GrokSubscription,
  GrokTask,
  RuntimeStatus,
} from "../types";

interface AccountPanelProps {
  runtime: RuntimeStatus | null;
  subscription: GrokSubscription | null;
  connected: boolean;
  signingIn: boolean;
  subscriptionLoading: boolean;
  workspaceReady: boolean;
  preview: boolean;
  tasks: GrokTask[];
  onSignIn: () => Promise<void>;
  onVerifySubscription: () => Promise<unknown>;
  onManageSubscription: () => Promise<void>;
}

const dayActivity = (day: LocalActivityDay) =>
  day.sessions + day.userTurns + day.agentTurns;

function ActivityHeatmap({ days }: { days: LocalActivityDay[] }) {
  const { formatDate, formatNumber, t } = useI18n();
  const maximum = Math.max(1, ...days.map(dayActivity));
  const startWeekday = days[0]
    ? new Date(`${days[0].date}T00:00:00`).getDay()
    : 0;

  return (
    <div className="activity-heatmap">
      <div className="activity-heatmap__weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>
            {formatDate(new Date(2026, 6, 19 + index), {
              weekday: "narrow",
            })}
          </span>
        ))}
      </div>
      <div
        className="activity-heatmap__grid"
        role="img"
        aria-label={t("account.heatmapAria")}
      >
        {days.map((day, index) => {
          const count = dayActivity(day);
          const level =
            count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / maximum) * 4)));
          const position = startWeekday + index;
          return (
            <time
              key={day.date}
              dateTime={day.date}
              aria-hidden="true"
              className={`activity-heatmap__day activity-heatmap__day--${level}`}
              style={{
                gridColumn: Math.floor(position / 7) + 1,
                gridRow: (position % 7) + 1,
              }}
              title={t("account.heatmapDay", {
                date: formatDate(`${day.date}T00:00:00`, {
                  dateStyle: "medium",
                }),
                tasks: formatNumber(day.sessions),
                messages: formatNumber(day.userTurns + day.agentTurns),
              })}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AccountPanel({
  runtime,
  subscription,
  connected,
  signingIn,
  subscriptionLoading,
  workspaceReady,
  preview,
  tasks,
  onSignIn,
  onVerifySubscription,
  onManageSubscription,
}: AccountPanelProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const authenticationState = preview
    ? "missing"
    : connected
      ? "verified"
      : runtime?.authenticationState;
  const authenticationLabel = preview
    ? t("account.previewAuth")
    : connected || authenticationState === "verified"
      ? t("runtime.auth.verified")
      : authenticationState === "configured"
        ? t("runtime.auth.configured")
        : authenticationState === "expired"
          ? t("runtime.auth.expired")
          : t("runtime.auth.missing");
  const canUseAccount = !preview && runtime?.available === true;
  const canVerifyAccount =
    canUseAccount &&
    authenticationState !== "missing" &&
    authenticationState !== "expired";
  const accountSubscription = preview ? null : subscription;
  const subscriptionUnavailable =
    accountSubscription?.availability === "unsupported";
  const officialBillingUnavailable = preview || subscriptionUnavailable;
  const subscriptionPlaceholder = preview
    ? t("account.installedOnly")
    : subscriptionUnavailable
      ? t("account.runtimeUnavailable")
      : canVerifyAccount && !workspaceReady
        ? t("account.queryAfterWorkspace")
        : t("account.notQueried");
  const activity = useMemo(
    () => buildLocalActivity(preview ? [] : tasks),
    [preview, tasks],
  );
  const formatPeriodEnd = (value: string | null | undefined) => {
    if (!value) return t("account.notQueried");
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : formatDate(date, { dateStyle: "medium" });
  };
  const formatRecentTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? t("common.unknown")
      : formatDate(date, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  };

  return (
    <main className="feature-panel account-panel">
      <header className="feature-panel__header">
        <div>
          <h1>{t("nav.account")}</h1>
          <p>{t("account.description")}</p>
        </div>
        <span className="version-chip">GrokDesk</span>
      </header>

      {preview ? (
        <div className="settings-preview-note">
          {t("account.previewNotice")}
        </div>
      ) : null}

      <section className="settings-section account-panel__section">
        <div className="account-panel__section-heading">
          <div>
            <h2>{t("account.officialAccount")}</h2>
            <p>{t("account.credentialNotice")}</p>
          </div>
        </div>
        <div className="account-summary account-summary--wide">
          <div className="account-summary__heading">
            <span className="settings-row__icon">
              <UserCircle size={21} />
            </span>
            <span>
              <strong>{authenticationLabel}</strong>
              <small>
                {t("account.signInWith")}{" "}
                <code>grok login --oauth</code>
              </small>
            </span>
          </div>
          <dl>
            <div>
              <dt>{t("account.currentPlan")}</dt>
              <dd>{accountSubscription?.tier || subscriptionPlaceholder}</dd>
            </div>
            <div>
              <dt>{t("account.officialQuota")}</dt>
              <dd>
                {officialBillingUnavailable
                  ? subscriptionPlaceholder
                  : accountSubscription?.creditUsagePercent === null ||
                      accountSubscription?.creditUsagePercent === undefined
                    ? t("account.notQueried")
                    : t("account.creditUsed", {
                        value: formatNumber(
                          accountSubscription.creditUsagePercent / 100,
                          {
                            style: "percent",
                            maximumFractionDigits: 0,
                          },
                        ),
                      })}
              </dd>
            </div>
            <div>
              <dt>{t("account.periodEnd")}</dt>
              <dd>
                {officialBillingUnavailable
                  ? subscriptionPlaceholder
                  : formatPeriodEnd(accountSubscription?.periodEnd)}
              </dd>
            </div>
          </dl>
          {preview ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>
                {t("account.previewAuthNotice")}
              </span>
            </div>
          ) : canVerifyAccount && !workspaceReady ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>
                {t("account.workspaceNotice")}
              </span>
            </div>
          ) : accountSubscription?.message ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>{accountSubscription.message}</span>
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
              {preview
                ? t("account.signInInstalled")
                : signingIn
                  ? t("onboarding.waitingOAuth")
                  : canVerifyAccount
                    ? t("account.switchAccount")
                    : t("account.signIn")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                !canVerifyAccount || !workspaceReady || subscriptionLoading
              }
              onClick={() =>
                void onVerifySubscription().catch(() => undefined)
              }
            >
              <ArrowClockwise size={16} />
              {subscriptionLoading
                ? t("common.refreshing")
                : t("account.refresh")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void onManageSubscription().catch(() => undefined)
              }
            >
              <CreditCard size={16} />
              {t("account.manageSubscription")}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section account-panel__section">
        <div className="account-panel__section-heading">
          <div>
            <h2>{t("account.localActivity")}</h2>
            <p>{t("account.localActivityDescription")}</p>
          </div>
          <span className="local-only-chip">{t("common.localOnly")}</span>
        </div>
        <div className="activity-summary">
          <div>
            <span>{t("account.tasksWithContent")}</span>
            <strong>{formatNumber(activity.sessions)}</strong>
          </div>
          <div>
            <span>{t("account.userTurns")}</span>
            <strong>{formatNumber(activity.userTurns)}</strong>
          </div>
          <div>
            <span>{t("account.agentReplies")}</span>
            <strong>{formatNumber(activity.agentTurns)}</strong>
          </div>
          <div>
            <span>{t("account.toolRecords")}</span>
            <strong>{formatNumber(activity.toolActivities)}</strong>
          </div>
        </div>

        <div className="activity-card">
          <header>
            <div>
              <strong>{t("account.lastTwelveMonths")}</strong>
              <span>
                {t("account.activeDays", {
                  count: formatNumber(activity.activeDays),
                })}
              </span>
            </div>
            <div
              className="activity-legend"
              aria-label={t("account.activityIntensity")}
            >
              <span>{t("account.less")}</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i
                  key={level}
                  className={`activity-heatmap__day activity-heatmap__day--${level}`}
                />
              ))}
              <span>{t("account.more")}</span>
            </div>
          </header>
          <ActivityHeatmap days={activity.days} />
        </div>

        <div className="activity-table-card">
          <header>
            <strong>{t("account.recentTasks")}</strong>
            <span>{t("account.modelNotice")}</span>
          </header>
          {activity.recent.length > 0 ? (
            <div className="activity-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("context.task")}</th>
                    <th>{t("models.model")}</th>
                    <th>{t("account.turns")}</th>
                    <th>{t("task.tools")}</th>
                    <th>{t("account.lastActivity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.recent.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>
                          {localizeTaskTitle(
                            row.title,
                            t("sidebar.newTask"),
                          )}
                        </strong>
                        {row.archived ? (
                          <small>{t("common.archived")}</small>
                        ) : null}
                      </td>
                      <td>
                        <code>{row.model}</code>
                      </td>
                      <td>
                        {formatNumber(row.userTurns)} /{" "}
                        {formatNumber(row.agentTurns)}
                      </td>
                      <td>{formatNumber(row.toolActivities)}</td>
                      <td>{formatRecentTime(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="activity-table-empty">
              {preview
                ? t("account.noPreviewActivity")
                : t("account.noActivity")}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
