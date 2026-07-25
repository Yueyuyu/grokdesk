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
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import {
  filterTasks,
  formatTaskTime,
  groupTasks,
  localizeTaskTitle,
  type TaskGroup,
} from "../lib/tasks";
import type { GrokTask, NavigationKey, RuntimeStatus } from "../types";

const navItems = [
  { id: "tasks" as const, labelKey: "nav.tasks" as const, icon: FileText },
  {
    id: "permissions" as const,
    labelKey: "nav.permissions" as const,
    icon: ShieldCheck,
  },
  {
    id: "diagnostics" as const,
    labelKey: "nav.diagnostics" as const,
    icon: Pulse,
  },
  {
    id: "plugins" as const,
    labelKey: "nav.plugins" as const,
    icon: PuzzlePiece,
  },
  { id: "mcp" as const, labelKey: "nav.mcp" as const, icon: ShareNetwork },
  {
    id: "settings" as const,
    labelKey: "nav.settings" as const,
    icon: GearSix,
  },
];

const taskGroupLabelKeys: Record<TaskGroup["label"], TranslationKey> = {
  Today: "sidebar.group.today",
  Yesterday: "sidebar.group.yesterday",
  "This week": "sidebar.group.thisWeek",
  Earlier: "sidebar.group.earlier",
};

interface SidebarProps {
  active: NavigationKey;
  onNavigate: (key: NavigationKey) => void;
  onNavigationIntent: (key: NavigationKey) => void;
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

export function Sidebar({
  active,
  onNavigate,
  onNavigationIntent,
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
  const { locale, t } = useI18n();
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
  const localizedNewTaskTitle = t("sidebar.newTask");
  const displayTaskTitle = (task: GrokTask) =>
    localizeTaskTitle(task.title, localizedNewTaskTitle);
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
    () => {
      const matches = filterTasks(taskCollection, deferredQuery);
      const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
      if (
        !normalizedQuery ||
        !localizedNewTaskTitle.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        return matches;
      }
      const matchIds = new Set(matches.map((task) => task.id));
      return [
        ...matches,
        ...taskCollection.filter(
          (task) =>
            !matchIds.has(task.id) &&
            localizeTaskTitle(task.title, localizedNewTaskTitle) ===
              localizedNewTaskTitle,
        ),
      ];
    },
    [deferredQuery, localizedNewTaskTitle, taskCollection],
  );
  const taskGroups = showArchived
    ? [{ label: "Archived" as const, tasks: filteredTasks }]
    : groupTasks(filteredTasks);
  const taskStatusLabel = (
    task: GrokTask,
    running: boolean,
    needsPermission: boolean,
    needsAttention: boolean,
  ) => {
    if (task.archivedAt) return t("common.archived");
    if (needsPermission) return t("sidebar.status.needsPermission");
    if (running) return t("common.running");
    if (needsAttention && task.status === "complete") {
      return t("sidebar.status.finished");
    }
    if (task.status === "complete") return t("common.done");
    if (task.status === "error") return t("sidebar.status.needsAttention");
    return t("sidebar.status.ready");
  };

  const beginRename = (task: GrokTask) => {
    setRenamingTaskId(task.id);
    setRenameValue(displayTaskTitle(task));
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
    <aside className="sidebar" aria-label={t("sidebar.workspaceNavigation")}>
      <div className="sidebar__top">
        <p className="sidebar__section-label">{t("sidebar.workspaces")}</p>
        <button
          type="button"
          className="workspace-switcher"
          onClick={onChooseWorkspace}
          disabled={workspaceSwitchDisabled}
          title={t("common.chooseWorkspace")}
        >
          <span className="workspace-switcher__icon">
            <img src={appIcon} alt="" />
          </span>
          <span className="workspace-switcher__label">{workspaceLabel}</span>
          <CaretDown size={14} />
        </button>

        <nav className="primary-nav" aria-label={t("sidebar.primaryNavigation")}>
          {navItems.map(({ id, labelKey, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-row ${active === id ? "is-active" : ""}`}
              onClick={() => onNavigate(id)}
              onFocus={() => onNavigationIntent(id)}
              onPointerEnter={() => onNavigationIntent(id)}
              aria-label={t(labelKey)}
              aria-current={active === id ? "page" : undefined}
            >
              <Icon size={19} weight="regular" />
              <span>{t(labelKey)}</span>
              {id === "tasks" && tasks.length > 0 ? (
                <span
                  className={`nav-row__count ${
                    runningTaskIds.length > 0
                      ? "nav-row__count--running"
                      : ""
                  }`}
                  title={
                    runningTaskIds.length > 0
                      ? t(
                          runningTaskIds.length === 1
                            ? "sidebar.runningTask.one"
                            : "sidebar.runningTask.other",
                          { count: runningTaskIds.length },
                        )
                      : t(
                          tasks.length === 1
                            ? "sidebar.localTask.one"
                            : "sidebar.localTask.other",
                          { count: tasks.length },
                        )
                  }
                >
                  {runningTaskIds.length > 0
                    ? t("sidebar.activeCount", {
                        count: runningTaskIds.length,
                      })
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
          aria-label={t("sidebar.newTask")}
        >
          <Plus size={16} weight="bold" />
          <span>{t("sidebar.newTask")}</span>
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
            <UploadSimple size={14} /> {t("common.import")}
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
            <Archive size={14} /> {t("common.archived")}
            <span>{archivedTasks.length}</span>
          </button>
        </div>
      </div>

      <div className="task-history" aria-label={t("sidebar.recentTasks")}>
        <label className="task-search">
          <MagnifyingGlass size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              showArchived
                ? t("sidebar.searchArchived")
                : t("sidebar.searchTasks")
            }
            aria-label={
              showArchived
                ? t("sidebar.searchArchived")
                : t("sidebar.searchTasks")
            }
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("sidebar.clearSearch")}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>
        {taskGroups.map((group) => (
          <section key={group.label} className="task-group">
            <h2>
              {group.label === "Archived"
                ? t("common.archived")
                : t(taskGroupLabelKeys[group.label])}
            </h2>
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
                      aria-label={t("sidebar.renameAria", {
                        title: displayTaskTitle(task),
                      })}
                    />
                    <button
                      type="submit"
                      aria-label={t("sidebar.saveTaskName")}
                    >
                      <Check size={12} />
                    </button>
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
                    title={
                      task.archivedAt
                        ? t("sidebar.restoreAndOpen")
                        : undefined
                    }
                  >
                    <span className="task-row__title">
                      {displayTaskTitle(task)}
                    </span>
                    <span className="task-row__meta">
                      {formatTaskTime(
                        task.archivedAt || task.updatedAt,
                        locale,
                      )}
                      <span>
                        {taskStatusLabel(
                          task,
                          taskRunning,
                          taskNeedsPermission,
                          taskNeedsAttention,
                        )}
                      </span>
                      {task.origin === "branch" ? (
                        <GitFork
                          size={12}
                          aria-label={t("sidebar.localBranch")}
                        />
                      ) : null}
                      {task.origin === "import" ? (
                        <UploadSimple
                          size={12}
                          aria-label={t("sidebar.importedTask")}
                        />
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
                    aria-label={t("sidebar.taskActionsAria", {
                      title: displayTaskTitle(task),
                    })}
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
                          <PencilSimple size={13} /> {t("sidebar.rename")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={taskActionLocked}
                          title={
                            taskActionLocked
                              ? t("sidebar.waitBeforeBranch")
                              : undefined
                          }
                          onClick={() => {
                            onBranchTask(task.id);
                            setMenuTaskId(null);
                          }}
                        >
                          <GitFork size={13} /> {t("sidebar.localBranch")}
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
                        <ArrowCounterClockwise size={13} /> {t("common.restore")}
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={taskActionLocked}
                      title={
                        taskActionLocked
                          ? t("sidebar.waitBeforeExport")
                          : undefined
                      }
                      onClick={() => {
                        setExchangeError(null);
                        setExchangeAction({ kind: "export", task });
                        setMenuTaskId(null);
                      }}
                    >
                      <DownloadSimple size={13} /> {t("sidebar.exportJson")}
                    </button>
                    {!task.archivedAt ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={taskActionLocked}
                        title={
                          taskActionLocked
                              ? t("sidebar.waitBeforeArchive")
                            : undefined
                        }
                        onClick={() => {
                          void onArchiveTask(task.id);
                          setMenuTaskId(null);
                        }}
                      >
                        <Archive size={13} /> {t("common.archive")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      disabled={taskActionLocked}
                      title={
                        taskActionLocked
                          ? t("sidebar.waitBeforeDelete")
                          : undefined
                      }
                      onClick={() => {
                        setDeleteCandidate(task);
                        setDeleteError(null);
                        setMenuTaskId(null);
                      }}
                    >
                      <Trash size={13} /> {t("common.delete")}
                    </button>
                  </div>
                ) : null}
                </div>
              );
            })}
          </section>
        ))}
        {query && filteredTasks.length === 0 ? (
          <div className="task-search-empty">
            {t("sidebar.noSearchResults", { query })}
          </div>
        ) : null}
        {!query && taskCollection.length === 0 ? (
          <div className="task-search-empty">
            {showArchived
              ? t("sidebar.noArchivedTasks")
              : t("sidebar.noTasks")}
          </div>
        ) : null}
      </div>

      <div className="sidebar__bottom">
        <button
          type="button"
          className={`profile-row ${active === "account" ? "is-active" : ""}`}
          onClick={() => onNavigate("account")}
          onFocus={() => onNavigationIntent("account")}
          onPointerEnter={() => onNavigationIntent("account")}
          aria-label={t("sidebar.openAccount")}
          aria-current={active === "account" ? "page" : undefined}
        >
          <img src={appIcon} alt="" />
          <span>
            <strong>{t("sidebar.grokAccount")}</strong>
            <small>
              {runtime?.authenticationState === "verified" ||
              runtime?.authenticationState === "configured"
                ? t("sidebar.manageAccount")
                : t("sidebar.signInAccount")}
            </small>
          </span>
          <CaretDown size={14} />
        </button>
        <button
          type="button"
          className="runtime-row"
          onClick={onStatusClick}
          onFocus={() => onNavigationIntent("settings")}
          onPointerEnter={() => onNavigationIntent("settings")}
          title={runtime?.version || t("sidebar.inspectRuntime")}
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
                <h2 id="delete-task-title">{t("sidebar.deleteTitle")}</h2>
                <p>
                  {t("sidebar.deleteDescription", {
                    title: displayTaskTitle(deleteCandidate),
                  })}
                </p>
              </div>
            </header>
            <div className="task-delete-dialog__actions">
              {deleteError ? <span className="task-delete-dialog__error">{deleteError}</span> : null}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteCandidate(null)}
              >
                {t("common.cancel")}
              </button>
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
                {t("sidebar.deleteAction")}
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
                  {exchangeAction.kind === "import"
                    ? t("sidebar.importTitle")
                    : t("sidebar.exportTitle")}
                </h2>
                <p>
                  {exchangeAction.kind === "import"
                    ? t("sidebar.importDescription")
                    : t("sidebar.exportDescription", {
                        title: displayTaskTitle(exchangeAction.task),
                      })}
                </p>
              </div>
            </header>
            <div className="task-exchange-dialog__notice">
              <strong>{t("sidebar.credentialBoundary")}</strong>
              <span>
                {t("sidebar.credentialBoundaryDescription")}
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
                {t("common.cancel")}
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
                  ? t("common.working")
                  : exchangeAction.kind === "import"
                    ? t("sidebar.chooseFile")
                    : t("sidebar.chooseLocation")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
