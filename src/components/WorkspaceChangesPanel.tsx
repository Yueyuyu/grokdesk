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

const changeState = (change: WorkspaceChange) =>
  change.staged && change.unstaged
    ? "Partially accepted"
    : change.staged
      ? "Accepted"
      : "Pending";

function WorkspaceEmptyState({
  workspace,
  onChooseWorkspace,
}: WorkspaceChangesPanelProps) {
  const { snapshot, loading } = workspace;
  if (workspace.error) {
    return (
      <div className="inspector-empty-state">
        <span><Warning size={23} weight="fill" /></span>
        <strong>Workspace inspection failed</strong>
        <p>{workspace.error}</p>
        <button type="button" className="secondary-button" onClick={() => void workspace.refresh()}>
          <ArrowCounterClockwise size={15} />
          Try again
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="inspector-empty-state">
        <span><SpinnerGap size={23} className="spin" /></span>
        <strong>Inspecting workspace…</strong>
        <p>Reading the selected folder and Git working tree.</p>
      </div>
    );
  }

  if (snapshot.mode === "unselected") {
    return (
      <div className="inspector-empty-state">
        <span><FolderOpen size={23} /></span>
        <strong>Choose a project folder</strong>
        <p>{snapshot.message}</p>
        <button type="button" className="primary-button" onClick={onChooseWorkspace}>
          <FolderOpen size={15} />
          Choose folder
        </button>
      </div>
    );
  }

  if (snapshot.mode === "not_git" || snapshot.mode === "preview_unavailable") {
    return (
      <div className="inspector-empty-state">
        <span><GitBranch size={23} /></span>
        <strong>{snapshot.mode === "not_git" ? "Git repository not found" : "Desktop inspection required"}</strong>
        <p>{snapshot.message}</p>
      </div>
    );
  }

  return (
    <div className="inspector-empty-state inspector-empty-state--success">
      <span><CheckCircle size={23} weight="fill" /></span>
      <strong>Working tree clean</strong>
      <p>No staged, modified, deleted, or untracked files were found.</p>
      <button type="button" className="secondary-button" onClick={() => void workspace.refresh()}>
        <ArrowCounterClockwise size={15} />
        Refresh
      </button>
    </div>
  );
}

export function WorkspaceChangesPanel({
  workspace,
  onChooseWorkspace,
}: WorkspaceChangesPanelProps) {
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

  return (
    <div className="inspector__content inspector__content--changes">
      {snapshot.mode === "preview_simulation" ? (
        <div className="workspace-preview-banner" role="note">
          <Warning size={14} />
          <span>{snapshot.message}</span>
        </div>
      ) : (
        <div className="workspace-scope-note" role="note">
          Git shows every workspace change, including edits made before this task.
        </div>
      )}

      <section className="changed-files">
        <header>
          <strong>Changed files</strong>
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
            aria-label="Refresh workspace changes"
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
                {change.originalPath ? <small>from {change.originalPath}</small> : null}
              </span>
              <em className={`file-status file-status--${statusClass(change.statusCode)}`}>
                {change.staged ? <Check size={9} weight="bold" /> : null}
                {change.statusCode}
              </em>
            </button>
          ))}
        </div>
      </section>

      <section className="diff-panel" aria-label={`Diff for ${selectedPath ?? "selected file"}`}>
        <header>
          <span title={selectedPath ?? undefined}>{selectedPath}</span>
          {selectedChange ? <em>{changeState(selectedChange)}</em> : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => void copyDiff()}
            aria-label="Copy diff"
            disabled={!diff?.patch}
          >
            <Copy size={15} />
          </button>
        </header>
        <div className="diff-code" role="region" tabIndex={0}>
          {diffLoading ? (
            <div className="diff-placeholder"><SpinnerGap size={18} className="spin" /> Loading diff…</div>
          ) : diff?.binary ? (
            <div className="diff-placeholder"><GitDiff size={18} /> Binary files cannot be previewed.</div>
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
            <div className="diff-placeholder"><GitDiff size={18} /> No textual diff is available.</div>
          )}
          {diff?.truncated ? <div className="diff-truncated">Diff preview was truncated for performance.</div> : null}
        </div>
      </section>

      <section className="change-review-bar" aria-label="Review selected change">
        <div>
          <strong>{selectedChange ? changeState(selectedChange) : "No file selected"}</strong>
          <small>Accept stages this file in Git. Revert restores HEAD or removes an untracked file.</small>
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
              Undo accept
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!selectedPath || Boolean(actionPending)}
              onClick={() => selectedPath && void workspace.stage(selectedPath)}
            >
              <Check size={14} weight="bold" />
              Accept
            </button>
          )}
          <button
            type="button"
            className="danger-button"
            disabled={!selectedPath || Boolean(actionPending)}
            onClick={() => selectedPath && setDiscardPath(selectedPath)}
          >
            <ArrowCounterClockwise size={14} />
            Revert
          </button>
        </div>
      </section>

      {discardPath ? (
        <section className="change-confirmation" role="alertdialog" aria-modal="false">
          <Warning size={18} weight="fill" />
          <div>
            <strong>Revert {discardPath}?</strong>
            <p>This permanently discards the selected working-tree change. GrokDesk cannot undo it.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setDiscardPath(null)}>Cancel</button>
          <button
            type="button"
            className="danger-button"
            disabled={actionPending === "discard"}
            onClick={async () => {
              const discarded = await workspace.discard(discardPath);
              if (discarded) setDiscardPath(null);
            }}
          >
            Revert file
          </button>
        </section>
      ) : null}

      {error ? (
        <div className="workspace-inline-message workspace-inline-message--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={workspace.clearError} aria-label="Dismiss workspace error"><X size={13} /></button>
        </div>
      ) : lastAction ? (
        <div className="workspace-inline-message" role="status">{lastAction}</div>
      ) : null}
    </div>
  );
}
