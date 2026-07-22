import {
  CaretDown,
  Check,
  DotsThree,
  FileText,
  GearSix,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PuzzlePiece,
  ShareNetwork,
  SlidersHorizontal,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import appIcon from "../assets/grokdesk-icon.png";
import { filterTasks, formatTaskTime, groupTasks } from "../lib/tasks";
import type { GrokTask, NavigationKey, RuntimeStatus } from "../types";

const navItems = [
  { id: "tasks" as const, label: "Tasks", icon: FileText },
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
  activeTaskId: string | null;
  taskSwitchDisabled: boolean;
  onCreateTask: () => void;
  onSelectTask: (taskId: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
}

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
  activeTaskId,
  taskSwitchDisabled,
  onCreateTask,
  onSelectTask,
  onRenameTask,
  onDeleteTask,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<GrokTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const filteredTasks = useMemo(
    () => filterTasks(tasks, deferredQuery),
    [deferredQuery, tasks],
  );
  const taskGroups = groupTasks(filteredTasks);

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
                <span className="nav-row__count">{tasks.length}</span>
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
      </div>

      <div className="task-history" aria-label="Recent tasks">
        <label className="task-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
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
            {group.tasks.map((task) => (
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
                      onSelectTask(task.id);
                    }}
                    disabled={taskSwitchDisabled && task.id !== activeTaskId}
                    aria-current={task.id === activeTaskId ? "page" : undefined}
                  >
                    <span className="task-row__title">{task.title}</span>
                    <span className="task-row__meta">
                      {formatTaskTime(task.updatedAt)}
                      {task.status === "running" ? (
                        <span className="status-dot status-dot--blue" />
                      ) : null}
                      {task.status === "complete" ? (
                        <Check size={13} weight="bold" />
                      ) : null}
                      {task.status === "error" ? (
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
                    <button type="button" role="menuitem" onClick={() => beginRename(task)}>
                      <PencilSimple size={13} /> Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
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
            ))}
          </section>
        ))}
        {query && filteredTasks.length === 0 ? (
          <div className="task-search-empty">No tasks match “{query}”.</div>
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
    </aside>
  );
}
