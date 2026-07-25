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
} from "../lib/diagnostics";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import {
  runDiagnostics,
  writeDiagnosticReportFile,
} from "../lib/desktop";
import type {
  DiagnosticActionKind,
  DiagnosticCheck,
  DiagnosticStatus,
  DiagnosticReport,
} from "../types";

const diagnosticStatusKeys: Record<DiagnosticStatus, TranslationKey> = {
  healthy: "diagnostics.healthy",
  attention: "diagnostics.needsAttention",
  blocked: "common.blocked",
  info: "diagnostics.optional",
};

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
  const { formatNumber, t } = useI18n();
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
  const actionLabel = (kind: DiagnosticActionKind) => {
    if (kind === "install_runtime") return t("settings.runtime.install");
    if (kind === "sign_in") return t("account.signIn");
    if (kind === "choose_workspace") return t("common.chooseWorkspace");
    if (kind === "connect_acp") return t("settings.runtime.connect");
    return t("palette.openMcp");
  };
  const localizeCheck = (check: DiagnosticCheck) => {
    if (check.id === "native-shell") {
      return {
        title: t("diagnostics.check.native.title"),
        summary: t("diagnostics.check.native.summary", {
          version: report?.appVersion ?? "",
        }),
        detail: t("diagnostics.check.native.detail"),
      };
    }
    if (check.id === "signed-updater") {
      return {
        title: t("diagnostics.check.updater.title"),
        summary: t("diagnostics.check.updater.summary"),
        detail: t("diagnostics.check.updater.detail"),
      };
    }
    if (check.id === "runtime") {
      return {
        title: t("diagnostics.check.runtime.title"),
        summary:
          check.status === "healthy"
            ? report?.runtimeVersion ?? t("diagnostics.runtimeDetected")
            : check.status === "attention"
              ? t("diagnostics.check.runtime.attention")
              : t("diagnostics.check.runtime.blocked"),
        detail:
          check.status === "healthy"
            ? t("diagnostics.check.runtime.healthyDetail")
            : check.status === "attention"
              ? t("diagnostics.check.runtime.attentionDetail")
              : t("diagnostics.check.runtime.blockedDetail"),
      };
    }
    if (check.id === "credentials") {
      const action = check.action?.kind;
      return {
        title: t("diagnostics.check.credentials.title"),
        summary:
          check.status === "healthy"
            ? t("diagnostics.check.credentials.healthy")
            : action === "install_runtime"
              ? t("diagnostics.check.credentials.runtimeMissing")
              : action === "sign_in"
                ? t("diagnostics.check.credentials.missing")
                : t("diagnostics.check.credentials.unverified"),
        detail:
          check.status === "healthy"
            ? t("diagnostics.check.credentials.healthyDetail")
            : t("diagnostics.check.credentials.detail"),
      };
    }
    if (check.id === "workspace") {
      return {
        title:
          check.status === "healthy" || check.status === "attention"
            ? t("diagnostics.check.workspaceGit.title")
            : t("diagnostics.check.workspace.title"),
        summary:
          check.status === "healthy"
            ? t("diagnostics.check.workspace.healthy")
            : check.status === "attention"
              ? t("diagnostics.check.workspace.notGit")
              : report?.workspaceSelected
                ? t("diagnostics.check.workspace.inaccessible")
                : t("diagnostics.check.workspace.missing"),
        detail:
          check.status === "healthy"
            ? t("diagnostics.check.workspace.healthyDetail")
            : check.status === "attention"
              ? t("diagnostics.check.workspace.notGitDetail")
              : t("diagnostics.check.workspace.blockedDetail"),
      };
    }
    if (check.id === "acp") {
      return {
        title: t("diagnostics.check.acp.title"),
        summary:
          check.status === "healthy"
            ? t("diagnostics.check.acp.healthy")
            : check.action?.kind === "connect_acp"
              ? t("diagnostics.check.acp.disconnected")
              : t("diagnostics.check.acp.blocked"),
        detail:
          check.status === "healthy"
            ? t("diagnostics.check.acp.healthyDetail")
            : t("diagnostics.check.acp.detail"),
      };
    }
    return {
      title: t("diagnostics.check.mcp.title"),
      summary:
        check.status === "healthy"
          ? t("diagnostics.check.mcp.healthy")
          : check.status === "info"
            ? t("diagnostics.check.mcp.empty")
            : check.status === "blocked"
              ? t("diagnostics.check.mcp.blocked")
              : t("diagnostics.check.mcp.attention"),
      detail: t("diagnostics.check.mcp.detail"),
    };
  };

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
      if (saved) setNotice(t("diagnostics.exported"));
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
          <h1>{t("nav.diagnostics")}</h1>
          <p>{t("diagnostics.description")}</p>
        </div>
        <div className="diagnostic-header-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={preview || running || exporting || !report}
            onClick={() => void exportReport()}
          >
            {exporting ? <SpinnerGap size={15} className="spin" /> : <DownloadSimple size={15} />}
            {exporting ? t("storage.exporting") : t("diagnostics.export")}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={preview || running}
            onClick={() => void run()}
          >
            <ArrowClockwise size={15} className={running ? "spin" : undefined} />
            {running ? t("common.checking") : t("diagnostics.run")}
          </button>
        </div>
      </header>

      {preview ? (
        <>
          <div className="settings-preview-note diagnostic-preview-note">
            {t("diagnostics.previewNotice")}
          </div>
          <div className="feature-empty-state">
            <span><Pulse size={23} /></span>
            <h2>{t("diagnostics.previewTitle")}</h2>
            <p>{t("diagnostics.previewDescription")}</p>
          </div>
        </>
      ) : !report && running ? (
        <div className="feature-empty-state">
          <span><SpinnerGap size={23} className="spin" /></span>
          <h2>{t("diagnostics.checkingTitle")}</h2>
          <p>{t("diagnostics.checkingDescription")}</p>
        </div>
      ) : (
        <>
          {error ? <div className="extension-inline-note extension-inline-note--error">{error}</div> : null}
          {notice ? <div className="extension-inline-note extension-inline-note--success">{notice}</div> : null}

          <section
            className="audit-summary diagnostic-summary"
            aria-label={t("diagnostics.summary")}
          >
            <div className={`diagnostic-overall diagnostic-overall--${overall}`}>
              <span>{t("diagnostics.overall")}</span>
              <strong>{t(diagnosticStatusKeys[overall])}</strong>
            </div>
            <div>
              <span>{t("diagnostics.healthy")}</span>
              <strong>{formatNumber(counts.healthy)}</strong>
            </div>
            <div className={counts.attention > 0 ? "has-attention" : ""}>
              <span>{t("diagnostics.needsAttention")}</span>
              <strong>{formatNumber(counts.attention)}</strong>
            </div>
            <div className={counts.blocked > 0 ? "has-blocked" : ""}>
              <span>{t("common.blocked")}</span>
              <strong>{formatNumber(counts.blocked)}</strong>
            </div>
          </section>

          <section className="audit-privacy-note diagnostic-privacy-note">
            <Info size={16} />
            <span>
              {t("diagnostics.privacyNotice")}
            </span>
          </section>

          <section
            className="diagnostic-list"
            aria-label={t("diagnostics.checks")}
          >
            {report?.checks.map((check) => {
              const localized = localizeCheck(check);
              return (
              <article className={`diagnostic-check diagnostic-check--${check.status}`} key={check.id}>
                <span className="diagnostic-check__icon"><StatusIcon status={check.status} /></span>
                <div className="diagnostic-check__body">
                  <div className="diagnostic-check__heading">
                    <strong>{localized.title}</strong>
                    <span className={`diagnostic-status diagnostic-status--${check.status}`}>
                      {t(diagnosticStatusKeys[check.status])}
                    </span>
                  </div>
                  <p>{localized.summary}</p>
                  <small>{localized.detail}</small>
                </div>
                {check.action ? (
                  <button
                    type="button"
                    className="secondary-button diagnostic-check__action"
                    disabled={Boolean(actionBusy) || running}
                    onClick={() => void performAction(check.id, check.action!.kind)}
                  >
                    {actionBusy === check.id ? <SpinnerGap size={14} className="spin" /> : <Wrench size={14} />}
                    {actionBusy === check.id
                      ? t("common.working")
                      : actionLabel(check.action.kind)}
                  </button>
                ) : null}
              </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
