import { CaretLeft, SidebarSimple, X } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CommandPalette } from "./components/CommandPalette";
import { FeaturePanel } from "./components/FeaturePanel";
import { Inspector } from "./components/Inspector";
import { McpPanel } from "./components/McpPanel";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { PermissionCenter } from "./components/PermissionCenter";
import { PermissionDialog } from "./components/PermissionDialog";
import { PluginPanel } from "./components/PluginPanel";
import { Sidebar } from "./components/Sidebar";
import { TaskWorkspace } from "./components/TaskWorkspace";
import { TitleBar } from "./components/TitleBar";
import { useGrokRuntime } from "./hooks/useGrokRuntime";
import { useAuditStore } from "./hooks/useAuditStore";
import { useTaskStore } from "./hooks/useTaskStore";
import { useWorkspaceChanges } from "./hooks/useWorkspaceChanges";
import { useWorkspaceTerminal } from "./hooks/useWorkspaceTerminal";
import {
  chooseWorkspace,
  isDesktopRuntime,
  readTaskExchangeFile,
  writeTaskExchangeFile,
} from "./lib/desktop";
import { getRuntimeSetupStep } from "./lib/runtime";
import { isWorkspaceSelected } from "./lib/workspace";
import type { InspectorTab, NavigationKey, ThemePreference } from "./types";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function getResolvedTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function Resizer({
  side,
  onResize,
}: {
  side: "left" | "right";
  onResize: (delta: number) => void;
}) {
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    let previousX = event.clientX;
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - previousX;
      previousX = moveEvent.clientX;
      onResize(side === "left" ? delta : -delta);
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <div
      className={`pane-resizer pane-resizer--${side}`}
      onPointerDown={begin}
    />
  );
}

export function App() {
  const [activeNavigation, setActiveNavigation] =
    useState<NavigationKey>("tasks");
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTab>("changes");
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(268);
  const [inspectorWidth, setInspectorWidth] = useState(392);
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("grokdesk.workspace") || "",
  );
  const [theme, setTheme] = useState<ThemePreference>(
    () =>
      (localStorage.getItem("grokdesk.theme") as ThemePreference | null) ||
      "light",
  );
  const workspaceReady = isWorkspaceSelected(workspacePath);
  const preview = !isDesktopRuntime();

  const taskStore = useTaskStore(workspacePath);
  const auditStore = useAuditStore(workspacePath, !preview);
  const grok = useGrokRuntime(
    workspacePath,
    taskStore.activeTask,
    taskStore.updateTask,
    auditStore.recordEvent,
  );
  const terminal = useWorkspaceTerminal(
    workspacePath,
    taskStore.activeTaskId,
    auditStore.recordEvent,
  );
  const workspace = useWorkspaceChanges(workspacePath, grok.busy || terminal.running);
  const searchableTasks = useMemo(
    () => [...taskStore.tasks, ...taskStore.archivedTasks],
    [taskStore.archivedTasks, taskStore.tasks],
  );
  const setupStep = getRuntimeSetupStep(grok.runtime);

  useEffect(() => {
    const apply = () =>
      document.documentElement.setAttribute(
        "data-theme",
        getResolvedTheme(theme),
      );
    apply();
    localStorage.setItem("grokdesk.theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 880px)");
    const syncInspector = () => setInspectorCollapsed(compactViewport.matches);
    syncInspector();
    compactViewport.addEventListener("change", syncInspector);
    return () => compactViewport.removeEventListener("change", syncInspector);
  }, []);

  useEffect(() => {
    const openCommandPalette = (event: KeyboardEvent) => {
      if (grok.permission) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", openCommandPalette);
    return () => window.removeEventListener("keydown", openCommandPalette);
  }, [grok.permission]);

  useEffect(() => {
    if (grok.permission) setCommandPaletteOpen(false);
  }, [grok.permission]);

  const workspaceLabel = useMemo(() => {
    if (!isWorkspaceSelected(workspacePath)) return "Choose workspace";
    const parts = workspacePath.split(/[\\/]/).filter(Boolean);
    return parts.slice(-2).join("/") || workspacePath;
  }, [workspacePath]);

  const pickWorkspace = async () => {
    if (terminal.running || grok.busy || grok.permission) return;
    const selected = await chooseWorkspace();
    if (!selected) return;
    if (grok.sessionId) await grok.disconnect();
    setWorkspacePath(selected);
    localStorage.setItem("grokdesk.workspace", selected);
  };

  const gridStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--inspector-width": inspectorCollapsed ? "0px" : `${inspectorWidth}px`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <TitleBar
        onOpenCommandPalette={() => {
          if (!grok.permission) setCommandPaletteOpen(true);
        }}
      />
      <div
        className={`app-grid ${inspectorCollapsed ? "inspector-is-collapsed" : ""}`}
        style={gridStyle}
      >
        <Sidebar
          active={activeNavigation}
          onNavigate={setActiveNavigation}
          workspaceLabel={workspaceLabel}
          onChooseWorkspace={() => void pickWorkspace()}
          workspaceSwitchDisabled={terminal.running || grok.busy || Boolean(grok.permission)}
          runtime={grok.runtime}
          statusText={grok.statusText}
          onStatusClick={() => setActiveNavigation("settings")}
          tasks={taskStore.tasks}
          archivedTasks={taskStore.archivedTasks}
          activeTaskId={taskStore.activeTaskId}
          pendingPermissionCount={auditStore.pendingCount}
          taskSwitchDisabled={
            grok.busy || Boolean(grok.permission) || !workspaceReady
          }
          onCreateTask={() => {
            taskStore.createTask();
            setActiveNavigation("tasks");
          }}
          onSelectTask={(taskId) => {
            taskStore.selectTask(taskId);
            setActiveNavigation("tasks");
          }}
          onRenameTask={taskStore.renameTask}
          onBranchTask={(taskId) => {
            taskStore.branchTask(taskId);
            setActiveNavigation("tasks");
          }}
          onArchiveTask={async (taskId) => {
            if (taskId === taskStore.activeTaskId && grok.sessionId) {
              await grok.disconnect();
            }
            taskStore.archiveTask(taskId);
          }}
          onRestoreTask={(taskId) => {
            taskStore.restoreTask(taskId);
            setActiveNavigation("tasks");
          }}
          onImportTask={async () => {
            const raw = await readTaskExchangeFile();
            if (raw === null) return;
            taskStore.importTask(raw);
            setActiveNavigation("tasks");
          }}
          onExportTask={async (taskId) => {
            const exported = taskStore.exportTask(taskId);
            await writeTaskExchangeFile(exported.title, exported.content);
          }}
          onDeleteTask={async (taskId) => {
            if (taskId === taskStore.activeTaskId && grok.sessionId) {
              await grok.disconnect();
            }
            taskStore.deleteTask(taskId);
          }}
        />
        <Resizer
          side="left"
          onResize={(delta) =>
            setSidebarWidth((width) => clamp(width + delta, 220, 340))
          }
        />

        {activeNavigation === "tasks" ? (
          setupStep === "ready" ? (
            <TaskWorkspace
              task={taskStore.activeTask}
              busy={grok.busy}
              onSend={grok.send}
              onCancel={grok.cancel}
              onRetry={grok.retry}
              workspaceReady={workspaceReady}
              onChooseWorkspace={() => void pickWorkspace()}
              workspaceChangeCount={workspace.snapshot.changes.length}
              onRunTests={() =>
                void grok.send(
                  "Run the relevant tests for the current changes and report any failures.",
                )
              }
              onReviewChanges={() => {
                setInspectorCollapsed(false);
                setInspectorTab("changes");
              }}
            />
          ) : (
            <OnboardingPanel
              runtime={grok.runtime}
              installing={grok.installing}
              signingIn={grok.signingIn}
              preview={preview}
              onInstall={grok.installRuntime}
              onSignIn={grok.signIn}
              onManageSubscription={grok.manageSubscription}
              onOpenSettings={() => setActiveNavigation("settings")}
            />
          )
        ) : activeNavigation === "permissions" ? (
          <PermissionCenter
            events={auditStore.events}
            tasks={searchableTasks}
            workspaceReady={workspaceReady}
            preview={preview}
            clearDisabled={Boolean(grok.permission) || grok.busy || terminal.running}
            onClear={auditStore.clear}
            onChooseWorkspace={() => void pickWorkspace()}
          />
        ) : activeNavigation === "plugins" ? (
          <PluginPanel
            workspacePath={workspacePath}
            runtimeAvailable={grok.runtime?.available === true}
            preview={preview}
            connected={Boolean(grok.sessionId)}
            onOpenSettings={() => setActiveNavigation("settings")}
          />
        ) : activeNavigation === "mcp" ? (
          <McpPanel
            workspacePath={workspacePath}
            runtimeAvailable={grok.runtime?.available === true}
            preview={preview}
            connected={Boolean(grok.sessionId)}
            onOpenSettings={() => setActiveNavigation("settings")}
          />
        ) : (
          <FeaturePanel
            theme={theme}
            onThemeChange={setTheme}
            workspacePath={workspacePath}
            onChooseWorkspace={() => void pickWorkspace()}
            workspaceSwitchDisabled={terminal.running || grok.busy || Boolean(grok.permission)}
            runtime={grok.runtime}
            subscription={grok.subscription}
            connected={Boolean(grok.sessionId)}
            installing={grok.installing}
            signingIn={grok.signingIn}
            subscriptionLoading={grok.subscriptionLoading}
            preview={preview}
            onConnect={grok.connect}
            onDisconnect={grok.disconnect}
            onInstall={grok.installRuntime}
            onSignIn={grok.signIn}
            onVerifySubscription={grok.verifySubscription}
            onManageSubscription={grok.manageSubscription}
          />
        )}

        {!inspectorCollapsed ? (
          <>
            <Resizer
              side="right"
              onResize={(delta) =>
                setInspectorWidth((width) => clamp(width + delta, 330, 520))
              }
            />
            <Inspector
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              terminalLines={grok.terminalLines}
              onClearTerminal={grok.clearTerminal}
              terminal={terminal}
              preview={preview}
              onCollapse={() => setInspectorCollapsed(true)}
              sessionId={grok.sessionId}
              task={taskStore.activeTask}
              workspacePath={workspacePath}
              workspaceReady={workspaceReady}
              workspace={workspace}
              onChooseWorkspace={() => void pickWorkspace()}
            />
          </>
        ) : (
          <button
            type="button"
            className="inspector-reveal"
            onClick={() => setInspectorCollapsed(false)}
            aria-label="Open inspector"
          >
            <CaretLeft size={14} />
            <SidebarSimple size={17} />
          </button>
        )}
      </div>

      {grok.error ? (
        <div className="error-toast" role="alert">
          <span>{grok.error}</span>
          <button type="button" onClick={grok.dismissError} aria-label="Dismiss error">
            <X size={13} />
          </button>
        </div>
      ) : null}
      {grok.notice ? (
        <div className="status-toast" role="status" aria-live="polite">
          <span>{grok.notice}</span>
          <button
            type="button"
            onClick={grok.dismissNotice}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ) : null}
      {grok.permission ? (
        <PermissionDialog
          request={grok.permission}
          onAnswer={grok.answerPermission}
        />
      ) : null}
      <CommandPalette
        open={commandPaletteOpen}
        tasks={searchableTasks}
        activeTaskId={taskStore.activeTaskId}
        activeNavigation={activeNavigation}
        taskSwitchDisabled={grok.busy || !workspaceReady}
        workspaceReady={workspaceReady}
        inspectorCollapsed={inspectorCollapsed}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenTask={(task) => {
          if (task.archivedAt) {
            taskStore.restoreTask(task.id);
          } else {
            taskStore.selectTask(task.id);
          }
          setActiveNavigation("tasks");
        }}
        onCreateTask={() => {
          taskStore.createTask();
          setActiveNavigation("tasks");
        }}
        onChooseWorkspace={pickWorkspace}
        onNavigate={setActiveNavigation}
        onOpenInspector={(tab) => {
          setInspectorTab(tab);
          setInspectorCollapsed(false);
        }}
        onToggleInspector={() => setInspectorCollapsed((current) => !current)}
      />
    </div>
  );
}
