import {
  ArrowSquareOut,
  CheckCircle,
  Clock,
  Flask,
  MinusCircle,
  Prohibit,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  WorkspaceCommandSummary,
  WorkspaceTerminalController,
} from "../hooks/useWorkspaceTerminal";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";

interface WorkspaceTestsPanelProps {
  terminal: WorkspaceTerminalController;
  preview: boolean;
  workspaceReady: boolean;
  onOpenTerminal: () => void;
}

const getResultStatus = (result: WorkspaceCommandSummary) => {
  if (result.cancelled) return "stopped" as const;
  if (
    result.failedToStart ||
    (result.exitCode !== null && result.exitCode !== 0) ||
    (result.structuredTest?.failed ?? 0) > 0
  ) {
    return "failed" as const;
  }
  return result.structuredTest ? ("passed" as const) : ("finished" as const);
};

const statusKeys: Record<
  ReturnType<typeof getResultStatus>,
  TranslationKey
> = {
  passed: "tests.passed",
  failed: "common.failed",
  stopped: "common.stopped",
  finished: "tests.finished",
};

const ResultIcon = ({ result }: { result: WorkspaceCommandSummary }) => {
  const status = getResultStatus(result);
  if (status === "passed") return <CheckCircle size={18} weight="fill" />;
  if (status === "failed") return <WarningCircle size={18} weight="fill" />;
  if (status === "stopped") return <Prohibit size={18} weight="fill" />;
  return <MinusCircle size={18} weight="fill" />;
};

export function WorkspaceTestsPanel({
  terminal,
  preview,
  workspaceReady,
  onOpenTerminal,
}: WorkspaceTestsPanelProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) return t("tests.notReported");
    if (durationMs < 1_000) {
      return t("tests.duration.milliseconds", {
        value: formatNumber(durationMs),
      });
    }
    if (durationMs < 60_000) {
      return t("tests.duration.seconds", {
        value: formatNumber(durationMs / 1_000, {
          maximumFractionDigits: 2,
        }),
      });
    }
    return t("tests.duration.minutesSeconds", {
      minutes: formatNumber(Math.floor(durationMs / 60_000)),
      seconds: formatNumber(
        Math.round((durationMs % 60_000) / 1_000),
      ),
    });
  };
  const structuredCount = terminal.results.filter(
    (result) => result.structuredTest,
  ).length;
  const failureCount = terminal.results.filter(
    (result) => getResultStatus(result) === "failed",
  ).length;

  return (
    <div className="workspace-tests">
      <header className="workspace-tests__header">
        <span>
          <Flask size={16} />
          <strong>{t("tests.commandResults")}</strong>
        </span>
        <div>
          <span>{t("tests.structuredCount", { count: structuredCount })}</span>
          {failureCount > 0 ? (
            <span className="is-failed">
              {t("tests.failedCount", { count: failureCount })}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={terminal.clearResults}
            disabled={terminal.running || terminal.results.length === 0}
            aria-label={t("tests.clearResults")}
            title={
              terminal.running
                ? t("tests.waitBeforeClear")
                : t("tests.clearResults")
            }
          >
            <Trash size={14} />
          </button>
        </div>
      </header>
      <div className="workspace-tests__note" role="note">
        {t("tests.provenanceNotice")}
      </div>

      {terminal.results.length === 0 ? (
        <div className="workspace-tests__empty">
          <span><Flask size={24} /></span>
          <strong>{t("tests.emptyTitle")}</strong>
          <p>
            {preview
              ? t("tests.emptyPreview")
              : workspaceReady
                ? t("tests.emptyReady")
                : t("tests.emptyWorkspace")}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenTerminal}
          >
            {t("tests.openTerminal")}
          </button>
        </div>
      ) : (
        <div className="workspace-tests__list">
          {terminal.results.map((result) => {
            const status = getResultStatus(result);
            const test = result.structuredTest;
            const tabAvailable = terminal.tabs.some((tab) => tab.id === result.terminalId);
            return (
              <article
                className={`workspace-test-result workspace-test-result--${status}`}
                key={result.commandId}
              >
                <div className="workspace-test-result__status">
                  <ResultIcon result={result} />
                </div>
                <div className="workspace-test-result__body">
                  <div className="workspace-test-result__title">
                    <code title={result.command}>{result.command}</code>
                    <span className={`test-status-badge test-status-badge--${status}`}>
                      {t(statusKeys[status])}
                    </span>
                  </div>
                  <div className="workspace-test-result__meta">
                    <span>{result.terminalTitle}</span>
                    <span>
                      {formatDate(result.completedAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      {t("tests.exitCode", {
                        code: result.exitCode ?? "—",
                      })}
                    </span>
                    <span><Clock size={11} /> {formatDuration(result.durationMs)}</span>
                  </div>

                  {test ? (
                    <div className="workspace-test-result__counts">
                      <span className="test-framework">{test.framework}</span>
                      {test.passed !== null ? (
                        <span className="is-passed">
                          {t("tests.passedCount", { count: test.passed })}
                        </span>
                      ) : null}
                      {test.failed !== null ? (
                        <span className="is-failed">
                          {t("tests.failedCount", { count: test.failed })}
                        </span>
                      ) : null}
                      {test.skipped !== null ? (
                        <span>
                          {t("tests.skippedCount", { count: test.skipped })}
                        </span>
                      ) : null}
                      {test.suitesPassed !== null ? (
                        <span>
                          {t("tests.suitesPassed", {
                            count: test.suitesPassed,
                          })}
                        </span>
                      ) : null}
                      {test.suitesFailed !== null ? (
                        <span>
                          {t("tests.suitesFailed", {
                            count: test.suitesFailed,
                          })}
                        </span>
                      ) : null}
                      {test.reportedDurationMs !== null ? (
                        <span>
                          {t("tests.runnerDuration", {
                            duration: formatDuration(
                              test.reportedDurationMs,
                            ),
                          })}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="workspace-test-result__unstructured">
                      {t("tests.unstructured")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="workspace-test-result__open"
                  disabled={!tabAvailable}
                  onClick={() => {
                    terminal.setActiveTabId(result.terminalId);
                    onOpenTerminal();
                  }}
                  aria-label={t("tests.openAria", {
                    title: result.terminalTitle,
                  })}
                  title={
                    tabAvailable
                      ? t("tests.openOutput")
                      : t("tests.terminalClosed")
                  }
                >
                  <ArrowSquareOut size={15} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
