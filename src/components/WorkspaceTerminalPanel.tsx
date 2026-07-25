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
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import {
  detectAppPlatform,
  workspaceShellPresentation,
} from "../lib/platform";

const quickCommands = [
  {
    labelKey: "terminal.quick.gitStatus" as const,
    command: "git status --short",
  },
  { labelKey: "terminal.quick.tests" as const, command: "npm test" },
  { labelKey: "terminal.quick.build" as const, command: "npm run build" },
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
  const { t } = useI18n();
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
          <TerminalWindow size={15} /> {t("inspector.terminal")}
        </span>
        {terminal.runningCount > 0 ? (
          <span className="terminal-running-badge" role="status">
            <SpinnerGap size={12} className="spin" />
            {t("terminal.runningCount", { count: terminal.runningCount })}
          </span>
        ) : null}
        <div
          className="terminal-source-switch"
          role="tablist"
          aria-label={t("terminal.source")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={source === "workspace"}
            className={source === "workspace" ? "is-active" : ""}
            onClick={() => setSource("workspace")}
          >
            {t("settings.workspace")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === "acp"}
            className={source === "acp" ? "is-active" : ""}
            onClick={() => setSource("acp")}
          >
            {t("terminal.acpLog")}
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={source === "workspace" ? terminal.clear : onClearRuntime}
          disabled={source === "workspace" && terminal.activeTabRunning}
          aria-label={
            source === "workspace"
              ? t("terminal.clearActive")
              : t("terminal.clearAcpLog")
          }
        >
          <Trash size={15} />
        </button>
      </header>

      {source === "workspace" ? (
        <>
          <div
            className="terminal-tab-strip"
            role="tablist"
            aria-label={t("terminal.workspaceTerminals")}
          >
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
                        aria-label={t("terminal.renameAria", {
                          title: tab.title,
                        })}
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
                        aria-label={t("terminal.renameAria", {
                          title: tab.title,
                        })}
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
                        aria-label={t("terminal.closeAria", {
                          title: tab.title,
                        })}
                        title={
                          tab.runningCommand
                            ? t("terminal.stopBeforeClose")
                            : undefined
                        }
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
              aria-label={t("terminal.new")}
              title={
                terminal.canAddTab
                  ? t("terminal.new")
                  : t("terminal.maximum", { count: terminal.maxTabs })
              }
            >
              <Plus size={14} />
            </button>
          </div>
          <div
            className="terminal-quick-actions"
            aria-label={t("terminal.commonCommands")}
          >
            {quickCommands.map((item) => (
              <button
                type="button"
                key={item.labelKey}
                disabled={commandDisabled}
                onClick={() => terminal.setDraft(item.command)}
              >
                {t(item.labelKey as TranslationKey)}
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
                  ? t("terminal.previewEmpty")
                  : workspaceReady
                    ? t("terminal.readyEmpty")
                    : t("terminal.chooseWorkspace")}
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
              placeholder={
                workspaceReady
                  ? shell.name === "PowerShell"
                    ? t("terminal.placeholder.powershell")
                    : t("terminal.placeholder.shell")
                  : t("terminal.chooseWorkspaceFirst")
              }
              aria-label={t("terminal.commandAria")}
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
                {t("common.stop")}
              </button>
            ) : (
              <button
                type="submit"
                className="terminal-run-button"
                disabled={commandDisabled || !terminal.draft.trim()}
              >
                <Play size={14} weight="fill" /> {t("terminal.run")}
              </button>
            )}
          </form>
          <footer title={workspacePath || undefined}>
            <span>
              {preview
                ? t("terminal.desktopOnly")
                : terminal.runningCount > 0
                  ? t(
                      terminal.runningCount === 1
                        ? "terminal.backgroundCommand.one"
                        : "terminal.backgroundCommand.other",
                      { count: terminal.runningCount },
                    )
                  : t("terminal.userInitiated", { shell: shell.name })}
            </span>
            <span>{workspacePath || t("terminal.noWorkspace")}</span>
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
            <div className="terminal-empty">{t("terminal.acpEmpty")}</div>
          )}
        </div>
      )}
    </div>
  );
}
