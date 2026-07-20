import { CaretLeft, SidebarSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FeaturePanel } from "./components/FeaturePanel";
import { Inspector } from "./components/Inspector";
import { PermissionDialog } from "./components/PermissionDialog";
import { Sidebar } from "./components/Sidebar";
import { TaskWorkspace } from "./components/TaskWorkspace";
import { TitleBar } from "./components/TitleBar";
import { useGrokRuntime } from "./hooks/useGrokRuntime";
import { chooseWorkspace } from "./lib/desktop";
import type { InspectorTab, NavigationKey, ThemePreference } from "./types";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function getResolvedTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

  return <div className={`pane-resizer pane-resizer--${side}`} onPointerDown={begin} />;
}

export function App() {
  const [activeNavigation, setActiveNavigation] = useState<NavigationKey>("tasks");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("changes");
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(268);
  const [inspectorWidth, setInspectorWidth] = useState(392);
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("grokdesk.workspace") || ".",
  );
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem("grokdesk.theme") as ThemePreference | null) || "light",
  );

  const grok = useGrokRuntime(workspacePath);

  useEffect(() => {
    const apply = () => document.documentElement.setAttribute("data-theme", getResolvedTheme(theme));
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

  const workspaceLabel = useMemo(() => {
    if (!workspacePath || workspacePath === ".") return "acme/web-app";
    const parts = workspacePath.split(/[\\/]/).filter(Boolean);
    return parts.slice(-2).join("/") || workspacePath;
  }, [workspacePath]);

  const pickWorkspace = async () => {
    const selected = await chooseWorkspace();
    if (!selected) return;
    setWorkspacePath(selected);
    localStorage.setItem("grokdesk.workspace", selected);
    if (grok.sessionId) await grok.disconnect();
  };

  const gridStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--inspector-width": inspectorCollapsed ? "0px" : `${inspectorWidth}px`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <TitleBar />
      <div className={`app-grid ${inspectorCollapsed ? "inspector-is-collapsed" : ""}`} style={gridStyle}>
        <Sidebar
          active={activeNavigation}
          onNavigate={setActiveNavigation}
          workspaceLabel={workspaceLabel}
          onChooseWorkspace={() => void pickWorkspace()}
          runtime={grok.runtime}
          statusText={grok.statusText}
          onStatusClick={() => setActiveNavigation("settings")}
        />
        <Resizer
          side="left"
          onResize={(delta) => setSidebarWidth((width) => clamp(width + delta, 220, 340))}
        />

        {activeNavigation === "tasks" ? (
          <TaskWorkspace
            messages={grok.messages}
            plan={grok.plan}
            tools={grok.tools}
            busy={grok.busy}
            onSend={grok.send}
            onCancel={grok.cancel}
            onRunTests={() => void grok.send("Run the relevant tests for the OAuth session changes and report any failures.")}
            onReviewChanges={() => {
              setInspectorCollapsed(false);
              setInspectorTab("changes");
            }}
          />
        ) : (
          <FeaturePanel
            kind={activeNavigation}
            theme={theme}
            onThemeChange={setTheme}
            workspacePath={workspacePath}
            onChooseWorkspace={() => void pickWorkspace()}
            runtime={grok.runtime}
            connected={Boolean(grok.sessionId)}
            onConnect={grok.connect}
            onDisconnect={grok.disconnect}
            onSignIn={grok.signIn}
          />
        )}

        {!inspectorCollapsed ? (
          <>
            <Resizer
              side="right"
              onResize={(delta) => setInspectorWidth((width) => clamp(width + delta, 330, 520))}
            />
            <Inspector
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              terminalLines={grok.terminalLines}
              onClearTerminal={grok.clearTerminal}
              onCollapse={() => setInspectorCollapsed(true)}
              sessionId={grok.sessionId}
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

      {grok.error ? <div className="error-toast" role="alert">{grok.error}</div> : null}
      {grok.permission ? (
        <PermissionDialog request={grok.permission} onAnswer={grok.answerPermission} />
      ) : null}
    </div>
  );
}
