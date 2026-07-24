import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSessionUpdate, planFromUpdate, toolFromUpdate } from "../lib/acp";
import type { RecordAuditEvent } from "../lib/audit";
import {
  backgroundTaskCount,
  parseTaskScopedEvent,
  type TaskSessionStatus,
} from "../lib/backgroundRuntime";
import {
  answerClientRequest,
  cancelAcpTurn,
  fetchGrokSubscription,
  installGrokCli,
  inspectRuntimeModels,
  isDesktopRuntime,
  launchOAuth,
  listenDesktopEvent,
  openGrokSubscription,
  probeRuntime,
  requestTaskAttention,
  sendAcpPrompt,
  startAcpSession,
  stopAcpSession,
} from "../lib/desktop";
import { deriveTaskTitle, NEW_TASK_TITLE } from "../lib/tasks";
import {
  loadDefaultRuntimeProfile,
  saveDefaultRuntimeProfile,
} from "../lib/runtimeProfile";
import { isWorkspaceSelected } from "../lib/workspace";
import type { UpdateTask } from "./useTaskStore";
import type {
  AcpSessionInfo,
  ChatEntry,
  GrokSubscription,
  GrokTask,
  PermissionOption,
  PermissionRequest,
  PromptAttachment,
  PromptCapabilities,
  RuntimeStatus,
  RuntimeLaunchProfile,
  RuntimeModelState,
  ToolActivity,
} from "../types";

interface ClientRequestPayload {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface RuntimeNotice {
  message: string;
  taskId: string | null;
  kind: "info" | "success" | "error" | "permission";
}

const GLOBAL_LOG_KEY = "__grokdesk_global__";

const formatTime = () =>
  new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

const createEntryId = (role: ChatEntry["role"]) => {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${role}-${suffix}`;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const isAuthenticationError = (cause: unknown) =>
  /authentication required|re-authentication required|no auth method id/i.test(
    String(cause),
  );

const runtimeStatusText = (runtime: RuntimeStatus) =>
  runtime.available
    ? runtime.authenticationState === "verified"
      ? "Grok Build · ACP ready"
      : runtime.authenticationState === "configured"
        ? "Grok Build · OAuth configured"
        : "Grok Build · Sign in required"
    : "Grok Build · Not installed";

export function useGrokRuntime(
  workspacePath: string,
  activeTask: GrokTask | null,
  updateTask: UpdateTask,
  recordAuditEvent: RecordAuditEvent,
) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionsByTask, setSessionsByTask] = useState<
    Record<string, AcpSessionInfo>
  >({});
  const [inspectedRuntimeModelState, setInspectedRuntimeModelState] =
    useState<RuntimeModelState | null>(null);
  const [defaultRuntimeProfile, setDefaultRuntimeProfile] =
    useState<RuntimeLaunchProfile>(loadDefaultRuntimeProfile);
  const [terminalLinesByTask, setTerminalLinesByTask] = useState<
    Record<string, string[]>
  >({});
  const [permissionsByTask, setPermissionsByTask] = useState<
    Record<string, PermissionRequest>
  >({});
  const [runningTaskIds, setRunningTaskIds] = useState<string[]>([]);
  const [attentionTaskIds, setAttentionTaskIds] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
  const [modelConfiguring, setModelConfiguring] = useState(false);
  const [subscription, setSubscription] = useState<GrokSubscription | null>(null);
  const [statusText, setStatusText] = useState("Inspecting Grok Build…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<RuntimeNotice | null>(null);
  const mounted = useRef(true);
  const activeTaskRef = useRef(activeTask);
  const sessionsRef = useRef(new Map<string, AcpSessionInfo>());
  const runningTaskIdsRef = useRef(new Set<string>());
  const ignoredSessionTaskIdsRef = useRef(new Set<string>());
  const connectionQueuesRef = useRef(new Map<string, Promise<unknown>>());
  const cancelledTaskIdsRef = useRef(new Set<string>());
  const accountAutoRefreshStarted = useRef(false);

  activeTaskRef.current = activeTask;
  const activeTaskId = activeTask?.id ?? null;
  const activeSession = activeTaskId
    ? sessionsByTask[activeTaskId] ?? null
    : null;
  const sessionId = activeSession?.sessionId ?? null;
  const promptCapabilities: PromptCapabilities | null =
    activeSession?.promptCapabilities ?? null;
  const runtimeModelState =
    activeSession?.runtimeModelState ?? inspectedRuntimeModelState;
  const permission = activeTaskId
    ? permissionsByTask[activeTaskId] ?? null
    : null;
  const pendingPermissionTaskIds = Object.keys(permissionsByTask);
  const busy = activeTaskId
    ? runningTaskIds.includes(activeTaskId)
    : false;
  const anyBusy = runningTaskIds.length > 0;
  const hasAnyPermission = pendingPermissionTaskIds.length > 0;
  const terminalLines = [
    ...(terminalLinesByTask[GLOBAL_LOG_KEY] ?? []),
    ...(activeTaskId ? terminalLinesByTask[activeTaskId] ?? [] : []),
  ].slice(-120);
  const runningInBackground = backgroundTaskCount(
    runningTaskIds,
    activeTaskId,
  );

  const showNotice = useCallback(
    (
      message: string,
      options: {
        taskId?: string | null;
        kind?: RuntimeNotice["kind"];
      } = {},
    ) => {
      setNotice({
        message,
        taskId: options.taskId ?? null,
        kind: options.kind ?? "info",
      });
    },
    [],
  );

  const setTaskSession = useCallback(
    (taskId: string, session: AcpSessionInfo | null) => {
      if (session) {
        sessionsRef.current.set(taskId, session);
      } else {
        sessionsRef.current.delete(taskId);
      }
      setSessionsByTask(Object.fromEntries(sessionsRef.current));
    },
    [],
  );

  const setTaskRunning = useCallback((taskId: string, running: boolean) => {
    if (running) {
      runningTaskIdsRef.current.add(taskId);
    } else {
      runningTaskIdsRef.current.delete(taskId);
    }
    setRunningTaskIds([...runningTaskIdsRef.current]);
  }, []);

  const appendTerminalLine = useCallback((taskId: string, line: string) => {
    setTerminalLinesByTask((current) => ({
      ...current,
      [taskId]: [...(current[taskId] ?? []), line].slice(-120),
    }));
  }, []);

  const notifyBackgroundTask = useCallback(
    (
      taskId: string,
      message: string,
      kind: RuntimeNotice["kind"],
    ) => {
      if (activeTaskRef.current?.id === taskId) return;
      setAttentionTaskIds((current) =>
        current.includes(taskId) ? current : [...current, taskId],
      );
      showNotice(message, { taskId, kind });
      void requestTaskAttention().catch(() => undefined);
    },
    [showNotice],
  );

  const refreshRuntime = useCallback(async () => {
    try {
      const next = await probeRuntime();
      if (!mounted.current) return null;
      setRuntime(next);
      setStatusText(runtimeStatusText(next));
      return next;
    } catch (cause) {
      if (!mounted.current) return null;
      setError(String(cause));
      setStatusText("Grok Build · Detection failed");
      return null;
    }
  }, []);

  const updateConnectedTask = useCallback(
    (
      taskId: string,
      updater: (task: GrokTask) => GrokTask,
      options: { touch?: boolean } = {},
    ) => {
      updateTask(taskId, (current) => {
        const next = updater(current);
        if (next === current) return current;
        return {
          ...next,
          updatedAt:
            options.touch === false ? next.updatedAt : new Date().toISOString(),
        };
      });
    },
    [updateTask],
  );

  useEffect(() => {
    mounted.current = true;
    void refreshRuntime();

    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const subscriptions = [
      listenDesktopEvent<unknown>("grok://session-update", (payload) => {
        const scoped = parseTaskScopedEvent<unknown>(payload);
        if (
          !scoped ||
          ignoredSessionTaskIdsRef.current.has(scoped.taskId)
        ) {
          return;
        }
        const update = normalizeSessionUpdate(scoped.payload);
        if (!update) return;
        const taskId = scoped.taskId;

        const nextPlan = planFromUpdate(update);
        if (nextPlan) {
          updateConnectedTask(taskId, (task) => ({ ...task, plan: nextPlan }));
        }

        const nextTool = toolFromUpdate(update);
        if (nextTool) {
          recordAuditEvent({
            id: `tool:${
              sessionsRef.current.get(taskId)?.sessionId ?? taskId
            }:${nextTool.id}`,
            workspacePath,
            taskId,
            kind: "tool",
            title: nextTool.target,
            detail: nextTool.action,
            status:
              nextTool.status === "complete"
                ? "succeeded"
                : nextTool.status === "failed"
                  ? "failed"
                  : nextTool.status === "pending"
                    ? "pending"
                    : "running",
          });
          updateConnectedTask(taskId, (task) => {
            const index = task.tools.findIndex((item) => item.id === nextTool.id);
            const tools =
              index === -1
                ? [...task.tools, nextTool].slice(-12)
                : task.tools.map((item) =>
                    item.id === nextTool.id ? nextTool : item,
                  );
            return { ...task, tools };
          });
        }

        const messageChunk = update.content?.text;
        if (update.sessionUpdate === "agent_message_chunk" && messageChunk) {
          updateConnectedTask(taskId, (task) => {
            const last = task.messages.at(-1);
            const messages =
              last?.role === "agent" && last.streaming
                ? task.messages.map((entry, index) =>
                    index === task.messages.length - 1
                      ? { ...entry, content: entry.content + messageChunk }
                      : entry,
                  )
                : [
                    ...task.messages,
                    {
                      id: createEntryId("agent"),
                      role: "agent" as const,
                      name: "Grok Build",
                      time: formatTime(),
                      createdAt: new Date().toISOString(),
                      content: messageChunk,
                      streaming: true,
                    },
                  ];
            return { ...task, messages, status: "running" };
          });
        }
      }),
      listenDesktopEvent<ClientRequestPayload>(
        "grok://client-request",
        (payload) => {
          const scoped = parseTaskScopedEvent<ClientRequestPayload>(payload);
          if (!scoped || !Number.isFinite(scoped.payload.id)) return;
          const taskId = scoped.taskId;
          const request = scoped.payload;
          const rawOptions = Array.isArray(request.params?.options)
            ? request.params.options
            : [];
          const options = rawOptions
            .filter(
              (value): value is Record<string, unknown> =>
                Boolean(value && typeof value === "object"),
            )
            .map(
              (option, index): PermissionOption => ({
                optionId: String(
                  option.optionId ?? option.option_id ?? `option-${index}`,
                ),
                name: String(option.name ?? option.label ?? `Option ${index + 1}`),
                kind: option.kind ? String(option.kind) : undefined,
              }),
            );

          const auditEventId = `permission:${
            sessionsRef.current.get(taskId)?.sessionId ?? taskId
          }:${request.id}`;
          const nextPermission: PermissionRequest = {
            taskId,
            id: request.id,
            auditEventId,
            title: String(
              request.params?.title ?? "Grok Build needs permission",
            ),
            description: String(
              request.params?.description ??
                request.params?.toolCallTitle ??
                "Review this action before Grok Build continues.",
            ),
            options:
              options.length > 0
                ? options
                : [
                    {
                      optionId: "allow_once",
                      name: "Allow once",
                      kind: "allow_once",
                    },
                    {
                      optionId: "reject_once",
                      name: "Deny",
                      kind: "reject_once",
                    },
                  ],
          };
          setPermissionsByTask((current) => ({
            ...current,
            [taskId]: nextPermission,
          }));
          recordAuditEvent({
            id: auditEventId,
            workspacePath,
            taskId,
            kind: "permission",
            title: nextPermission.title,
            detail: "Waiting for your decision",
            status: "pending",
          });
          notifyBackgroundTask(
            taskId,
            "A background Grok task needs your permission.",
            "permission",
          );
        },
      ),
      listenDesktopEvent<unknown>("grok://stderr", (payload) => {
        const scoped = parseTaskScopedEvent<string>(payload);
        if (scoped && typeof scoped.payload === "string") {
          appendTerminalLine(scoped.taskId, scoped.payload);
        }
      }),
      listenDesktopEvent<string>("grok://install-log", (line) => {
        appendTerminalLine(GLOBAL_LOG_KEY, line);
      }),
      listenDesktopEvent<string>("grok://status", (status) =>
        setStatusText(status),
      ),
      listenDesktopEvent<unknown>("grok://session-status", (payload) => {
        const scoped = parseTaskScopedEvent<TaskSessionStatus>(payload);
        if (!scoped) return;
        if (scoped.payload.state !== "connected") {
          setTaskSession(scoped.taskId, null);
        }
        if (activeTaskRef.current?.id === scoped.taskId) {
          setStatusText(
            scoped.payload.state === "connected"
              ? "Grok Build · ACP connected"
              : "Grok Build · Session ready to restore",
          );
        }
      }),
    ];

    void Promise.all(subscriptions).then((items) => {
      if (disposed) {
        items.forEach((unlisten) => unlisten());
      } else {
        unlisteners.push(...items);
      }
    });

    return () => {
      disposed = true;
      mounted.current = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    appendTerminalLine,
    notifyBackgroundTask,
    recordAuditEvent,
    refreshRuntime,
    setTaskSession,
    updateConnectedTask,
    workspacePath,
  ]);

  const connectTask = useCallback(
    (
      task: GrokTask,
      restart = false,
      forceNewSession = false,
    ): Promise<string> => {
      const run = async () => {
        const currentSession = sessionsRef.current.get(task.id);

        setError(null);
        if (activeTaskRef.current?.id === task.id) {
          setStatusText(
            task.acpSessionId
              ? "Restoring Grok Build session…"
              : "Starting Grok Build ACP…",
          );
        }

        const resumeSessionId = forceNewSession
          ? null
          : currentSession?.sessionId ?? task.acpSessionId ?? null;
        const taskWorkspace = isWorkspaceSelected(task.workspacePath)
          ? task.workspacePath
          : workspacePath;
        if (!isWorkspaceSelected(taskWorkspace)) {
          throw new Error("Choose a project folder before starting Grok Build.");
        }

        try {
          if (currentSession && (restart || forceNewSession)) {
            await stopAcpSession(task.id);
            setTaskSession(task.id, null);
          }

          if (resumeSessionId) {
            ignoredSessionTaskIdsRef.current.add(task.id);
          }
          const session = await startAcpSession(
            task.id,
            taskWorkspace,
            resumeSessionId,
            task.runtimeProfile,
          );
          const nextSessionId = session.sessionId;
          setTaskSession(task.id, session);
          updateTask(task.id, (current) => {
            const resolvedProfile = session.runtimeProfile;
            if (
              current.acpSessionId === nextSessionId &&
              current.runtimeProfile.modelId === resolvedProfile.modelId &&
              current.runtimeProfile.reasoningEffort ===
                resolvedProfile.reasoningEffort
            ) {
              return current;
            }
            return {
              ...current,
              acpSessionId: nextSessionId,
              runtimeProfile: resolvedProfile,
            };
          });
          setRuntime((current) =>
            current ? { ...current, authenticationState: "verified" } : current,
          );
          if (activeTaskRef.current?.id === task.id) {
            setStatusText(
              resumeSessionId
                ? "Grok Build · Session restored"
                : "Grok Build · ACP connected",
            );
          }
          return nextSessionId;
        } catch (cause) {
          setTaskSession(task.id, null);
          if (isAuthenticationError(cause)) {
            setRuntime((current) =>
              current ? { ...current, authenticationState: "expired" } : current,
            );
          }
          if (activeTaskRef.current?.id === task.id) {
            setStatusText(
              isAuthenticationError(cause)
                ? "Grok Build · Sign in required"
                : "Grok Build · ACP connection failed",
            );
          }
          setError(String(cause));
          throw cause;
        } finally {
          ignoredSessionTaskIdsRef.current.delete(task.id);
        }
      };

      const queue =
        connectionQueuesRef.current.get(task.id) ?? Promise.resolve();
      const operation = queue.then(run, run);
      connectionQueuesRef.current.set(
        task.id,
        operation.then(
          () => undefined,
          () => undefined,
        ),
      );
      return operation;
    },
    [setTaskSession, updateTask, workspacePath],
  );

  const connect = useCallback(
    async (restart = false) => {
      const task = activeTaskRef.current;
      if (!task) throw new Error("Create a task before starting Grok Build ACP.");
      return connectTask(task, restart);
    },
    [connectTask],
  );

  const refreshRuntimeModels = useCallback(async () => {
    if (modelCatalogLoading) return runtimeModelState;
    setModelCatalogLoading(true);
    setError(null);
    try {
      const next = await inspectRuntimeModels();
      setInspectedRuntimeModelState(next);
      return next;
    } catch (cause) {
      setError(String(cause));
      throw cause;
    } finally {
      setModelCatalogLoading(false);
    }
  }, [modelCatalogLoading, runtimeModelState]);

  const configureRuntimeProfile = useCallback(
    async (requested: RuntimeLaunchProfile) => {
      if (modelConfiguring) return;
      const fail = (message: string): never => {
        setError(message);
        throw new Error(message);
      };
      const model = runtimeModelState?.availableModels.find(
        (candidate) => candidate.modelId === requested.modelId,
      );
      if (!model) {
        const message =
          "Refresh the official Runtime model list before saving this model.";
        setError(message);
        throw new Error(message);
      }
      const reasoningEffort = requested.reasoningEffort
        ? (model.reasoningEfforts.find(
            (effort) => effort.value === requested.reasoningEffort,
          )?.value ?? null)
        : null;
      if (requested.reasoningEffort && !reasoningEffort) {
        fail(
          "The selected reasoning effort is not reported for this model.",
        );
      }
      if (busy || permission) {
        fail(
          "Wait for the current Runtime action to finish before changing models.",
        );
      }

      let profile: RuntimeLaunchProfile;
      try {
        profile = saveDefaultRuntimeProfile({
          modelId: model.modelId,
          reasoningEffort,
        });
        setDefaultRuntimeProfile(profile);
      } catch (cause) {
        setError(String(cause));
        throw cause;
      }
      const task = activeTaskRef.current;
      const authenticationReady =
        runtime?.available === true &&
        runtime.authenticationState !== "missing" &&
        runtime.authenticationState !== "expired";
      if (
        !task ||
        task.messages.length > 0 ||
        !authenticationReady ||
        !isWorkspaceSelected(workspacePath)
      ) {
        showNotice(
          task?.messages.length
            ? "模型设置已保存为新任务默认值；当前已有对话的任务继续使用原 ACP 会话。"
            : "模型设置已保存为新任务默认值；完成登录并选择工作区后会在新任务中生效。",
        );
        return;
      }

      setModelConfiguring(true);
      setError(null);
      const nextTask: GrokTask = {
        ...task,
        acpSessionId: null,
        runtimeProfile: profile,
      };
      updateTask(task.id, () => nextTask);
      try {
        await connectTask(nextTask, false, true);
        showNotice(
          `${model.name} · ${
            model.reasoningEfforts.find(
              (effort) => effort.value === reasoningEffort,
            )?.label ?? "Runtime default effort"
          } 已应用到当前空任务，并保存为新任务默认值。`,
        );
      } finally {
        setModelConfiguring(false);
      }
    },
    [
      busy,
      connectTask,
      modelConfiguring,
      permission,
      runtime,
      runtimeModelState,
      showNotice,
      updateTask,
      workspacePath,
    ],
  );

  useEffect(() => {
    const authenticationReady =
      runtime?.available === true &&
      runtime.authenticationState !== "missing" &&
      runtime.authenticationState !== "expired";
    if (
      !activeTask?.id ||
      !isWorkspaceSelected(workspacePath) ||
      !authenticationReady ||
      signingIn ||
      busy
    ) return;

    const task = activeTaskRef.current;
    if (task) void connectTask(task).catch(() => undefined);
  }, [activeTask?.id, busy, connectTask, runtime, signingIn]);

  useEffect(() => {
    if (!activeTaskId) return;
    setAttentionTaskIds((current) =>
      current.filter((taskId) => taskId !== activeTaskId),
    );
  }, [activeTaskId]);

  const runBrowserDemo = useCallback(
    async (taskId: string, prompt: string, attachmentCount: number) => {
      const response = [
        "### Browser preview\n\n",
        "Your task and message were saved **locally in this preview**.\n\n",
        attachmentCount > 0
          ? `- **Attachments:** ${attachmentCount} selected for interface testing; no file content was sent or uploaded.\n`
          : "",
        "- **Desktop behavior:** the installed app sends the prompt through the official `Grok Build ACP` session.\n\n",
        "| Preview check | Result |\n| --- | --- |\n| Local task | Saved |\n| External upload | Not performed |\n\n",
        "```text\nNo command was executed in browser preview.\n```\n\n",
        prompt
          ? `> Current preview request: “${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}”`
          : "> Current preview request contains attachments only.",
      ];
      const previewTools = [
        ["Read", "Preview only · no workspace files read"],
        ["Update", "Preview only · no files changed"],
        ["Run", "Preview only · no command executed"],
        ["Test", "Preview only · no test process started"],
        ["Read", "Preview only · no Git state inspected"],
        ["Update", "Preview only · interface demonstration"],
      ].map(
        ([action, target], index): ToolActivity => ({
          id: `preview-tool-${index}`,
          action,
          target,
          progress: 100,
          status: "complete",
        }),
      );

      updateTask(taskId, (task) => ({
        ...task,
        tools: previewTools,
        messages: [
          ...task.messages,
          {
            id: createEntryId("agent"),
            role: "agent",
            name: "Grok Build",
            time: formatTime(),
            createdAt: new Date().toISOString(),
            content: "",
            streaming: true,
          },
        ],
      }));

      for (const chunk of response) {
        await delay(220);
        if (cancelledTaskIdsRef.current.has(taskId)) break;
        updateTask(taskId, (task) => ({
          ...task,
          updatedAt: new Date().toISOString(),
          messages: task.messages.map((entry, index) =>
            index === task.messages.length - 1
              ? { ...entry, content: entry.content + chunk }
              : entry,
          ),
        }));
      }
    },
    [updateTask],
  );

  const send = useCallback(
    async (rawText: string, attachments: PromptAttachment[] = []) => {
      const text = rawText.trim();
      const task = activeTaskRef.current;
      if (
        (!text && attachments.length === 0) ||
        !task ||
        runningTaskIdsRef.current.has(task.id)
      ) {
        return;
      }

      const attachmentSummaries = attachments.map(({ data: _data, ...summary }) =>
        summary,
      );
      const titleSource = text || `Review ${attachmentSummaries[0]?.name ?? "attachments"}`;

      const taskId = task.id;
      const taskTitle =
        task.messages.length === 0 && task.title === NEW_TASK_TITLE
          ? deriveTaskTitle(titleSource)
          : task.title;
      cancelledTaskIdsRef.current.delete(taskId);
      setTaskRunning(taskId, true);
      setError(null);
      updateTask(taskId, (current) => {
        const firstMessage = current.messages.length === 0;
        return {
          ...current,
          title: firstMessage && current.title === NEW_TASK_TITLE
            ? taskTitle
            : current.title,
          updatedAt: new Date().toISOString(),
          status: "running",
          messages: [
            ...current.messages.map((entry) => ({
              ...entry,
              streaming: false,
            })),
            {
              id: createEntryId("user"),
              role: "user",
              name: "You",
              time: formatTime(),
              createdAt: new Date().toISOString(),
              content: text,
              attachments: attachmentSummaries,
            },
          ],
        };
      });

      let succeeded = false;
      try {
        await connectTask(task);
        if (isDesktopRuntime()) {
          await sendAcpPrompt(taskId, text, attachments);
        } else {
          await runBrowserDemo(taskId, text, attachments.length);
        }
        succeeded = true;
      } catch (cause) {
        if (activeTaskRef.current?.id === taskId) {
          setError(String(cause));
        }
        appendTerminalLine(taskId, `[error] ${String(cause)}`);
        if (isDesktopRuntime()) {
          await stopAcpSession(taskId).catch(() => undefined);
          setTaskSession(taskId, null);
          if (activeTaskRef.current?.id === taskId) {
            setStatusText("Grok Build · Ready to retry");
          }
        }
      } finally {
        const cancelled = cancelledTaskIdsRef.current.has(taskId);
        cancelledTaskIdsRef.current.delete(taskId);
        updateTask(taskId, (current) => ({
          ...current,
          updatedAt: new Date().toISOString(),
          status: cancelled ? "idle" : succeeded ? "complete" : "error",
          messages: current.messages.map((entry) => ({
            ...entry,
            streaming: false,
          })),
        }));
        setTaskRunning(taskId, false);
        if (!cancelled) {
          notifyBackgroundTask(
            taskId,
            succeeded
              ? `“${taskTitle}” finished in the background.`
              : `“${taskTitle}” needs attention.`,
            succeeded ? "success" : "error",
          );
        }
      }
    },
    [
      appendTerminalLine,
      connectTask,
      notifyBackgroundTask,
      runBrowserDemo,
      setTaskRunning,
      setTaskSession,
      updateTask,
    ],
  );

  const retry = useCallback(async () => {
    const task = activeTaskRef.current;
    const previousMessage = task?.messages
      .slice()
      .reverse()
      .find((entry) => entry.role === "user");
    if (!previousMessage) {
      setError("There is no previous prompt to retry.");
      return;
    }
    if (previousMessage.attachments && previousMessage.attachments.length > 0) {
      setError(
        "Attachment contents are not saved in task history. Add the files again before retrying this prompt.",
      );
      return;
    }
    await send(previousMessage.content);
  }, [send]);

  const cancel = useCallback(async () => {
    const taskId = activeTaskRef.current?.id;
    if (!taskId || !runningTaskIdsRef.current.has(taskId)) return;
    cancelledTaskIdsRef.current.add(taskId);
    try {
      await cancelAcpTurn(taskId);
      setStatusText("Grok Build · Turn cancelled");
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const installRuntime = useCallback(async () => {
    if (installing) return;
    setInstalling(true);
    setError(null);
    setStatusText("Installing official Grok Runtime…");
    if (!isDesktopRuntime()) {
      setTerminalLinesByTask((current) => ({
        ...current,
        [GLOBAL_LOG_KEY]: [
          ...(current[GLOBAL_LOG_KEY] ?? []),
        "[preview] Simulating the official Grok Runtime installer. No software is changed.",
        ].slice(-120),
      }));
    }

    try {
      const next = await installGrokCli();
      setRuntime(next);
      setStatusText(runtimeStatusText(next));
      return next;
    } catch (cause) {
      setError(String(cause));
      setStatusText("Grok Runtime installation failed");
      throw cause;
    } finally {
      setInstalling(false);
    }
  }, [installing]);

  const verifySubscription = useCallback(async () => {
    if (subscriptionLoading) return subscription;
    setSubscriptionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const task = activeTaskRef.current;
      if (!task) {
        throw new Error("Create a task before refreshing account information.");
      }
      await connect();
      const next = await fetchGrokSubscription(task.id);
      setSubscription(next);
      setStatusText("Grok Build · Account refreshed");
      showNotice(
        next.availability === "unsupported"
          ? next.message ||
              "Sign-in is verified, but the official Grok CLI does not expose subscription or quota data."
          : "Account, subscription, and quota information refreshed.",
      );
      return next;
    } catch (cause) {
      setError(String(cause));
      throw cause;
    } finally {
      setSubscriptionLoading(false);
    }
  }, [connect, showNotice, subscription, subscriptionLoading]);

  const signIn = useCallback(async () => {
    if (signingIn) return;
    if (anyBusy || hasAnyPermission) {
      const message =
        "Wait for background tasks and permission requests before starting OAuth.";
      setError(message);
      throw new Error(message);
    }
    setSigningIn(true);
    setSubscriptionLoading(false);
    setSubscription(null);
    accountAutoRefreshStarted.current = false;
    setError(null);
    setNotice(null);
    setStatusText("Opening official Grok OAuth…");

    try {
      const result = await launchOAuth();
      if (!result.succeeded) {
        throw new Error(
          result.message || "The official Grok sign-in did not complete.",
        );
      }

      const nextRuntime = await probeRuntime();
      if (
        nextRuntime.authenticationState === "missing" ||
        nextRuntime.authenticationState === "expired"
      ) {
        throw new Error(
          "Browser authorization finished, but the official Grok CLI has not saved valid credentials.",
        );
      }
      setRuntime(nextRuntime);
      setStatusText("Grok sign-in succeeded. Refreshing account information…");
      showNotice("Grok sign-in succeeded. Refreshing account information…");

      if (!isWorkspaceSelected(workspacePath) || !activeTaskRef.current) {
        setStatusText("Grok Build · Signed in · Choose a workspace");
        showNotice(
          "Grok sign-in succeeded. Choose a project folder to start ACP and refresh account information.",
        );
        return;
      }

      try {
        // A fresh ACP process must read the credentials written by this OAuth attempt.
        await stopAcpSession();
        sessionsRef.current.clear();
        setSessionsByTask({});
        const task = activeTaskRef.current;
        if (!task) {
          throw new Error("Create a task before verifying the refreshed account.");
        }
        await connect(true);
        setSubscriptionLoading(true);
        const nextSubscription = await fetchGrokSubscription(task.id);
        setSubscription(nextSubscription);
        setStatusText("Grok Build · Signed in and verified");
        showNotice(
          nextSubscription.availability === "unsupported"
            ? nextSubscription.message ||
                "Sign-in is verified, but the official Grok CLI does not expose subscription or quota data."
            : "Grok sign-in succeeded and account information was refreshed.",
        );
        if (!isDesktopRuntime()) {
          appendTerminalLine(
            GLOBAL_LOG_KEY,
            "[preview] OAuth completion was simulated. No account was accessed or changed.",
          );
        }
      } catch (refreshCause) {
        setStatusText("Grok Build · OAuth configured");
        setError(
          `Grok sign-in succeeded, but account refresh failed: ${String(refreshCause)}`,
        );
        showNotice(
          "Grok sign-in succeeded. You can retry account refresh from Settings.",
        );
      }
    } catch (cause) {
      setNotice(null);
      setError(String(cause));
      setStatusText("Grok Build · Sign in failed");
      throw cause;
    } finally {
      setSubscriptionLoading(false);
      setSigningIn(false);
    }
  }, [
    anyBusy,
    appendTerminalLine,
    connect,
    hasAnyPermission,
    showNotice,
    signingIn,
    workspacePath,
  ]);

  useEffect(() => {
    const authenticationReady =
      runtime?.available === true &&
      runtime.authenticationState !== "missing" &&
      runtime.authenticationState !== "expired";
    if (
      !activeTask?.id ||
      !isWorkspaceSelected(workspacePath) ||
      !authenticationReady ||
      signingIn ||
      subscriptionLoading ||
      subscription ||
      accountAutoRefreshStarted.current
    ) {
      return;
    }

    accountAutoRefreshStarted.current = true;
    void verifySubscription().catch(() => undefined);
  }, [activeTask?.id, runtime, signingIn, subscription, subscriptionLoading, verifySubscription, workspacePath]);

  const manageSubscription = useCallback(async () => {
    try {
      await openGrokSubscription();
    } catch (cause) {
      setError(String(cause));
      throw cause;
    }
  }, []);

  const answerPermission = useCallback(
    async (option: PermissionOption | null) => {
      if (!permission) return;
      const result = option
        ? { outcome: { outcome: "selected", optionId: option.optionId } }
        : { outcome: { outcome: "cancelled" } };
      const rejected = Boolean(
        option &&
          (/reject|deny/i.test(option.kind ?? "") || /deny|reject/i.test(option.name)),
      );
      try {
        await answerClientRequest(permission.taskId, permission.id, result);
        recordAuditEvent({
          id: permission.auditEventId,
          workspacePath:
            activeTaskRef.current?.id === permission.taskId
              ? activeTaskRef.current.workspacePath
              : workspacePath,
          taskId: permission.taskId,
          kind: "permission",
          title: permission.title,
          detail: option?.name ?? "Dismissed without selecting an option",
          status: option ? (rejected ? "denied" : "allowed") : "cancelled",
        });
        setPermissionsByTask((current) => {
          if (current[permission.taskId]?.id !== permission.id) return current;
          const next = { ...current };
          delete next[permission.taskId];
          return next;
        });
      } catch (cause) {
        recordAuditEvent({
          id: permission.auditEventId,
          workspacePath:
            activeTaskRef.current?.id === permission.taskId
              ? activeTaskRef.current.workspacePath
              : workspacePath,
          taskId: permission.taskId,
          kind: "permission",
          title: permission.title,
          detail: "The decision could not be delivered to the Runtime",
          status: "failed",
        });
        setError(String(cause));
        throw cause;
      }
    },
    [permission, recordAuditEvent, workspacePath],
  );

  const disconnectTask = useCallback(async (taskId: string) => {
    if (runningTaskIdsRef.current.has(taskId)) {
      throw new Error(
        "Wait for this Grok task to finish or cancel it before disconnecting.",
      );
    }
    const stop = async () => {
      await stopAcpSession(taskId);
      setTaskSession(taskId, null);
      if (activeTaskRef.current?.id === taskId) {
        setStatusText("Grok Build · OAuth verified");
      }
    };
    const queue =
      connectionQueuesRef.current.get(taskId) ?? Promise.resolve();
    const operation = queue.then(stop, stop);
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    connectionQueuesRef.current.set(taskId, settled);
    try {
      await operation;
    } catch (cause) {
      setError(String(cause));
      throw cause;
    } finally {
      if (connectionQueuesRef.current.get(taskId) === settled) {
        connectionQueuesRef.current.delete(taskId);
      }
    }
  }, [setTaskSession]);

  const disconnectAll = useCallback(async () => {
    if (runningTaskIdsRef.current.size > 0) {
      throw new Error(
        "Wait for all Grok tasks to finish or cancel them before switching workspaces.",
      );
    }
    try {
      await Promise.allSettled(connectionQueuesRef.current.values());
      await stopAcpSession();
      sessionsRef.current.clear();
      connectionQueuesRef.current.clear();
      ignoredSessionTaskIdsRef.current.clear();
      setSessionsByTask({});
      setPermissionsByTask({});
      setStatusText("Grok Build · OAuth verified");
    } catch (cause) {
      setError(String(cause));
      throw cause;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const taskId = activeTaskRef.current?.id;
    if (!taskId) return;
    await disconnectTask(taskId);
  }, [disconnectTask]);

  const clearTerminal = useCallback(() => {
    const taskId = activeTaskRef.current?.id;
    setTerminalLinesByTask((current) => {
      const next = { ...current };
      delete next[GLOBAL_LOG_KEY];
      if (taskId) delete next[taskId];
      return next;
    });
  }, []);

  return {
    runtime,
    sessionId,
    promptCapabilities,
    runtimeModelState,
    defaultRuntimeProfile,
    messages: activeTask?.messages ?? [],
    plan: activeTask?.plan ?? [],
    tools: activeTask?.tools ?? [],
    terminalLines,
    permission,
    busy,
    anyBusy,
    hasAnyPermission,
    runningTaskIds,
    runningCount: runningTaskIds.length,
    runningInBackground,
    pendingPermissionTaskIds,
    attentionTaskIds,
    installing,
    signingIn,
    subscriptionLoading,
    modelCatalogLoading,
    modelConfiguring,
    subscription,
    statusText,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    connect,
    disconnect,
    disconnectTask,
    disconnectAll,
    send,
    retry,
    cancel,
    installRuntime,
    signIn,
    verifySubscription,
    manageSubscription,
    refreshRuntimeModels,
    configureRuntimeProfile,
    answerPermission,
    refreshRuntime,
    clearTerminal,
    dismissError: () => setError(null),
  };
}
