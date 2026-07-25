import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  cancelWorkspaceCommand,
  isDesktopRuntime,
  listenDesktopEvent,
  runWorkspaceCommand,
} from "../lib/desktop";
import type { RecordAuditEvent } from "../lib/audit";
import {
  parseStructuredTestResult,
  type StructuredTestSummary,
} from "../lib/testResults";
import type { WorkspaceCommandOutput, WorkspaceCommandResult } from "../types";

const MAX_TERMINAL_LINES = 2_000;
const MAX_TERMINAL_CHARACTERS = 512 * 1_024;
const MAX_TERMINAL_TABS = 8;
const MAX_COMMAND_RESULTS = 50;

export type WorkspaceTerminalLineKind =
  | "command"
  | "stdout"
  | "stderr"
  | "system";

export interface WorkspaceTerminalLine {
  id: number;
  kind: WorkspaceTerminalLineKind;
  text: string;
}

export interface RunningWorkspaceCommand {
  id: string;
  command: string;
  taskId: string | null;
  startedAt: string;
}

export interface WorkspaceTerminalTab {
  id: string;
  sequence: number;
  title: string;
  autoTitle: boolean;
  draft: string;
  history: string[];
  historyCursor: number | null;
  lines: WorkspaceTerminalLine[];
  runningCommand: RunningWorkspaceCommand | null;
  stopping: boolean;
}

export interface WorkspaceCommandSummary {
  commandId: string;
  terminalId: string;
  terminalTitle: string;
  command: string;
  completedAt: string;
  exitCode: number | null;
  cancelled: boolean;
  failedToStart: boolean;
  durationMs: number;
  structuredTest: StructuredTestSummary | null;
}

const createRuntimeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createTerminalTab = (
  sequence: number,
  title: string,
): WorkspaceTerminalTab => ({
  id: `terminal-${createRuntimeId()}`,
  sequence,
  title,
  autoTitle: true,
  draft: "",
  history: [],
  historyCursor: null,
  lines: [],
  runningCommand: null,
  stopping: false,
});

const keepBoundedOutput = (lines: WorkspaceTerminalLine[]) => {
  const boundedByCount = lines.slice(-MAX_TERMINAL_LINES);
  let characters = 0;
  let start = boundedByCount.length;

  while (start > 0) {
    const nextLength = boundedByCount[start - 1].text.length;
    if (characters + nextLength > MAX_TERMINAL_CHARACTERS) break;
    characters += nextLength;
    start -= 1;
  }
  return boundedByCount.slice(start);
};

const keepBoundedTextOutput = (lines: string[]) => {
  const boundedByCount = lines.slice(-MAX_TERMINAL_LINES);
  let characters = 0;
  let start = boundedByCount.length;

  while (start > 0) {
    const nextLength = boundedByCount[start - 1].length;
    if (characters + nextLength > MAX_TERMINAL_CHARACTERS) break;
    characters += nextLength;
    start -= 1;
  }
  return boundedByCount.slice(start);
};

export function useWorkspaceTerminal(
  workspacePath: string,
  activeTaskId: string | null,
  recordAuditEvent: RecordAuditEvent,
) {
  const { formatNumber, t } = useI18n();
  const [tabs, setTabs] = useState<WorkspaceTerminalTab[]>(() => [
    createTerminalTab(
      1,
      t("terminal.defaultTitle", { number: formatNumber(1) }),
    ),
  ]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [results, setResults] = useState<WorkspaceCommandSummary[]>([]);
  const commandTabs = useRef(new Map<string, string>());
  const runningByTab = useRef(new Map<string, string>());
  const commandOutput = useRef(new Map<string, string[]>());
  const lineSequence = useRef(0);
  const terminalSequence = useRef(1);
  const previousWorkspace = useRef(workspacePath);

  const updateTab = useCallback(
    (tabId: string, update: (tab: WorkspaceTerminalTab) => WorkspaceTerminalTab) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? update(tab) : tab)),
      );
    },
    [],
  );

  const append = useCallback(
    (tabId: string, kind: WorkspaceTerminalLineKind, text: string) => {
      const normalized = text.replace(/\r$/, "");
      updateTab(tabId, (tab) => ({
        ...tab,
        lines: keepBoundedOutput([
          ...tab.lines,
          { id: ++lineSequence.current, kind, text: normalized },
        ]),
      }));
    },
    [updateTab],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void = () => undefined;
    void listenDesktopEvent<WorkspaceCommandOutput>(
      "workspace-command-output",
      (output) => {
        const tabId = commandTabs.current.get(output.commandId);
        if (!tabId) return;
        commandOutput.current.set(
          output.commandId,
          keepBoundedTextOutput([
            ...(commandOutput.current.get(output.commandId) ?? []),
            output.line,
          ]),
        );
        append(tabId, output.stream, output.line);
      },
    ).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten();
    };
  }, [append]);

  useEffect(() => {
    if (previousWorkspace.current === workspacePath) return;
    previousWorkspace.current = workspacePath;
    if (runningByTab.current.size > 0) return;

    terminalSequence.current = 1;
    lineSequence.current = 0;
    commandTabs.current.clear();
    commandOutput.current.clear();
    const firstTab = createTerminalTab(
      1,
      t("terminal.defaultTitle", { number: formatNumber(1) }),
    );
    setTabs([firstTab]);
    setActiveTabId(firstTab.id);
    setResults([]);
  }, [formatNumber, t, workspacePath]);

  useEffect(() => {
    setTabs((current) =>
      current.map((tab) => {
        if (!tab.autoTitle) return tab;
        const title = t("terminal.defaultTitle", {
          number: formatNumber(tab.sequence),
        });
        return tab.title === title ? tab : { ...tab, title };
      }),
    );
  }, [formatNumber, t]);

  useEffect(() => {
    const titles = new Map(tabs.map((tab) => [tab.id, tab.title]));
    setResults((current) => {
      let changed = false;
      const next = current.map((result) => {
        const title = titles.get(result.terminalId);
        if (!title || title === result.terminalTitle) return result;
        changed = true;
        return { ...result, terminalTitle: title };
      });
      return changed ? next : current;
    });
  }, [tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const runningCount = tabs.filter((tab) => tab.runningCommand).length;

  const setDraft = useCallback(
    (value: string) => {
      updateTab(activeTabId, (tab) => ({
        ...tab,
        draft: value,
        historyCursor: null,
      }));
    },
    [activeTabId, updateTab],
  );

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TERMINAL_TABS) return;
    const sequence = ++terminalSequence.current;
    const next = createTerminalTab(
      sequence,
      t("terminal.defaultTitle", { number: formatNumber(sequence) }),
    );
    setTabs((current) => [...current, next]);
    setActiveTabId(next.id);
  }, [formatNumber, t, tabs.length]);

  const closeTab = useCallback(
    (tabId: string) => {
      if (tabs.length === 1 || runningByTab.current.has(tabId)) return;
      const index = tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      setTabs(remaining);
      setResults((current) =>
        current.filter((result) => result.terminalId !== tabId),
      );
      if (activeTabId === tabId) {
        setActiveTabId(remaining[Math.min(index, remaining.length - 1)].id);
      }
    },
    [activeTabId, tabs],
  );

  const renameTab = useCallback(
    (tabId: string, title: string) => {
      const normalized = title.trim().replace(/\s+/g, " ").slice(0, 32);
      if (!normalized) return;
      updateTab(tabId, (tab) => ({
        ...tab,
        title: normalized,
        autoTitle: false,
      }));
      setResults((current) =>
        current.map((result) =>
          result.terminalId === tabId
            ? { ...result, terminalTitle: normalized }
            : result,
        ),
      );
    },
    [updateTab],
  );

  const addCommandResult = useCallback(
    (
      tab: WorkspaceTerminalTab,
      commandId: string,
      command: string,
      result: WorkspaceCommandResult | null,
      fallbackDurationMs: number,
    ) => {
      const summary: WorkspaceCommandSummary = {
        commandId,
        terminalId: tab.id,
        terminalTitle: tab.title,
        command,
        completedAt: new Date().toISOString(),
        exitCode: result?.exitCode ?? null,
        cancelled: result?.cancelled ?? false,
        failedToStart: result === null,
        durationMs: result?.durationMs ?? fallbackDurationMs,
        structuredTest: parseStructuredTestResult(
          commandOutput.current.get(commandId) ?? [],
        ),
      };
      setResults((current) => [summary, ...current].slice(0, MAX_COMMAND_RESULTS));
    },
    [],
  );

  const run = useCallback(
    async (commandOverride?: string) => {
      const tab = tabs.find((candidate) => candidate.id === activeTabId);
      if (!tab || runningByTab.current.has(tab.id)) return;
      const command = (commandOverride ?? tab.draft).trim();
      if (!command) return;
      if (!workspacePath.trim()) {
        append(tab.id, "system", t("terminal.output.chooseWorkspace"));
        return;
      }
      if (!isDesktopRuntime()) {
        append(
          tab.id,
          "system",
          t("terminal.output.previewReadonly"),
        );
        return;
      }

      const id = createRuntimeId();
      const auditEventId = `command:${id}`;
      const startedAt = Date.now();
      const runningCommand: RunningWorkspaceCommand = {
        id,
        command,
        taskId: activeTaskId,
        startedAt: new Date(startedAt).toISOString(),
      };
      commandTabs.current.set(id, tab.id);
      runningByTab.current.set(tab.id, id);
      commandOutput.current.set(id, []);
      updateTab(tab.id, (current) => ({
        ...current,
        draft: commandOverride === undefined ? "" : current.draft,
        history: [
          command,
          ...current.history.filter((item) => item !== command),
        ].slice(0, 50),
        historyCursor: null,
        runningCommand,
        stopping: false,
      }));
      append(tab.id, "command", `PS> ${command}`);
      recordAuditEvent({
        id: auditEventId,
        workspacePath,
        taskId: activeTaskId,
        kind: "command",
        title: command,
        detail: t("terminal.audit.started"),
        status: "running",
      });

      let completion: WorkspaceCommandResult | null = null;
      try {
        completion = await runWorkspaceCommand(workspacePath, command, id);
        if (completion.cancelled) {
          append(
            tab.id,
            "system",
            t("terminal.output.stopped", {
              duration: t("tests.duration.milliseconds", {
                value: formatNumber(completion.durationMs),
              }),
            }),
          );
        } else {
          append(
            tab.id,
            "system",
            completion.exitCode === null
              ? t("terminal.output.finishedNoExit", {
                  duration: t("tests.duration.milliseconds", {
                    value: formatNumber(completion.durationMs),
                  }),
                })
              : t("terminal.output.finished", {
                  code: formatNumber(completion.exitCode),
                  duration: t("tests.duration.milliseconds", {
                    value: formatNumber(completion.durationMs),
                  }),
                }),
          );
        }
        recordAuditEvent({
          id: auditEventId,
          workspacePath,
          taskId: activeTaskId,
          kind: "command",
          title: command,
          detail: completion.cancelled
            ? t("terminal.audit.stopped")
            : completion.exitCode === null
              ? t("terminal.audit.finishedNoExit")
              : t("terminal.audit.finished", {
                  code: formatNumber(completion.exitCode),
                }),
          status: completion.cancelled
            ? "stopped"
            : completion.exitCode === null || completion.exitCode === 0
              ? "succeeded"
              : "failed",
          durationMs: completion.durationMs,
          exitCode: completion.exitCode,
        });
      } catch (cause) {
        append(tab.id, "stderr", String(cause).replace(/^Error:\s*/, ""));
        recordAuditEvent({
          id: auditEventId,
          workspacePath,
          taskId: activeTaskId,
          kind: "command",
          title: command,
          detail: t("terminal.audit.failed"),
          status: "failed",
          durationMs: Date.now() - startedAt,
        });
      } finally {
        addCommandResult(tab, id, command, completion, Date.now() - startedAt);
        commandTabs.current.delete(id);
        commandOutput.current.delete(id);
        if (runningByTab.current.get(tab.id) === id) {
          runningByTab.current.delete(tab.id);
        }
        updateTab(tab.id, (current) =>
          current.runningCommand?.id === id
            ? { ...current, runningCommand: null, stopping: false }
            : current,
        );
      }
    },
    [
      activeTabId,
      activeTaskId,
      addCommandResult,
      append,
      formatNumber,
      recordAuditEvent,
      tabs,
      t,
      updateTab,
      workspacePath,
    ],
  );

  const cancel = useCallback(async () => {
    const commandId = runningByTab.current.get(activeTabId);
    if (!commandId || activeTab?.stopping) return;
    updateTab(activeTabId, (tab) => ({ ...tab, stopping: true }));
    append(activeTabId, "system", t("terminal.output.stopping"));
    try {
      await cancelWorkspaceCommand(commandId);
    } catch (cause) {
      append(activeTabId, "stderr", String(cause).replace(/^Error:\s*/, ""));
      updateTab(activeTabId, (tab) => ({ ...tab, stopping: false }));
    }
  }, [activeTab?.stopping, activeTabId, append, t, updateTab]);

  const recallHistory = useCallback(
    (direction: "older" | "newer") => {
      updateTab(activeTabId, (tab) => {
        if (tab.history.length === 0) return tab;
        const next =
          direction === "older"
            ? Math.min(
                (tab.historyCursor ?? -1) + 1,
                tab.history.length - 1,
              )
            : tab.historyCursor === null || tab.historyCursor <= 0
              ? null
              : tab.historyCursor - 1;
        return {
          ...tab,
          historyCursor: next,
          draft: next === null ? "" : tab.history[next],
        };
      });
    },
    [activeTabId, updateTab],
  );

  const clear = useCallback(() => {
    if (runningByTab.current.has(activeTabId)) return;
    updateTab(activeTabId, (tab) => ({ ...tab, lines: [] }));
  }, [activeTabId, updateTab]);

  const clearResults = useCallback(() => {
    if (runningByTab.current.size === 0) setResults([]);
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    canAddTab: tabs.length < MAX_TERMINAL_TABS,
    maxTabs: MAX_TERMINAL_TABS,
    lines: activeTab?.lines ?? [],
    draft: activeTab?.draft ?? "",
    setDraft,
    history: activeTab?.history ?? [],
    runningCommand: activeTab?.runningCommand ?? null,
    activeTabRunning: Boolean(activeTab?.runningCommand),
    running: runningCount > 0,
    runningCount,
    stopping: activeTab?.stopping ?? false,
    results,
    run,
    cancel,
    recallHistory,
    clear,
    clearResults,
  };
}

export type WorkspaceTerminalController = ReturnType<typeof useWorkspaceTerminal>;
