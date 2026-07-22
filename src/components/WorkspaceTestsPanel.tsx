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

interface WorkspaceTestsPanelProps {
  terminal: WorkspaceTerminalController;
  preview: boolean;
  workspaceReady: boolean;
  onOpenTerminal: () => void;
}

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return "Not reported";
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(2)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1_000)}s`;
};

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

const statusCopy = {
  passed: "Passed",
  failed: "Failed",
  stopped: "Stopped",
  finished: "Finished",
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
          <strong>Command results</strong>
        </span>
        <div>
          <span>{structuredCount} structured</span>
          {failureCount > 0 ? <span className="is-failed">{failureCount} failed</span> : null}
          <button
            type="button"
            className="icon-button"
            onClick={terminal.clearResults}
            disabled={terminal.running || terminal.results.length === 0}
            aria-label="Clear command results"
            title={terminal.running ? "Wait for background commands to finish" : "Clear results"}
          >
            <Trash size={14} />
          </button>
        </div>
      </header>
      <div className="workspace-tests__note" role="note">
        Counts are parsed only from real output in this app session. Raw terminal output is never saved.
      </div>

      {terminal.results.length === 0 ? (
        <div className="workspace-tests__empty">
          <span><Flask size={24} /></span>
          <strong>No command results yet</strong>
          <p>
            {preview
              ? "Browser preview is read-only and does not generate simulated test results."
              : workspaceReady
                ? "Run Vitest, Cargo, Jest, or Node tests from a workspace terminal to collect a structured summary."
                : "Choose a workspace, then run a test command from the Terminal inspector."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenTerminal}
          >
            Open Terminal
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
                      {statusCopy[status]}
                    </span>
                  </div>
                  <div className="workspace-test-result__meta">
                    <span>{result.terminalTitle}</span>
                    <span>{new Date(result.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>Exit {result.exitCode ?? "—"}</span>
                    <span><Clock size={11} /> {formatDuration(result.durationMs)}</span>
                  </div>

                  {test ? (
                    <div className="workspace-test-result__counts">
                      <span className="test-framework">{test.framework}</span>
                      {test.passed !== null ? <span className="is-passed">{test.passed} passed</span> : null}
                      {test.failed !== null ? <span className="is-failed">{test.failed} failed</span> : null}
                      {test.skipped !== null ? <span>{test.skipped} skipped</span> : null}
                      {test.suitesPassed !== null ? <span>{test.suitesPassed} suites passed</span> : null}
                      {test.suitesFailed !== null ? <span>{test.suitesFailed} suites failed</span> : null}
                      {test.reportedDurationMs !== null ? (
                        <span>Runner {formatDuration(test.reportedDurationMs)}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="workspace-test-result__unstructured">
                      No structured result was detected. GrokDesk does not guess from the command name or exit code.
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
                  aria-label={`Open ${result.terminalTitle}`}
                  title={tabAvailable ? "Open terminal output" : "This terminal has been closed"}
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
