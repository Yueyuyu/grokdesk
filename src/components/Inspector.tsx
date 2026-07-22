import { CaretLeft } from "@phosphor-icons/react";
import type { WorkspaceChangesController } from "../hooks/useWorkspaceChanges";
import type { WorkspaceTerminalController } from "../hooks/useWorkspaceTerminal";
import type { GrokTask, InspectorTab } from "../types";
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
  onCollapse: () => void;
  sessionId: string | null;
  task: GrokTask | null;
  workspacePath: string;
  workspaceReady: boolean;
  workspace: WorkspaceChangesController;
  onChooseWorkspace: () => void;
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
  onCollapse,
  sessionId,
  task,
  workspacePath,
  workspaceReady,
  workspace,
  onChooseWorkspace,
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
        <div className="context-panel">
          <section>
            <h2>Session</h2>
            <dl>
              <div>
                <dt>Runtime</dt>
                <dd>Grok Build ACP</dd>
              </div>
              <div>
                <dt>Session ID</dt>
                <dd>{sessionId || task?.acpSessionId || "Not connected"}</dd>
              </div>
              <div>
                <dt>Task</dt>
                <dd>{task?.title || "No active task"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{task?.status || "idle"}</dd>
              </div>
            </dl>
          </section>
          <section>
            <h2>Working context</h2>
            <dl>
              <div>
                <dt>Workspace</dt>
                <dd title={workspacePath}>{workspacePath}</dd>
              </div>
              <div>
                <dt>Repository</dt>
                <dd title={workspace.snapshot.repositoryRoot ?? undefined}>
                  {workspace.snapshot.repositoryRoot || "Not detected"}
                </dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{workspace.snapshot.branch || "Not detected"}</dd>
              </div>
              <div>
                <dt>Git changes</dt>
                <dd>{workspace.snapshot.changes.length}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{task?.messages.length ?? 0}</dd>
              </div>
              <div>
                <dt>Plan steps</dt>
                <dd>{task?.plan.length ?? 0}</dd>
              </div>
              <div>
                <dt>Tool updates</dt>
                <dd>{task?.tools.length ?? 0}</dd>
              </div>
            </dl>
          </section>
          <section className="context-note">
            GrokDesk stores the task transcript and official ACP Session ID
            locally. OAuth credentials remain owned by the official Grok CLI.
          </section>
        </div>
      ) : null}
    </aside>
  );
}
