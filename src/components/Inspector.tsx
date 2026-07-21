import { CaretLeft, GitDiff, Trash } from "@phosphor-icons/react";
import type { GrokTask, InspectorTab } from "../types";

interface InspectorProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  terminalLines: string[];
  onClearTerminal: () => void;
  onCollapse: () => void;
  sessionId: string | null;
  task: GrokTask | null;
  workspacePath: string;
}

const tabLabels: Record<InspectorTab, string> = {
  changes: "Changes",
  terminal: "Terminal",
  context: "Context",
};

export function Inspector({
  activeTab,
  onTabChange,
  terminalLines,
  onClearTerminal,
  onCollapse,
  sessionId,
  task,
  workspacePath,
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
        <div className="inspector-empty-state">
          <span>
            <GitDiff size={23} />
          </span>
          <strong>No verified changes yet</strong>
          <p>
            Real workspace Git status and diffs will appear here after the Git
            inspector is connected.
          </p>
        </div>
      ) : null}

      {activeTab === "terminal" ? (
        <div className="terminal-panel">
          <header>
            <span>ACP Terminal</span>
            <button
              type="button"
              className="icon-button"
              onClick={onClearTerminal}
              aria-label="Clear terminal"
            >
              <Trash size={16} />
            </button>
          </header>
          <pre>
            {terminalLines.length
              ? terminalLines.join("\n")
              : "Real ACP and runtime output will appear here."}
          </pre>
        </div>
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
