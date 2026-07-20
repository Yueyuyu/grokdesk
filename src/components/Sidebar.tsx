import {
  CaretDown,
  Check,
  FileText,
  GearSix,
  PuzzlePiece,
  ShareNetwork,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import avatar from "../assets/alex-chen.png";
import appIcon from "../assets/grokdesk-icon.png";
import { taskGroups } from "../data/demo";
import type { NavigationKey, RuntimeStatus } from "../types";

const navItems = [
  { id: "tasks" as const, label: "Tasks", icon: FileText, count: 3 },
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
}

export function Sidebar({
  active,
  onNavigate,
  workspaceLabel,
  onChooseWorkspace,
  runtime,
  statusText,
  onStatusClick,
}: SidebarProps) {
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
          {navItems.map(({ id, label, icon: Icon, count }) => (
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
              {count ? <span className="nav-row__count">{count}</span> : null}
            </button>
          ))}
        </nav>
      </div>

      <div className="task-history" aria-label="Recent tasks">
        {taskGroups.map((group) => (
          <section key={group.label} className="task-group">
            <h2>{group.label}</h2>
            {group.items.map((item) => (
              <button
                type="button"
                key={item.title}
                className={`task-row ${item.selected ? "is-selected" : ""}`}
                onClick={() => onNavigate("tasks")}
              >
                <span className="task-row__title">{item.title}</span>
                <span className="task-row__meta">
                  {item.time}
                  {item.running ? <span className="status-dot status-dot--blue" /> : null}
                  {item.complete ? <Check size={13} weight="bold" /> : null}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>

      <div className="sidebar__bottom">
        <button type="button" className="profile-row" onClick={() => onNavigate("settings")}>
          <img src={avatar} alt="Alex Chen" />
          <span>
            <strong>Alex Chen</strong>
            <small>Grok OAuth</small>
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
