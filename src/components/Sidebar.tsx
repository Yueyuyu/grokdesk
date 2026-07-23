import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  Check,
  DotsThree,
  DownloadSimple,
  FileText,
  GearSix,
  GitFork,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Pulse,
  PuzzlePiece,
  ShareNetwork,
  ShieldCheck,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import appIcon from "../assets/grokdesk-icon.png";
import { filterTasks, formatTaskTime, groupTasks } from "../lib/tasks";
import type { GrokTask, NavigationKey, RuntimeStatus } from "../types";

const navItems = [
  { id: "tasks" as const, label: "Tasks", icon: FileText },
  { id: "permissions" as const, label: "Permissions", icon: ShieldCheck },
  { id: "diagnostics" as const, label: "Diagnostics", icon: Pulse },
  { id: "plugins" as const, label: "Plugins", icon: PuzzlePiece },
  { id: "mcp" as const, label: "MCP", icon: ShareNetwork },
  { id: "settings" as const, label: "Settings", icon: GearSix },
];

interface SidebarProps {
  active: NavigationKey;
  onNavigate: (key: NavigationKey) => void;
  workspaceLabel: string;
  onChooseWorkspace: () => void;
  workspaceSwitchDisabled: boolean;
  runtime: RuntimeStatus | null;
  statusText: string;
  onStatusClick: () => void;
  tasks: GrokTask[];
  archivedTasks: GrokTask[];
  activeTaskId: string | null;
  pendingPermissionCount: number;
  runningTaskIds: string[];
  pendingPermissionTaskIds: string[];
  attentionTaskIds: string[];
  taskSwitchDisabled: boolean;
  onCreateTask: () => void;
  onSelectTask: (taskId: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onBranchTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => Promise<void>;
  onRestoreTask: (taskId: string) => void;
  onImportTask: () => Promise<void>;
  onExportTask: (taskId: string) => Promise<void>;
}

type ExchangeAction =
  | { kind: "import" }
  | { kind: "export"; task: GrokTask };

const taskStatusLabel = (
  task: GrokTask,
  running: boolean,
  needsPermission: boolean,
  needsAttention: boolean,
) => {
  if (task.archivedAt) return "Archived";
  if (needsPermission) return "Needs permission";
  if (running) return "Running";
  if (needsAttention && task.status === "complete") return "Finished";
  if (task.status === "complete") return "Done";
  if (task.status === "error") return "Needs attention";
  return "Ready";
};

export function Sidebar({
  active,
  onNavigate,
  workspaceLabel,
  onChooseWorkspace,
  workspaceSwitchDisabled,
  runtime,
  statusText,
  onStatusClick,
  tasks,
  archivedTasks,
  activeTaskId,
  pendingPermissionCount,
  runningTaskIds,
  pendingPermissionTaskIds,
  attentionTaskIds,
  taskSwitchDisabled,
  onCreateTask,
  onSelectTask,
  onRenameTask,
  onDeleteTask,
  onBranchTask,
  onArchiveTask,
  onRestoreTask,
  onImportTask,
  onExportTask,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<GrokTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [exchangeAction, setExchangeAction] = useState<ExchangeAction | null>(null);
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const runningTaskIdSet = useMemo(
    () => new Set(runningTaskIds),
    [runningTaskIds],
  );
  const pendingPermissionTaskIdSet = useMemo(
    () => new Set(pendingPermissionTaskIds),
    [pendingPermissionTaskIds],
  );
  const attentionTaskIdSet = useMemo(
    () => new Set(attentionTaskIds),
    [attentionTaskIds],
  );
  const taskCollection = showArchived ? archivedTasks : tasks;
  const filteredTasks = useMemo(
    () => filterTasks(taskCollection, deferredQuery),
    [deferredQuery, taskCollection],
  );
  const taskGroups = showArchived
    ? [{ label: "Archived", tasks: filteredTasks }]
    : groupTasks(filteredTasks);

  const beginRename = (task: GrokTask) => {
    setRenamingTaskId(task.id);
    setRenameValue(task.title);
    setMenuTaskId(null);
  };

  const finishRename = () => {
    if (renamingTaskId && renameValue.trim()) {
      onRenameTask(renamingTaskId, renameValue);
    }
    setRenamingTaskId(null);
    setRenameValue("");
  };

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="sidebar__top">
        <p className="sidebar__section-label">Workspaces</p>
        <button
          type="button"
          className="workspace-switcher"
          onClick={onChooseWorkspace}
          disabled={workspaceSwitchDisabled}
          title="Choose a workspace"
        >
          <span className="workspace-switcher__icon">
            <img src={appIcon} alt="" />
          </span>
          <span className="workspace-switcher__label">{workspaceLabel}</span>
          <CaretDown size={14} />
        </button>

        <nav className="primary-nav" aria-label="Primary">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-row ${active === id ? "is-active" : ""}`}
              onClick={() => onNavigate(id)}
              aria-label={label}
              aria-current={active === id ? "page" : undefined}
            >
              <Icon size={19} weight="regular" />
              <span>{label}</span>
              {id === "tasks" && tasks.length > 0 ? (
                <span
                  className={`nav-row__count ${
                    runningTaskIds.length > 0
                      ? "nav-row__count--running"
                      : ""
                  }`}
                  title={
                    runningTaskIds.length > 0
                      ? `${runningTaskIds.length} Grok ${
                          runningTaskIds.length === 1 ? "task is" : "tasks are"
                        } running`
                      : `${tasks.length} local tasks`
                  }
                >
                  {runningTaskIds.length > 0
                    ? `${runningTaskIds.length} active`
                    : tasks.length}
                </span>
              ) : id === "permissions" && pendingPermissionCount > 0 ? (
                <span className="nav-row__count nav-row__count--attention">{pendingPermissionCount}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="new-task-button"
          onClick={onCreateTask}
          disabled={taskSwitchDisabled}
          aria-label="New task"
        >
          <Plus size={16} weight="bold" />
          <span>New task</span>
        </button>
        <div className="task-library-actions">
          <button
            type="button"
            onClick={() => {
              setExchangeError(null);
              setExchangeAction({ kind: "import" });
            }}
            disabled={taskSwitchDisabled}
          >
            <UploadSimple size={14} /> Import
          </button>
          <button
            type="button"
            className={showArchived ? "is-active" : ""}
            onClick={() => {
              setShowArchived((current) => !current);
              setQuery("");
              setMenuTaskId(null);
            }}
            disabled={taskSwitchDisabled || archivedTasks.length === 0}
          >
            <Archive size={14} /> Archived
            <span>{archivedTasks.length}</span>
          </button>
        </div>
      </div>

      <div className="task-history" aria-label="Recent tasks">
        <label className="task-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showArchived ? "Search archived tasks" : "Search tasks"}
            aria-label={showArchived ? "Search archived tasks" : "Search tasks"}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear task search">
              <X size={12} />
            </button>
          ) : null}
        </label>
        {taskGroups.map((group) => (
          <section key={group.label} className="task-group">
            <h2>{group.label}</h2>
            {group.tasks.map((task) => {
              const taskRunning = runningTaskIdSet.has(task.id);
              const taskNeedsPermission =
                pendingPermissionTaskIdSet.has(task.id);
              const taskNeedsAttention = attentionTaskIdSet.has(task.id);
              const taskActionLocked = taskRunning || taskNeedsPermission;
              return (
                <div
                key={task.id}
                className={`task-row ${task.id === activeTaskId ? "is-selected" : ""}`}
              >
                {renamingTaskId === task.id ? (
                  <form
                    className="task-row__rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishRename();
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      maxLength={160}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setRenamingTaskId(null);
                          setRenameValue("");
                        }
                      }}
                      aria-label={`Rename ${task.title}`}
                    />
                    <button type="submit" aria-label="Save task name"><Check size={12} /></button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="task-row__main"
                    onClick={() => {
                      setMenuTaskId(null);
                      if (task.archivedAt) {
                        onRestoreTask(task.id);
                        setShowArchived(false);
                      } else {
                        onSelectTask(task.id);
                      }
                    }}
                    disabled={taskSwitchDisabled && task.id !== activeTaskId}
                    aria-current={task.id === activeTaskId ? "page" : undefined}
                    title={task.archivedAt ? "Restore and open this task" : undefined}
                  >
                    <span className="task-row__title">{task.title}</span>
                    <span className="task-row__meta">
                      {formatTaskTime(task.archivedAt || task.updatedAt)}
                      <span>
                        {taskStatusLabel(
                          task,
                          taskRunning,
                          taskNeedsPermission,
                          taskNeedsAttention,
                        )}
                      </span>
                      {task.origin === "branch" ? (
                        <GitFork size={12} aria-label="Local branch" />
                      ) : null}
                      {task.origin === "import" ? (
                        <UploadSimple size={12} aria-label="Imported task" />
                      ) : null}
                      {taskNeedsPermission ? (
                        <WarningCircle
                          size={13}
                          weight="fill"
                          className="task-row__permission"
                        />
                      ) : taskRunning ? (
                        <span className="status-dot status-dot--blue" />
                      ) : taskNeedsAttention ? (
                        <span className="status-dot status-dot--amber" />
                      ) : task.status === "complete" ? (
                        <Check size={13} weight="bold" />
                      ) : task.status === "error" ? (
                        <WarningCircle
                          size={13}
                          weight="fill"
                          className="task-row__error"
                        />
                      ) : null}
                    </span>
                  </button>
                )}
                {renamingTaskId !== task.id ? (
                  <button
                    type="button"
                    className="task-row__more"
                    aria-label={`Task actions for ${task.title}`}
                    aria-expanded={menuTaskId === task.id}
                    disabled={taskSwitchDisabled}
                    onClick={() => setMenuTaskId((current) => current === task.id ? null : task.id)}
                  >
                    <DotsThree size={16} weight="bold" />
                  </button>
                ) : null}
                {menuTaskId === task.id ? (
                  <div className="task-row__menu" role="menu">
                    {!task.archivedAt ? (
                      <>
                        <button type="button" role="menuitem" onClick={() => beginRename(task)}>
                          <PencilSimple size={13} /> Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={taskActionLocked}
                          title={
                            taskActionLocked
                              ? "Wait for this task to finish before branching."
                              : undefined
                          }
                          onClick={() => {
                            onBranchTask(task.id);
                            setMenuTaskId(null);
                          }}
                        >
                          <GitFork size={13} /> Local branch
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onRestoreTask(task.id);
                          setShowArchived(false);
                          setMenuTaskId(null);
                        }}
                      >
                        <ArrowCounterClockwise size={13} /> Restore
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={taskActionLocked}
                      title={
                        taskActionLocked
                          ? "Wait for this task to finish before exporting."
                          : undefined
                      }
                      onClick={() => {
                        setExchangeError(null);
                        setExchangeAction({ kind: "export", task });
                        setMenuTaskId(null);
                      }}
                    >
                      <DownloadSimple size={13} /> Export JSON
                    </button>
                    {!task.archivedAt ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={taskActionLocked}
                        title={
                          taskActionLocked
                            ? "Wait for this task to finish before archiving."
                            : undefined
                        }
                        onClick={() => {
                          void onArchiveTask(task.id);
                          setMenuTaskId(null);
                        }}
                      >
                        <Archive size={13} /> Archive
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      disabled={taskActionLocked}
                      title={
                        taskActionLocked
                          ? "Wait for this task to finish before deleting."
                          : undefined
                      }
                      onClick={() => {
                        setDeleteCandidate(task);
                        setDeleteError(null);
                        setMenuTaskId(null);
                      }}
                    >
                      <Trash size={13} /> Delete
                    </button>
                  </div>
                ) : null}
                </div>
              );
            })}
          </section>
        ))}
        {query && filteredTasks.length === 0 ? (
          <div className="task-search-empty">No tasks match “{query}”.</div>
        ) : null}
        {!query && taskCollection.length === 0 ? (
          <div className="task-search-empty">
            {showArchived
              ? "No archived tasks. Archived transcripts stay on this device."
              : "Create a task or import a GrokDesk task export."}
          </div>
        ) : null}
      </div>

      <div className="sidebar__bottom">
        <button
          type="button"
          className="profile-row"
          onClick={() => onNavigate("settings")}
          aria-label="Open Grok account settings"
        >
          <img src={appIcon} alt="" />
          <span>
            <strong>Grok account</strong>
            <small>
              {runtime?.authenticationState === "verified" ||
              runtime?.authenticationState === "configured"
                ? "Manage login & subscription"
                : "Sign in & subscription"}
            </small>
          </span>
          <CaretDown size={14} />
        </button>
        <button
          type="button"
          className="runtime-row"
          onClick={onStatusClick}
          title={runtime?.version || "Inspect Grok Build runtime"}
        >
          <span
            className={`status-dot ${
              runtime?.available && runtime.authenticationState === "verified"
                ? "status-dot--green"
                : "status-dot--amber"
            }`}
          />
          <span>{statusText}</span>
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {deleteCandidate ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="task-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title">
            <header>
              <span><Trash size={19} /></span>
              <div>
                <h2 id="delete-task-title">Delete this task?</h2>
                <p>“{deleteCandidate.title}” and its locally saved transcript will be removed. The Grok CLI session itself is not deleted.</p>
              </div>
            </header>
            <div className="task-delete-dialog__actions">
              {deleteError ? <span className="task-delete-dialog__error">{deleteError}</span> : null}
              <button type="button" className="secondary-button" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button
                type="button"
                className="danger-button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDeleteTask(deleteCandidate.id);
                    setDeleteCandidate(null);
                  } catch (cause) {
                    setDeleteError(String(cause));
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                Delete task
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {exchangeAction ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="task-exchange-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-exchange-title"
          >
            <header>
              <span><ShieldCheck size={19} /></span>
              <div>
                <h2 id="task-exchange-title">
                  {exchangeAction.kind === "import" ? "Import task data?" : "Export task data?"}
                </h2>
                <p>
                  {exchangeAction.kind === "import"
                    ? "Only choose a GrokDesk JSON export you trust. It will be validated and attached to the current workspace as a new local task."
                    : `“${exchangeAction.task.title}” will be written to a JSON file that may contain private prompts, responses, file names, and workspace paths.`}
                </p>
              </div>
            </header>
            <div className="task-exchange-dialog__notice">
              <strong>Credential boundary</strong>
              <span>
                OAuth tokens, cookies, MCP headers, attachment contents, and ACP session IDs are never included. Imports cannot reconnect the source session.
              </span>
            </div>
            <div className="task-exchange-dialog__actions">
              {exchangeError ? <span className="task-delete-dialog__error">{exchangeError}</span> : null}
              <button
                type="button"
                className="secondary-button"
                disabled={exchangeBusy}
                onClick={() => setExchangeAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={exchangeBusy}
                onClick={async () => {
                  setExchangeBusy(true);
                  setExchangeError(null);
                  try {
                    if (exchangeAction.kind === "import") {
                      await onImportTask();
                      setShowArchived(false);
                    } else {
                      await onExportTask(exchangeAction.task.id);
                    }
                    setExchangeAction(null);
                  } catch (cause) {
                    setExchangeError(String(cause));
                  } finally {
                    setExchangeBusy(false);
                  }
                }}
              >
                {exchangeBusy
                  ? "Working…"
                  : exchangeAction.kind === "import"
                    ? "Choose file"
                    : "Choose location"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
