import {
  CaretDown,
  Check,
  FileText,
  GearSix,
  Plus,
  PuzzlePiece,
  ShareNetwork,
  SlidersHorizontal,
  WarningCircle,
} from "@phosphor-icons/react";
import appIcon from "../assets/grokdesk-icon.png";
import { formatTaskTime, groupTasks } from "../lib/tasks";
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
  runtime: RuntimeStatus | null;
  statusText: string;
  onStatusClick: () => void;
  tasks: GrokTask[];
  activeTaskId: string | null;
  taskSwitchDisabled: boolean;
  onCreateTask: () => void;
  onSelectTask: (taskId: string) => void;
}

export function Sidebar({
  active,
  onNavigate,
  workspaceLabel,
  onChooseWorkspace,
  runtime,
  statusText,
  onStatusClick,
  tasks,
  activeTaskId,
  taskSwitchDisabled,
  onCreateTask,
  onSelectTask,
}: SidebarProps) {
  const taskGroups = groupTasks(tasks);

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="sidebar__top">
        <p className="sidebar__section-label">Workspaces</p>
        <button
          type="button"
          className="workspace-switcher"
          onClick={onChooseWorkspace}
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
        {taskGroups.map((group) => (
          <section key={group.label} className="task-group">
            <h2>{group.label}</h2>
            {group.tasks.map((task) => (
              <button
                type="button"
                key={task.id}
                className={`task-row ${task.id === activeTaskId ? "is-selected" : ""}`}
                onClick={() => onSelectTask(task.id)}
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
            ))}
          </section>
        ))}
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
    </aside>
  );
}
