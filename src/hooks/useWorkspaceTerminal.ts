import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelWorkspaceCommand,
  isDesktopRuntime,
  listenDesktopEvent,
  runWorkspaceCommand,
} from "../lib/desktop";
import type { RecordAuditEvent } from "../lib/audit";
import type { WorkspaceCommandOutput } from "../types";

const MAX_TERMINAL_LINES = 2_000;
const MAX_TERMINAL_CHARACTERS = 512 * 1_024;

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

interface RunningWorkspaceCommand {
  id: string;
  command: string;
}

const createCommandId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

export function useWorkspaceTerminal(
  workspacePath: string,
  activeTaskId: string | null,
  recordAuditEvent: RecordAuditEvent,
) {
  const [lines, setLines] = useState<WorkspaceTerminalLine[]>([]);
  const [draft, setDraftState] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [runningCommand, setRunningCommand] =
    useState<RunningWorkspaceCommand | null>(null);
  const [stopping, setStopping] = useState(false);
  const runningCommandId = useRef<string | null>(null);
  const lineSequence = useRef(0);

  const append = useCallback(
    (kind: WorkspaceTerminalLineKind, text: string) => {
      const normalized = text.replace(/\r$/, "");
      setLines((current) =>
        keepBoundedOutput([
          ...current,
          { id: ++lineSequence.current, kind, text: normalized },
        ]),
      );
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void = () => undefined;
    void listenDesktopEvent<WorkspaceCommandOutput>(
      "workspace-command-output",
      (output) => {
        if (output.commandId !== runningCommandId.current) return;
        append(output.stream, output.line);
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
    if (runningCommandId.current) return;
    setLines([]);
    setDraftState("");
    setHistory([]);
    setHistoryCursor(null);
  }, [workspacePath]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    setHistoryCursor(null);
  }, []);

  const run = useCallback(
    async (commandOverride?: string) => {
      const command = (commandOverride ?? draft).trim();
      if (!command || runningCommandId.current) return;
      if (!workspacePath.trim()) {
        append("system", "Choose a workspace before running a command.");
        return;
      }
      if (!isDesktopRuntime()) {
        append(
          "system",
          "Browser preview is read-only. Workspace commands run only in the installed desktop app.",
        );
        return;
      }

      const id = createCommandId();
      const auditEventId = `command:${id}`;
      const startedAt = Date.now();
      runningCommandId.current = id;
      setRunningCommand({ id, command });
      setStopping(false);
      setHistory((current) =>
        [command, ...current.filter((item) => item !== command)].slice(0, 50),
      );
      setHistoryCursor(null);
      if (commandOverride === undefined) setDraftState("");
      append("command", `PS> ${command}`);
      recordAuditEvent({
        id: auditEventId,
        workspacePath,
        taskId: activeTaskId,
        kind: "command",
        title: command,
        detail: "Workspace command started",
        status: "running",
      });

      try {
        const result = await runWorkspaceCommand(workspacePath, command, id);
        if (result.cancelled) {
          append("system", `Command stopped after ${result.durationMs} ms.`);
        } else {
          const exitLabel =
            result.exitCode === null ? "without an exit code" : `with exit code ${result.exitCode}`;
          append("system", `Command finished ${exitLabel} in ${result.durationMs} ms.`);
        }
        recordAuditEvent({
          id: auditEventId,
          workspacePath,
          taskId: activeTaskId,
          kind: "command",
          title: command,
          detail: result.cancelled
            ? "Stopped by the user"
            : result.exitCode === null
              ? "Finished without an exit code"
              : `Finished with exit code ${result.exitCode}`,
          status: result.cancelled
            ? "stopped"
            : result.exitCode === null || result.exitCode === 0
              ? "succeeded"
              : "failed",
          durationMs: result.durationMs,
          exitCode: result.exitCode,
        });
      } catch (cause) {
        append("stderr", String(cause).replace(/^Error:\s*/, ""));
        recordAuditEvent({
          id: auditEventId,
          workspacePath,
          taskId: activeTaskId,
          kind: "command",
          title: command,
          detail: "Workspace command failed before returning a result",
          status: "failed",
          durationMs: Date.now() - startedAt,
        });
      } finally {
        if (runningCommandId.current === id) runningCommandId.current = null;
        setRunningCommand((current) => (current?.id === id ? null : current));
        setStopping(false);
      }
    },
    [activeTaskId, append, draft, recordAuditEvent, workspacePath],
  );

  const cancel = useCallback(async () => {
    const commandId = runningCommandId.current;
    if (!commandId || stopping) return;
    setStopping(true);
    append("system", "Stopping command and child processes…");
    try {
      await cancelWorkspaceCommand(commandId);
    } catch (cause) {
      append("stderr", String(cause).replace(/^Error:\s*/, ""));
      setStopping(false);
    }
  }, [append, stopping]);

  const recallHistory = useCallback(
    (direction: "older" | "newer") => {
      if (history.length === 0) return;
      setHistoryCursor((current) => {
        const next =
          direction === "older"
            ? Math.min((current ?? -1) + 1, history.length - 1)
            : current === null || current <= 0
              ? null
              : current - 1;
        setDraftState(next === null ? "" : history[next]);
        return next;
      });
    },
    [history],
  );

  return {
    lines,
    draft,
    setDraft,
    history,
    runningCommand,
    running: Boolean(runningCommand),
    stopping,
    run,
    cancel,
    recallHistory,
    clear: () => setLines([]),
  };
}

export type WorkspaceTerminalController = ReturnType<typeof useWorkspaceTerminal>;
