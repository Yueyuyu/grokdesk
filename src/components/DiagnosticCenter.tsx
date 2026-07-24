import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  Info,
  Pulse,
  SpinnerGap,
  WarningCircle,
  Wrench,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatDiagnosticReport,
  getDiagnosticCounts,
  getOverallDiagnosticStatus,
  diagnosticStatusLabels,
} from "../lib/diagnostics";
import {
  runDiagnostics,
  writeDiagnosticReportFile,
} from "../lib/desktop";
import type {
  DiagnosticActionKind,
  DiagnosticStatus,
  DiagnosticReport,
} from "../types";

interface DiagnosticCenterProps {
  workspacePath: string;
  connected: boolean;
  preview: boolean;
  onInstall: () => Promise<unknown>;
  onSignIn: () => Promise<void>;
  onConnect: () => Promise<unknown>;
  onChooseWorkspace: () => void | Promise<void>;
  onOpenMcp: () => void;
}

function StatusIcon({ status }: { status: DiagnosticStatus }) {
  if (status === "healthy") return <CheckCircle size={18} weight="fill" />;
  if (status === "blocked") return <XCircle size={18} weight="fill" />;
  if (status === "attention") return <WarningCircle size={18} weight="fill" />;
  return <Info size={18} weight="fill" />;
}

export function DiagnosticCenter({
  workspacePath,
  connected,
  preview,
  onInstall,
  onSignIn,
  onConnect,
  onChooseWorkspace,
  onOpenMcp,
}: DiagnosticCenterProps) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [running, setRunning] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    if (preview) return;
    const requestId = ++requestIdRef.current;
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const nextReport = await runDiagnostics(workspacePath, connected);
      if (requestId === requestIdRef.current) setReport(nextReport);
    } catch (cause) {
      if (requestId === requestIdRef.current) setError(String(cause));
    } finally {
      if (requestId === requestIdRef.current) setRunning(false);
    }
  }, [connected, preview, workspacePath]);

  useEffect(() => {
    void run();
    return () => {
      requestIdRef.current += 1;
    };
  }, [run]);

  const counts = useMemo(() => getDiagnosticCounts(report), [report]);
  const overall = getOverallDiagnosticStatus(report);

  const performAction = async (id: string, kind: DiagnosticActionKind) => {
    setActionBusy(id);
    setError(null);
    setNotice(null);
    try {
      if (kind === "install_runtime") await onInstall();
      if (kind === "sign_in") await onSignIn();
      if (kind === "choose_workspace") await onChooseWorkspace();
      if (kind === "connect_acp") await onConnect();
      if (kind === "open_mcp") {
        onOpenMcp();
        return;
      }
      await run();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setActionBusy(null);
    }
  };

  const exportReport = async () => {
    if (!report) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const content = formatDiagnosticReport(
        report,
        new Date(),
        workspacePath,
      );
      const saved = await writeDiagnosticReportFile(content);
      if (saved) setNotice("Sanitized diagnostics report exported.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="feature-panel diagnostic-center">
      <header className="feature-panel__header diagnostic-center__header">
        <span className="feature-panel__icon"><Pulse size={22} /></span>
        <div>
          <h1>Diagnostics</h1>
          <p>Check the native app, signed updater, Runtime, OAuth, ACP, workspace, Git, and MCP.</p>
        </div>
        <div className="diagnostic-header-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={preview || running || exporting || !report}
            onClick={() => void exportReport()}
          >
            {exporting ? <SpinnerGap size={15} className="spin" /> : <DownloadSimple size={15} />}
            {exporting ? "Exporting…" : "Export report"}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={preview || running}
            onClick={() => void run()}
          >
            <ArrowClockwise size={15} className={running ? "spin" : undefined} />
            {running ? "Checking…" : "Run diagnostics"}
          </button>
        </div>
      </header>

      {preview ? (
        <>
          <div className="settings-preview-note diagnostic-preview-note">
            浏览器预览不会伪造 Runtime、OAuth、ACP、工作区或 MCP 健康状态。请在安装版中运行真实诊断。
          </div>
          <div className="feature-empty-state">
            <span><Pulse size={23} /></span>
            <h2>No simulated diagnostics</h2>
            <p>The installed app runs every check locally and returns only sanitized status metadata.</p>
          </div>
        </>
      ) : !report && running ? (
        <div className="feature-empty-state">
          <span><SpinnerGap size={23} className="spin" /></span>
          <h2>Checking your local setup</h2>
          <p>Reading safe status metadata from GrokDesk and the official Runtime.</p>
        </div>
      ) : (
        <>
          {error ? <div className="extension-inline-note extension-inline-note--error">{error}</div> : null}
          {notice ? <div className="extension-inline-note extension-inline-note--success">{notice}</div> : null}

          <section className="audit-summary diagnostic-summary" aria-label="Diagnostics summary">
            <div className={`diagnostic-overall diagnostic-overall--${overall}`}>
              <span>Overall</span><strong>{diagnosticStatusLabels[overall]}</strong>
            </div>
            <div><span>Healthy</span><strong>{counts.healthy}</strong></div>
            <div className={counts.attention > 0 ? "has-attention" : ""}><span>Needs attention</span><strong>{counts.attention}</strong></div>
            <div className={counts.blocked > 0 ? "has-blocked" : ""}><span>Blocked</span><strong>{counts.blocked}</strong></div>
          </section>

          <section className="audit-privacy-note diagnostic-privacy-note">
            <Info size={16} />
            <span>
              Diagnostics reads status metadata only. Exported reports exclude prompts, responses, terminal output, attachments, absolute paths, account identifiers, OAuth tokens, cookies, and MCP names, endpoints, or headers.
            </span>
          </section>

          <section className="diagnostic-list" aria-label="Diagnostic checks">
            {report?.checks.map((check) => (
              <article className={`diagnostic-check diagnostic-check--${check.status}`} key={check.id}>
                <span className="diagnostic-check__icon"><StatusIcon status={check.status} /></span>
                <div className="diagnostic-check__body">
                  <div className="diagnostic-check__heading">
                    <strong>{check.title}</strong>
                    <span className={`diagnostic-status diagnostic-status--${check.status}`}>
                      {diagnosticStatusLabels[check.status]}
                    </span>
                  </div>
                  <p>{check.summary}</p>
                  <small>{check.detail}</small>
                </div>
                {check.action ? (
                  <button
                    type="button"
                    className="secondary-button diagnostic-check__action"
                    disabled={Boolean(actionBusy) || running}
                    onClick={() => void performAction(check.id, check.action!.kind)}
                  >
                    {actionBusy === check.id ? <SpinnerGap size={14} className="spin" /> : <Wrench size={14} />}
                    {actionBusy === check.id ? "Working…" : check.action.label}
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
