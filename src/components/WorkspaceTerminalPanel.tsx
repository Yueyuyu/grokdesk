import {
  PencilSimple,
  Play,
  Plus,
  SpinnerGap,
  Stop,
  TerminalWindow,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  WorkspaceTerminalController,
  WorkspaceTerminalTab,
} from "../hooks/useWorkspaceTerminal";
import {
  detectAppPlatform,
  workspaceShellPresentation,
} from "../lib/platform";

const quickCommands = [
  { label: "Git status", command: "git status --short" },
  { label: "Tests", command: "npm test" },
  { label: "Build", command: "npm run build" },
];

interface WorkspaceTerminalPanelProps {
  terminal: WorkspaceTerminalController;
  runtimeLines: string[];
  onClearRuntime: () => void;
  workspacePath: string;
  workspaceReady: boolean;
  preview: boolean;
}

export function WorkspaceTerminalPanel({
  terminal,
  runtimeLines,
  onClearRuntime,
  workspacePath,
  workspaceReady,
  preview,
}: WorkspaceTerminalPanelProps) {
  const shell = workspaceShellPresentation(detectAppPlatform());
  const [source, setSource] = useState<"workspace" | "acp">("workspace");
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const output = useRef<HTMLDivElement>(null);
  const visibleLineCount =
    source === "workspace" ? terminal.lines.length : runtimeLines.length;
  const commandDisabled =
    preview || !workspaceReady || terminal.activeTabRunning;

  useEffect(() => {
    const container = output.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [source, terminal.activeTabId, visibleLineCount]);

  const beginRename = (tab: WorkspaceTerminalTab) => {
    setRenamingTabId(tab.id);
    setRenameValue(tab.title);
  };

  const finishRename = () => {
    if (renamingTabId) terminal.renameTab(renamingTabId, renameValue);
    setRenamingTabId(null);
    setRenameValue("");
  };

  return (
    <div className={`terminal-panel terminal-panel--${source}`}>
      <header>
        <span className="terminal-panel__title">
          <TerminalWindow size={15} /> Terminal
        </span>
        {terminal.runningCount > 0 ? (
          <span className="terminal-running-badge" role="status">
            <SpinnerGap size={12} className="spin" />
            {terminal.runningCount} running
          </span>
        ) : null}
        <div
          className="terminal-source-switch"
          role="tablist"
          aria-label="Terminal source"
        >
          <button
            type="button"
            role="tab"
            aria-selected={source === "workspace"}
            className={source === "workspace" ? "is-active" : ""}
            onClick={() => setSource("workspace")}
          >
            Workspace
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === "acp"}
            className={source === "acp" ? "is-active" : ""}
            onClick={() => setSource("acp")}
          >
            ACP log
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={source === "workspace" ? terminal.clear : onClearRuntime}
          disabled={source === "workspace" && terminal.activeTabRunning}
          aria-label={`Clear ${source === "workspace" ? "active terminal" : "ACP log"}`}
        >
          <Trash size={15} />
        </button>
      </header>

      {source === "workspace" ? (
        <>
          <div className="terminal-tab-strip" role="tablist" aria-label="Workspace terminals">
            <div className="terminal-tab-strip__scroll">
              {terminal.tabs.map((tab) => {
                const selected = tab.id === terminal.activeTabId;
                return (
                  <div
                    className={`terminal-tab ${selected ? "is-active" : ""}`}
                    key={tab.id}
                  >
                    {renamingTabId === tab.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={32}
                        aria-label={`Rename ${tab.title}`}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={finishRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishRename();
                          } else if (event.key === "Escape") {
                            setRenameValue(tab.title);
                            setRenamingTabId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="terminal-tab__select"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => terminal.setActiveTabId(tab.id)}
                        onDoubleClick={() => beginRename(tab)}
                        title={`${tab.title}${tab.runningCommand ? ` · ${tab.runningCommand.command}` : ""}`}
                      >
                        {tab.runningCommand ? (
                          <SpinnerGap size={11} className="spin" />
                        ) : (
                          <span className="terminal-tab__status" />
                        )}
                        <span>{tab.title}</span>
                      </button>
                    )}
                    {selected && renamingTabId !== tab.id ? (
                      <button
                        type="button"
                        className="terminal-tab__action"
                        onClick={() => beginRename(tab)}
                        aria-label={`Rename ${tab.title}`}
                      >
                        <PencilSimple size={11} />
                      </button>
                    ) : null}
                    {terminal.tabs.length > 1 && renamingTabId !== tab.id ? (
                      <button
                        type="button"
                        className="terminal-tab__action"
                        onClick={() => terminal.closeTab(tab.id)}
                        disabled={Boolean(tab.runningCommand)}
                        aria-label={`Close ${tab.title}`}
                        title={tab.runningCommand ? "Stop this command before closing its terminal" : undefined}
                      >
                        <X size={11} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="terminal-tab-add"
              onClick={terminal.addTab}
              disabled={!terminal.canAddTab}
              aria-label="New terminal"
              title={
                terminal.canAddTab
                  ? "New terminal"
                  : `Up to ${terminal.maxTabs} terminals are available`
              }
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="terminal-quick-actions" aria-label="Common workspace commands">
            {quickCommands.map((item) => (
              <button
                type="button"
                key={item.label}
                disabled={commandDisabled}
                onClick={() => terminal.setDraft(item.command)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="terminal-output" ref={output} role="log" aria-live="polite">
            {terminal.lines.length > 0 ? (
              terminal.lines.map((line) => (
                <div
                  className={`terminal-line terminal-line--${line.kind}`}
                  key={line.id}
                >
                  {line.text || " "}
                </div>
              ))
            ) : (
              <div className="terminal-empty">
                {preview
                  ? "Browser preview is read-only. Open the installed app to run workspace commands."
                  : workspaceReady
                    ? `Run a ${shell.commandNoun} in this terminal. You can keep it running while opening another task or terminal. Output is not saved.`
                    : "Choose a workspace to enable the terminal."}
              </div>
            )}
          </div>
          <form
            className="terminal-command-bar"
            onSubmit={(event) => {
              event.preventDefault();
              void terminal.run();
            }}
          >
            <span aria-hidden="true">{shell.prompt}</span>
            <input
              value={terminal.draft}
              disabled={commandDisabled}
              onChange={(event) => terminal.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  terminal.recallHistory("older");
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  terminal.recallHistory("newer");
                } else if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault();
                  void terminal.run();
                }
              }}
              placeholder={workspaceReady ? shell.placeholder : "Choose a workspace first"}
              aria-label={`Workspace ${shell.commandNoun}`}
              spellCheck={false}
            />
            {terminal.activeTabRunning ? (
              <button
                type="button"
                className="terminal-stop-button"
                onClick={() => void terminal.cancel()}
                disabled={terminal.stopping}
              >
                {terminal.stopping ? (
                  <SpinnerGap size={14} className="spin" />
                ) : (
                  <Stop size={14} weight="fill" />
                )}
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="terminal-run-button"
                disabled={commandDisabled || !terminal.draft.trim()}
              >
                <Play size={14} weight="fill" /> Run
              </button>
            )}
          </form>
          <footer title={workspacePath || undefined}>
            <span>
              {preview
                ? "Desktop-only execution"
                : terminal.runningCount > 0
                  ? `${terminal.runningCount} background command${terminal.runningCount === 1 ? "" : "s"}`
                  : `${shell.name} · user initiated`}
            </span>
            <span>{workspacePath || "No workspace selected"}</span>
          </footer>
        </>
      ) : (
        <div className="terminal-output terminal-output--runtime" ref={output} role="log">
          {runtimeLines.length > 0 ? (
            runtimeLines.map((line, index) => (
              <div className="terminal-line terminal-line--runtime" key={`${index}-${line}`}>
                {line || " "}
              </div>
            ))
          ) : (
            <div className="terminal-empty">Real ACP and Grok Runtime output will appear here.</div>
          )}
        </div>
      )}
    </div>
  );
}
