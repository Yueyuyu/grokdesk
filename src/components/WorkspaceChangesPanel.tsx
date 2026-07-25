import {
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  GitDiff,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { WorkspaceChangesController } from "../hooks/useWorkspaceChanges";
import { useI18n } from "../i18n/I18nProvider";
import type { WorkspaceChange } from "../types";

interface WorkspaceChangesPanelProps {
  workspace: WorkspaceChangesController;
  onChooseWorkspace: () => void;
}

const statusClass = (status: WorkspaceChange["statusCode"]) =>
  status === "?"
    ? "untracked"
    : status === "!"
      ? "conflict"
      : status.toLowerCase();

function WorkspaceEmptyState({
  workspace,
  onChooseWorkspace,
}: WorkspaceChangesPanelProps) {
  const { t } = useI18n();
  const { snapshot, loading } = workspace;
  if (workspace.error) {
    return (
      <div className="inspector-empty-state">
        <span><Warning size={23} weight="fill" /></span>
        <strong>{t("changes.inspectionFailed")}</strong>
        <p>{workspace.error}</p>
        <button type="button" className="secondary-button" onClick={() => void workspace.refresh()}>
          <ArrowCounterClockwise size={15} />
          {t("common.retry")}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="inspector-empty-state">
        <span><SpinnerGap size={23} className="spin" /></span>
        <strong>{t("changes.inspecting")}</strong>
        <p>{t("changes.inspectingDescription")}</p>
      </div>
    );
  }

  if (snapshot.mode === "unselected") {
    return (
      <div className="inspector-empty-state">
        <span><FolderOpen size={23} /></span>
        <strong>{t("task.chooseProjectFolder")}</strong>
        <p>{t("changes.chooseWorkspaceDescription")}</p>
        <button type="button" className="primary-button" onClick={onChooseWorkspace}>
          <FolderOpen size={15} />
          {t("common.chooseFolder")}
        </button>
      </div>
    );
  }

  if (snapshot.mode === "not_git" || snapshot.mode === "preview_unavailable") {
    return (
      <div className="inspector-empty-state">
        <span><GitBranch size={23} /></span>
        <strong>
          {snapshot.mode === "not_git"
            ? t("changes.notGit")
            : t("changes.desktopRequired")}
        </strong>
        <p>
          {snapshot.mode === "not_git"
            ? t("changes.notGitDescription")
            : t("changes.desktopRequiredDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="inspector-empty-state inspector-empty-state--success">
      <span><CheckCircle size={23} weight="fill" /></span>
      <strong>{t("changes.clean")}</strong>
      <p>{t("changes.cleanDescription")}</p>
      <button type="button" className="secondary-button" onClick={() => void workspace.refresh()}>
        <ArrowCounterClockwise size={15} />
        {t("common.refresh")}
      </button>
    </div>
  );
}

export function WorkspaceChangesPanel({
  workspace,
  onChooseWorkspace,
}: WorkspaceChangesPanelProps) {
  const { t } = useI18n();
  const [discardPath, setDiscardPath] = useState<string | null>(null);
  const {
    snapshot,
    selectedPath,
    selectedChange,
    setSelectedPath,
    diff,
    diffLines,
    diffLoading,
    actionPending,
    error,
    lastAction,
  } = workspace;

  useEffect(() => setDiscardPath(null), [selectedPath]);

  if (snapshot.changes.length === 0) {
    return <WorkspaceEmptyState workspace={workspace} onChooseWorkspace={onChooseWorkspace} />;
  }

  const copyDiff = async () => {
    if (diff?.patch) await navigator.clipboard?.writeText(diff.patch);
  };
  const changeState = (change: WorkspaceChange) =>
    change.staged && change.unstaged
      ? t("changes.partiallyAccepted")
      : change.staged
        ? t("changes.accepted")
        : t("common.pending");

  return (
    <div className="inspector__content inspector__content--changes">
      {snapshot.mode === "preview_simulation" ? (
        <div className="workspace-preview-banner" role="note">
          <Warning size={14} />
          <span>{t("changes.previewNotice")}</span>
        </div>
      ) : (
        <div className="workspace-scope-note" role="note">
          {t("changes.scopeNotice")}
        </div>
      )}

      <section className="changed-files">
        <header>
          <strong>{t("changes.changedFiles")}</strong>
          <span className="count-badge">{snapshot.changes.length}</span>
          <span className="changed-files__spacer" />
          {snapshot.branch ? (
            <span className="workspace-branch" title={snapshot.repositoryRoot ?? undefined}>
              <GitBranch size={13} />
              {snapshot.branch}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => void workspace.refresh()}
            aria-label={t("changes.refreshAria")}
            disabled={workspace.loading || Boolean(actionPending)}
          >
            <ArrowCounterClockwise size={15} className={workspace.loading ? "spin" : ""} />
          </button>
        </header>
        <div className="file-list">
          {snapshot.changes.map((change) => (
            <button
              type="button"
              key={change.path}
              className={`file-row ${selectedPath === change.path ? "is-selected" : ""}`}
              onClick={() => setSelectedPath(change.path)}
              title={`${change.path} · ${changeState(change)}`}
            >
              <FileText size={15} />
              <span>
                {change.path}
                {change.originalPath ? (
                  <small>
                    {t("changes.renamedFrom", {
                      path: change.originalPath,
                    })}
                  </small>
                ) : null}
              </span>
              <em className={`file-status file-status--${statusClass(change.statusCode)}`}>
                {change.staged ? <Check size={9} weight="bold" /> : null}
                {change.statusCode}
              </em>
            </button>
          ))}
        </div>
      </section>

      <section
        className="diff-panel"
        aria-label={t("changes.diffAria", {
          path: selectedPath ?? t("changes.selectedFile"),
        })}
      >
        <header>
          <span title={selectedPath ?? undefined}>{selectedPath}</span>
          {selectedChange ? <em>{changeState(selectedChange)}</em> : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => void copyDiff()}
            aria-label={t("changes.copyDiff")}
            disabled={!diff?.patch}
          >
            <Copy size={15} />
          </button>
        </header>
        <div className="diff-code" role="region" tabIndex={0}>
          {diffLoading ? (
            <div className="diff-placeholder">
              <SpinnerGap size={18} className="spin" />{" "}
              {t("changes.loadingDiff")}
            </div>
          ) : diff?.binary ? (
            <div className="diff-placeholder">
              <GitDiff size={18} /> {t("changes.binaryDiff")}
            </div>
          ) : diffLines.length > 0 ? (
            diffLines.map((line, index) => (
              <div className={`diff-line diff-line--${line.kind}`} key={`${line.kind}-${index}`}>
                <span className="diff-number">{line.oldNumber ?? ""}</span>
                <span className="diff-number">{line.newNumber ?? ""}</span>
                <code>
                  {line.kind === "add" ? "+ " : line.kind === "remove" ? "− " : "  "}
                  {line.content}
                </code>
              </div>
            ))
          ) : (
            <div className="diff-placeholder">
              <GitDiff size={18} /> {t("changes.noDiff")}
            </div>
          )}
          {diff?.truncated ? (
            <div className="diff-truncated">{t("changes.diffTruncated")}</div>
          ) : null}
        </div>
      </section>

      <section
        className="change-review-bar"
        aria-label={t("changes.reviewSelected")}
      >
        <div>
          <strong>
            {selectedChange
              ? changeState(selectedChange)
              : t("changes.noFileSelected")}
          </strong>
          <small>{t("changes.reviewDescription")}</small>
        </div>
        <div className="change-review-bar__actions">
          {selectedChange?.staged ? (
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(actionPending)}
              onClick={() => selectedPath && void workspace.unstage(selectedPath)}
            >
              <ArrowCounterClockwise size={14} />
              {t("changes.undoAccept")}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!selectedPath || Boolean(actionPending)}
              onClick={() => selectedPath && void workspace.stage(selectedPath)}
            >
              <Check size={14} weight="bold" />
              {t("changes.accept")}
            </button>
          )}
          <button
            type="button"
            className="danger-button"
            disabled={!selectedPath || Boolean(actionPending)}
            onClick={() => selectedPath && setDiscardPath(selectedPath)}
          >
            <ArrowCounterClockwise size={14} />
            {t("changes.revert")}
          </button>
        </div>
      </section>

      {discardPath ? (
        <section className="change-confirmation" role="alertdialog" aria-modal="false">
          <Warning size={18} weight="fill" />
          <div>
            <strong>{t("changes.revertTitle", { path: discardPath })}</strong>
            <p>{t("changes.revertDescription")}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDiscardPath(null)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={actionPending === "discard"}
            onClick={async () => {
              const discarded = await workspace.discard(discardPath);
              if (discarded) setDiscardPath(null);
            }}
          >
            {t("changes.revertFile")}
          </button>
        </section>
      ) : null}

      {error ? (
        <div className="workspace-inline-message workspace-inline-message--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={workspace.clearError}
            aria-label={t("changes.dismissError")}
          >
            <X size={13} />
          </button>
        </div>
      ) : lastAction ? (
        <div className="workspace-inline-message" role="status">{lastAction}</div>
      ) : null}
    </div>
  );
}
