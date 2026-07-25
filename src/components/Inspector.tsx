import { CaretLeft } from "@phosphor-icons/react";
import type { WorkspaceChangesController } from "../hooks/useWorkspaceChanges";
import type { WorkspaceTerminalController } from "../hooks/useWorkspaceTerminal";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
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

const tabLabelKeys: Record<InspectorTab, TranslationKey> = {
  changes: "inspector.changes",
  terminal: "inspector.terminal",
  tests: "inspector.tests",
  context: "inspector.context",
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
  const { t } = useI18n();
  return (
    <aside className="inspector" aria-label={t("inspector.taskInspector")}>
      <div className="inspector__topbar">
        <div
          className="inspector-tabs"
          role="tablist"
          aria-label={t("inspector.views")}
        >
          {(Object.keys(tabLabelKeys) as InspectorTab[]).map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              key={tab}
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => onTabChange(tab)}
            >
              {t(tabLabelKeys[tab])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button inspector__collapse"
          onClick={onCollapse}
          aria-label={t("inspector.collapse")}
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
