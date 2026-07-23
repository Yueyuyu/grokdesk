import { CaretLeft } from "@phosphor-icons/react";
import type { WorkspaceChangesController } from "../hooks/useWorkspaceChanges";
import type { WorkspaceTerminalController } from "../hooks/useWorkspaceTerminal";
import type {
  GrokTask,
  InspectorTab,
  PromptCapabilities,
} from "../types";
import { RuntimeContextPanel } from "./RuntimeContextPanel";
import { WorkspaceChangesPanel } from "./WorkspaceChangesPanel";
import { WorkspaceTerminalPanel } from "./WorkspaceTerminalPanel";
import { WorkspaceTestsPanel } from "./WorkspaceTestsPanel";

interface InspectorProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  terminalLines: string[];
  onClearTerminal: () => void;
  terminal: WorkspaceTerminalController;
  preview: boolean;
  runtimeAvailable: boolean;
  connected: boolean;
  contextBusy: boolean;
  promptCapabilities: PromptCapabilities | null;
  onCollapse: () => void;
  task: GrokTask | null;
  workspacePath: string;
  workspaceReady: boolean;
  workspace: WorkspaceChangesController;
  onChooseWorkspace: () => void;
  onOpenSettings: () => void;
  onReconnect: () => Promise<unknown>;
}

const tabLabels: Record<InspectorTab, string> = {
  changes: "Changes",
  terminal: "Terminal",
  tests: "Tests",
  context: "Context",
};

export function Inspector({
  activeTab,
  onTabChange,
  terminalLines,
  onClearTerminal,
  terminal,
  preview,
  runtimeAvailable,
  connected,
  contextBusy,
  promptCapabilities,
  onCollapse,
  task,
  workspacePath,
  workspaceReady,
  workspace,
  onChooseWorkspace,
  onOpenSettings,
  onReconnect,
}: InspectorProps) {
  return (
    <aside className="inspector" aria-label="Task inspector">
      <div className="inspector__topbar">
        <div
          className="inspector-tabs"
          role="tablist"
          aria-label="Inspector views"
        >
          {(Object.keys(tabLabels) as InspectorTab[]).map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              key={tab}
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => onTabChange(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button inspector__collapse"
          onClick={onCollapse}
          aria-label="Collapse inspector"
        >
          <CaretLeft size={16} />
        </button>
      </div>

      {activeTab === "changes" ? (
        <WorkspaceChangesPanel
          workspace={workspace}
          onChooseWorkspace={onChooseWorkspace}
        />
      ) : null}

      {activeTab === "terminal" ? (
        <WorkspaceTerminalPanel
          terminal={terminal}
          runtimeLines={terminalLines}
          onClearRuntime={onClearTerminal}
          workspacePath={workspacePath}
          workspaceReady={workspaceReady}
          preview={preview}
        />
      ) : null}

      {activeTab === "tests" ? (
        <WorkspaceTestsPanel
          terminal={terminal}
          preview={preview}
          workspaceReady={workspaceReady}
          onOpenTerminal={() => onTabChange("terminal")}
        />
      ) : null}

      {activeTab === "context" ? (
        <RuntimeContextPanel
          preview={preview}
          workspacePath={workspacePath}
          workspaceReady={workspaceReady}
          runtimeAvailable={runtimeAvailable}
          connected={connected}
          busy={contextBusy}
          promptCapabilities={promptCapabilities}
          task={task}
          onChooseWorkspace={onChooseWorkspace}
          onOpenSettings={onOpenSettings}
          onReconnect={onReconnect}
        />
      ) : null}
    </aside>
  );
}
