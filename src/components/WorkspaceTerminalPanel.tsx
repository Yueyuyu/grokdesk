import {
  Play,
  SpinnerGap,
  Stop,
  TerminalWindow,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceTerminalController } from "../hooks/useWorkspaceTerminal";

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
  const [source, setSource] = useState<"workspace" | "acp">("workspace");
  const output = useRef<HTMLDivElement>(null);
  const visibleLineCount =
    source === "workspace" ? terminal.lines.length : runtimeLines.length;
  const commandDisabled = preview || !workspaceReady || terminal.running;

  useEffect(() => {
    const container = output.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [source, visibleLineCount]);

  return (
    <div className="terminal-panel">
      <header>
        <span className="terminal-panel__title">
          <TerminalWindow size={15} /> Terminal
        </span>
        <div className="terminal-source-switch" role="tablist" aria-label="Terminal source">
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
          disabled={source === "workspace" && terminal.running}
          aria-label={`Clear ${source === "workspace" ? "workspace terminal" : "ACP log"}`}
        >
          <Trash size={15} />
        </button>
      </header>

      {source === "workspace" ? (
        <>
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
                <div className={`terminal-line terminal-line--${line.kind}`} key={line.id}>
                  {line.text || " "}
                </div>
              ))
            ) : (
              <div className="terminal-empty">
                {preview
                  ? "Browser preview is read-only. Open the installed app to run workspace commands."
                  : workspaceReady
                    ? "Run a PowerShell command in the selected workspace. Output is not saved to task history."
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
            <span aria-hidden="true">PS&gt;</span>
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
                } else if (event.key === "Enter" && event.ctrlKey) {
                  event.preventDefault();
                  void terminal.run();
                }
              }}
              placeholder={workspaceReady ? "Enter a PowerShell command" : "Choose a workspace first"}
              aria-label="Workspace PowerShell command"
              spellCheck={false}
            />
            {terminal.running ? (
              <button
                type="button"
                className="terminal-stop-button"
                onClick={() => void terminal.cancel()}
                disabled={terminal.stopping}
              >
                {terminal.stopping ? <SpinnerGap size={14} className="spin" /> : <Stop size={14} weight="fill" />}
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
            <span>{preview ? "Desktop-only execution" : "PowerShell · user initiated"}</span>
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
