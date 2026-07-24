import {
  Archive,
  FileText,
  Flask,
  FolderOpen,
  GearSix,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Plus,
  Pulse,
  PuzzlePiece,
  ShareNetwork,
  ShieldCheck,
  SidebarSimple,
  TerminalWindow,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { searchTasks, type TaskSearchResult } from "../lib/taskSearch";
import { formatTaskTime } from "../lib/tasks";
import type { GrokTask, InspectorTab, NavigationKey } from "../types";

interface CommandPaletteProps {
  open: boolean;
  tasks: GrokTask[];
  activeTaskId: string | null;
  activeNavigation: NavigationKey;
  taskSwitchDisabled: boolean;
  workspaceReady: boolean;
  inspectorCollapsed: boolean;
  onClose: () => void;
  onOpenTask: (task: GrokTask) => void | Promise<void>;
  onCreateTask: () => void;
  onChooseWorkspace: () => void | Promise<void>;
  onNavigate: (key: NavigationKey) => void;
  onOpenInspector: (tab: InspectorTab) => void;
  onToggleInspector: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  icon: ReactNode;
  featured?: boolean;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

type PaletteEntry =
  | { id: string; kind: "command"; command: PaletteCommand; disabled: boolean }
  | { id: string; kind: "task"; result: TaskSearchResult; disabled: boolean };

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const commandMatches = (command: PaletteCommand, query: string) => {
  const normalized = normalize(query);
  if (!normalized) return true;
  return normalize(
    `${command.label} ${command.detail} ${command.keywords}`,
  ).includes(normalized);
};

export function CommandPalette({
  open,
  tasks,
  activeTaskId,
  activeNavigation,
  taskSwitchDisabled,
  workspaceReady,
  inspectorCollapsed,
  onClose,
  onOpenTask,
  onCreateTask,
  onChooseWorkspace,
  onNavigate,
  onOpenInspector,
  onToggleInspector,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "new-task",
        label: "New task",
        detail: "Start a fresh local task in this workspace",
        keywords: "create conversation thread",
        icon: <Plus size={17} />,
        featured: true,
        disabled: taskSwitchDisabled,
        run: onCreateTask,
      },
      {
        id: "choose-workspace",
        label: "Choose workspace",
        detail: "Open a different project folder",
        keywords: "folder project switch",
        icon: <FolderOpen size={17} />,
        featured: true,
        run: onChooseWorkspace,
      },
      {
        id: "navigate-tasks",
        label: "Show tasks",
        detail: "Return to the active task timeline",
        keywords: "conversation history",
        icon: <FileText size={17} />,
        run: () => onNavigate("tasks"),
      },
      {
        id: "navigate-permissions",
        label: "Open Permissions & activity",
        detail: "Review local decisions, tools, and command outcomes",
        keywords: "audit security approval history execution",
        icon: <ShieldCheck size={17} />,
        featured: true,
        run: () => onNavigate("permissions"),
      },
      {
        id: "navigate-diagnostics",
        label: "Open Diagnostics",
        detail: "Check Runtime, OAuth, ACP, workspace, Git, and MCP",
        keywords: "health doctor troubleshoot report support",
        icon: <Pulse size={17} />,
        featured: true,
        run: () => onNavigate("diagnostics"),
      },
      {
        id: "navigate-plugins",
        label: "Open Plugins",
        detail: "Manage extensions exposed by the official Runtime",
        keywords: "marketplace extension",
        icon: <PuzzlePiece size={17} />,
        run: () => onNavigate("plugins"),
      },
      {
        id: "navigate-mcp",
        label: "Open MCP",
        detail: "Inspect Runtime-provided MCP servers",
        keywords: "server tools integration",
        icon: <ShareNetwork size={17} />,
        run: () => onNavigate("mcp"),
      },
      {
        id: "navigate-account",
        label: "Open Account",
        detail: "Official login, subscription, and local GrokDesk activity",
        keywords: "profile oauth quota usage heatmap",
        icon: <UserCircle size={17} />,
        featured: true,
        run: () => onNavigate("account"),
      },
      {
        id: "navigate-settings",
        label: "Open Settings",
        detail: "Runtime, model, workspace, and appearance",
        keywords: "preferences theme model runtime",
        icon: <GearSix size={17} />,
        featured: true,
        run: () => onNavigate("settings"),
      },
      {
        id: "inspector-changes",
        label: "Open Changes inspector",
        detail: "Review Git changes from the selected workspace",
        keywords: "diff git files review",
        icon: <ListMagnifyingGlass size={17} />,
        featured: true,
        disabled: !workspaceReady,
        run: () => onOpenInspector("changes"),
      },
      {
        id: "inspector-terminal",
        label: "Open Terminal inspector",
        detail: "Show workspace commands and ACP logs",
        keywords: "shell powershell logs",
        icon: <TerminalWindow size={17} />,
        featured: true,
        disabled: !workspaceReady,
        run: () => onOpenInspector("terminal"),
      },
      {
        id: "inspector-tests",
        label: "Open Tests inspector",
        detail: "Review structured results from real terminal output",
        keywords: "vitest cargo jest node results failures",
        icon: <Flask size={17} />,
        featured: true,
        disabled: !workspaceReady,
        run: () => onOpenInspector("tests"),
      },
      {
        id: "inspector-context",
        label: "Open Context inspector",
        detail: "Inspect the active local task context",
        keywords: "session workspace context",
        icon: <SidebarSimple size={17} />,
        disabled: !workspaceReady,
        run: () => onOpenInspector("context"),
      },
      {
        id: "toggle-inspector",
        label: inspectorCollapsed ? "Show inspector" : "Collapse inspector",
        detail: inspectorCollapsed
          ? "Restore the right-hand workspace inspector"
          : "Give the task timeline more room",
        keywords: "right panel sidebar hide reveal",
        icon: <SidebarSimple size={17} />,
        run: onToggleInspector,
      },
    ],
    [
      inspectorCollapsed,
      onChooseWorkspace,
      onCreateTask,
      onNavigate,
      onOpenInspector,
      onToggleInspector,
      taskSwitchDisabled,
      workspaceReady,
    ],
  );

  const commandEntries = useMemo(
    () =>
      open
        ? commands
            .filter((command) =>
              deferredQuery.trim()
                ? commandMatches(command, deferredQuery)
                : command.featured,
            )
            .map(
              (command): PaletteEntry => ({
                id: `command-${command.id}`,
                kind: "command",
                command,
                disabled: command.disabled === true,
              }),
            )
        : [],
    [commands, deferredQuery, open],
  );
  const taskEntries = useMemo(
    () =>
      (open
        ? searchTasks(
            tasks,
            deferredQuery,
            deferredQuery.trim() ? 16 : 6,
          )
        : []
      ).map(
        (result): PaletteEntry => ({
          id: `task-${result.task.id}`,
          kind: "task",
          result,
          disabled: taskSwitchDisabled,
        }),
      ),
    [deferredQuery, open, taskSwitchDisabled, tasks],
  );
  const entries = useMemo(
    () => [...commandEntries, ...taskEntries],
    [commandEntries, taskEntries],
  );

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    setQuery("");
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = entries.findIndex((entry) => !entry.disabled);
    setActiveIndex(firstEnabled < 0 ? 0 : firstEnabled);
  }, [entries, open]);

  useEffect(() => {
    document
      .getElementById(`command-palette-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const runEntry = (entry: PaletteEntry | undefined) => {
    if (!entry || entry.disabled) return;
    onClose();
    if (entry.kind === "command") {
      void entry.command.run();
      return;
    }
    void onOpenTask(entry.result.task);
  };

  const moveSelection = (direction: 1 | -1) => {
    if (entries.length === 0) return;
    let next = activeIndex;
    for (let attempt = 0; attempt < entries.length; attempt += 1) {
      next = (next + direction + entries.length) % entries.length;
      if (!entries[next].disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const renderEntry = (entry: PaletteEntry, index: number) => {
    const selected = index === activeIndex;
    const optionId = `command-palette-option-${index}`;
    if (entry.kind === "command") {
      return (
        <button
          type="button"
          id={optionId}
          key={entry.id}
          className={`command-palette__option ${selected ? "is-selected" : ""}`}
          role="option"
          aria-selected={selected}
          disabled={entry.disabled}
          onMouseMove={() => setActiveIndex(index)}
          onClick={() => runEntry(entry)}
        >
          <span className="command-palette__icon">{entry.command.icon}</span>
          <span className="command-palette__copy">
            <strong>{entry.command.label}</strong>
            <small>{entry.command.detail}</small>
          </span>
          {entry.command.id === `navigate-${activeNavigation}` ? (
            <span className="command-palette__badge">Current</span>
          ) : null}
        </button>
      );
    }

    const { task } = entry.result;
    return (
      <button
        type="button"
        id={optionId}
        key={entry.id}
        className={`command-palette__option ${selected ? "is-selected" : ""}`}
        role="option"
        aria-selected={selected}
        disabled={entry.disabled}
        onMouseMove={() => setActiveIndex(index)}
        onClick={() => runEntry(entry)}
      >
        <span className="command-palette__icon">
          {task.archivedAt ? <Archive size={17} /> : <FileText size={17} />}
        </span>
        <span className="command-palette__copy">
          <strong>{task.title}</strong>
          <small>
            <span>{entry.result.label}</span>
            <span aria-hidden="true">·</span>
            <span>{entry.result.snippet}</span>
          </small>
        </span>
        <span className="command-palette__meta">
          {task.id === activeTaskId ? <span className="command-palette__badge">Open</span> : null}
          {task.archivedAt ? <span className="command-palette__badge">Archived</span> : null}
          <time>{formatTaskTime(task.archivedAt || task.updatedAt)}</time>
        </span>
      </button>
    );
  };

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && event.target !== inputRef.current) {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="command-palette-title" className="sr-only">
          Search tasks or run a command
        </h2>
        <label className="command-palette__search">
          <MagnifyingGlass size={19} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search tasks or run a command…"
            aria-label="Search tasks or run a command"
            aria-controls="command-palette-results"
            aria-activedescendant={
              entries[activeIndex]
                ? `command-palette-option-${activeIndex}`
                : undefined
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                runEntry(entries[activeIndex]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={13} />
            </button>
          ) : (
            <kbd>Esc</kbd>
          )}
        </label>

        <div
          id="command-palette-results"
          className="command-palette__results"
          role="listbox"
          aria-label="Command and task results"
        >
          {commandEntries.length > 0 ? (
            <div className="command-palette__group" role="group" aria-label="Commands">
              <h3>{query ? "Commands" : "Quick actions"}</h3>
              {commandEntries.map((entry, index) => renderEntry(entry, index))}
            </div>
          ) : null}
          {taskEntries.length > 0 ? (
            <div className="command-palette__group" role="group" aria-label="Tasks">
              <h3>{query ? "Tasks in this workspace" : "Recent tasks"}</h3>
              {taskEntries.map((entry, index) =>
                renderEntry(entry, commandEntries.length + index),
              )}
            </div>
          ) : null}
          {entries.length === 0 ? (
            <div className="command-palette__empty">
              <MagnifyingGlass size={20} />
              <strong>No matching command or local task</strong>
              <span>Search covers saved tasks in the current workspace, including archives.</span>
            </div>
          ) : null}
        </div>

        <footer className="command-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
          <strong>Local workspace only</strong>
        </footer>
      </section>
    </div>
  );
}
