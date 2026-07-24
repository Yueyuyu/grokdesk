import {
  ArrowClockwise,
  ArrowSquareOut,
  CreditCard,
  Info,
  UserCircle,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { buildLocalActivity, type LocalActivityDay } from "../lib/localActivity";
import { formatCreditUsage, getAuthenticationLabel } from "../lib/runtime";
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

const formatPeriodEnd = (value: string | null | undefined) => {
  if (!value) return "尚未查询";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
};

const formatRecentTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const dayActivity = (day: LocalActivityDay) =>
  day.sessions + day.userTurns + day.agentTurns;

function ActivityHeatmap({ days }: { days: LocalActivityDay[] }) {
  const maximum = Math.max(1, ...days.map(dayActivity));
  const startWeekday = days[0]
    ? new Date(`${days[0].date}T00:00:00`).getDay()
    : 0;

  return (
    <div className="activity-heatmap">
      <div className="activity-heatmap__weekdays" aria-hidden="true">
        <span>日</span>
        <span>一</span>
        <span>二</span>
        <span>三</span>
        <span>四</span>
        <span>五</span>
        <span>六</span>
      </div>
      <div
        className="activity-heatmap__grid"
        role="img"
        aria-label="过去 12 个月的本机 GrokDesk 任务活动"
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
              title={`${day.date} · ${day.sessions} 个任务 · ${day.userTurns + day.agentTurns} 条消息`}
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
  const authenticationState = preview
    ? "missing"
    : connected
      ? "verified"
      : runtime?.authenticationState;
  const authenticationLabel = preview
    ? "浏览器预览未连接真实账号"
    : getAuthenticationLabel(authenticationState, connected);
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
    ? "仅安装版可查询"
    : subscriptionUnavailable
      ? "官方 Runtime 暂不提供"
      : canVerifyAccount && !workspaceReady
        ? "选择工作区后查询"
        : "尚未查询";
  const activity = useMemo(
    () => buildLocalActivity(preview ? [] : tasks),
    [preview, tasks],
  );

  return (
    <main className="feature-panel account-panel">
      <header className="feature-panel__header">
        <div>
          <h1>Account</h1>
          <p>官方 Grok 登录、订阅入口与本机 GrokDesk 活动。</p>
        </div>
        <span className="version-chip">GrokDesk v0.2.8</span>
      </header>

      {preview ? (
        <div className="settings-preview-note">
          浏览器预览不会读取或模拟真实账号、订阅、额度和本机活动数据。
        </div>
      ) : null}

      <section className="settings-section account-panel__section">
        <div className="account-panel__section-heading">
          <div>
            <h2>官方账号</h2>
            <p>认证由官方 CLI 管理；GrokDesk 不读取或保存 OAuth Token。</p>
          </div>
        </div>
        <div className="account-summary account-summary--wide">
          <div className="account-summary__heading">
            <span className="settings-row__icon">
              <UserCircle size={21} />
            </span>
            <span>
              <strong>{authenticationLabel}</strong>
              <small>通过官方 <code>grok login --oauth</code> 登录</small>
            </span>
          </div>
          <dl>
            <div>
              <dt>当前套餐</dt>
              <dd>{accountSubscription?.tier || subscriptionPlaceholder}</dd>
            </div>
            <div>
              <dt>官方额度</dt>
              <dd>
                {officialBillingUnavailable
                  ? subscriptionPlaceholder
                  : formatCreditUsage(
                      accountSubscription?.creditUsagePercent ?? null,
                    )}
              </dd>
            </div>
            <div>
              <dt>本周期结束</dt>
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
                浏览器预览不会执行 OAuth，也不会生成模拟账号。安装版会通过官方
                Runtime 完成登录并返回其能够提供的账号信息。
              </span>
            </div>
          ) : canVerifyAccount && !workspaceReady ? (
            <div className="account-summary__notice" role="status">
              <Info size={16} />
              <span>
                登录已完成。选择项目文件夹后，GrokDesk 会启动 ACP 并刷新 Runtime
                能够提供的账号信息。
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
                ? "安装版中使用 Grok 账号登录"
                : signingIn
                  ? "等待 OAuth…"
                  : canVerifyAccount
                    ? "重新登录 / 切换账号"
                    : "使用 Grok 账号登录"}
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
              {subscriptionLoading ? "正在刷新…" : "刷新官方账号信息"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void onManageSubscription().catch(() => undefined)
              }
            >
              <CreditCard size={16} />
              管理 / 升级订阅
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section account-panel__section">
        <div className="account-panel__section-heading">
          <div>
            <h2>本机 GrokDesk 活动</h2>
            <p>
              仅根据当前工作区已保存的任务、消息和 Tools 汇总，不代表 xAI
              官方账号总用量。
            </p>
          </div>
          <span className="local-only-chip">Local only</span>
        </div>
        <div className="activity-summary">
          <div>
            <span>有内容的任务</span>
            <strong>{activity.sessions}</strong>
          </div>
          <div>
            <span>用户轮次</span>
            <strong>{activity.userTurns}</strong>
          </div>
          <div>
            <span>Agent 回复</span>
            <strong>{activity.agentTurns}</strong>
          </div>
          <div>
            <span>Tools 记录</span>
            <strong>{activity.toolActivities}</strong>
          </div>
        </div>

        <div className="activity-card">
          <header>
            <div>
              <strong>过去 12 个月</strong>
              <span>{activity.activeDays} 个本机活动日</span>
            </div>
            <div className="activity-legend" aria-label="Activity intensity">
              <span>少</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i
                  key={level}
                  className={`activity-heatmap__day activity-heatmap__day--${level}`}
                />
              ))}
              <span>多</span>
            </div>
          </header>
          <ActivityHeatmap days={activity.days} />
        </div>

        <div className="activity-table-card">
          <header>
            <strong>近期本机任务</strong>
            <span>模型仅显示任务实际保存的 Runtime 配置</span>
          </header>
          {activity.recent.length > 0 ? (
            <div className="activity-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>模型</th>
                    <th>轮次</th>
                    <th>Tools</th>
                    <th>最后活动</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.recent.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        {row.archived ? <small>Archived</small> : null}
                      </td>
                      <td>
                        <code>{row.model}</code>
                      </td>
                      <td>
                        {row.userTurns} / {row.agentTurns}
                      </td>
                      <td>{row.toolActivities}</td>
                      <td>{formatRecentTime(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="activity-table-empty">
              {preview
                ? "浏览器预览不生成模拟活动。"
                : "当前工作区还没有可汇总的本机任务活动。"}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
