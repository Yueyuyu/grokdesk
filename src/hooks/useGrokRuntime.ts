import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSessionUpdate, planFromUpdate, toolFromUpdate } from "../lib/acp";
import {
  answerClientRequest,
  cancelAcpTurn,
  fetchGrokSubscription,
  installGrokCli,
  isDesktopRuntime,
  launchOAuth,
  listenDesktopEvent,
  openGrokSubscription,
  probeRuntime,
  sendAcpPrompt,
  startAcpSession,
  stopAcpSession,
} from "../lib/desktop";
import { deriveTaskTitle, NEW_TASK_TITLE } from "../lib/tasks";
import { isWorkspaceSelected } from "../lib/workspace";
import type { UpdateTask } from "./useTaskStore";
import type {
  ChatEntry,
  GrokSubscription,
  GrokTask,
  PermissionOption,
  PermissionRequest,
  PromptAttachment,
  PromptCapabilities,
  RuntimeStatus,
  ToolActivity,
} from "../types";

interface ClientRequestPayload {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

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
) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [promptCapabilities, setPromptCapabilities] =
    useState<PromptCapabilities | null>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<GrokSubscription | null>(null);
  const [statusText, setStatusText] = useState("Inspecting Grok Build…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const activeTaskRef = useRef(activeTask);
  const sessionIdRef = useRef<string | null>(null);
  const sessionTaskIdRef = useRef<string | null>(null);
  const ignoreSessionUpdatesRef = useRef(false);
  const connectionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const turnCancelledRef = useRef(false);
  const accountAutoRefreshStarted = useRef(false);

  activeTaskRef.current = activeTask;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
  }, []);

  const setConnectedSession = useCallback(
    (nextSessionId: string | null, taskId: string | null) => {
      sessionIdRef.current = nextSessionId;
      sessionTaskIdRef.current = taskId;
      setSessionId(nextSessionId);
    },
    [],
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
      updater: (task: GrokTask) => GrokTask,
      options: { touch?: boolean } = {},
    ) => {
      const taskId = sessionTaskIdRef.current;
      if (!taskId) return;

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
        if (ignoreSessionUpdatesRef.current) return;
        const update = normalizeSessionUpdate(payload);
        if (!update) return;

        const nextPlan = planFromUpdate(update);
        if (nextPlan) {
          updateConnectedTask((task) => ({ ...task, plan: nextPlan }));
        }

        const nextTool = toolFromUpdate(update);
        if (nextTool) {
          updateConnectedTask((task) => {
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
          updateConnectedTask((task) => {
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
          const rawOptions = Array.isArray(payload.params?.options)
            ? payload.params.options
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

          setPermission({
            id: payload.id,
            title: String(
              payload.params?.title ?? "Grok Build needs permission",
            ),
            description: String(
              payload.params?.description ??
                payload.params?.toolCallTitle ??
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
          });
        },
      ),
      listenDesktopEvent<string>("grok://stderr", (line) => {
        setTerminalLines((current) => [...current, line].slice(-120));
      }),
      listenDesktopEvent<string>("grok://install-log", (line) => {
        setTerminalLines((current) => [...current, line].slice(-120));
      }),
      listenDesktopEvent<string>("grok://status", (status) =>
        setStatusText(status),
      ),
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
  }, [refreshRuntime, updateConnectedTask]);

  const connectTask = useCallback(
    (task: GrokTask, restart = false): Promise<string> => {
      const run = async () => {
        const currentSessionId = sessionIdRef.current;
        const currentTaskId = sessionTaskIdRef.current;
        if (currentSessionId && currentTaskId === task.id && !restart) {
          return currentSessionId;
        }

        setError(null);
        setStatusText(
          task.acpSessionId ? "Restoring Grok Build session…" : "Starting Grok Build ACP…",
        );

        const resumeSessionId =
          task.acpSessionId ??
          (restart && currentTaskId === task.id ? currentSessionId : null);
        const taskWorkspace = isWorkspaceSelected(task.workspacePath)
          ? task.workspacePath
          : workspacePath;
        if (!isWorkspaceSelected(taskWorkspace)) {
          throw new Error("Choose a project folder before starting Grok Build.");
        }

        try {
          if (currentSessionId) {
            sessionTaskIdRef.current = null;
            await stopAcpSession();
            setConnectedSession(null, null);
            setPromptCapabilities(null);
          }

          sessionTaskIdRef.current = task.id;
          ignoreSessionUpdatesRef.current = Boolean(resumeSessionId);
          const session = await startAcpSession(
            taskWorkspace,
            resumeSessionId,
          );
          const nextSessionId = session.sessionId;
          setPromptCapabilities(session.promptCapabilities);
          setConnectedSession(nextSessionId, task.id);
          updateTask(task.id, (current) =>
            current.acpSessionId === nextSessionId
              ? current
              : { ...current, acpSessionId: nextSessionId },
          );
          setRuntime((current) =>
            current ? { ...current, authenticationState: "verified" } : current,
          );
          setStatusText(
            resumeSessionId
              ? "Grok Build · Session restored"
              : "Grok Build · ACP connected",
          );
          return nextSessionId;
        } catch (cause) {
          setConnectedSession(null, null);
          setPromptCapabilities(null);
          if (isAuthenticationError(cause)) {
            setRuntime((current) =>
              current ? { ...current, authenticationState: "expired" } : current,
            );
            setStatusText("Grok Build · Sign in required");
          } else {
            setStatusText("Grok Build · ACP connection failed");
          }
          setError(String(cause));
          throw cause;
        } finally {
          ignoreSessionUpdatesRef.current = false;
        }
      };

      const operation = connectionQueueRef.current.then(run, run);
      connectionQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [setConnectedSession, updateTask, workspacePath],
  );

  const connect = useCallback(
    async (restart = false) => {
      const task = activeTaskRef.current;
      if (!task) throw new Error("Create a task before starting Grok Build ACP.");
      return connectTask(task, restart);
    },
    [connectTask],
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
    setPermission(null);
  }, [activeTask?.id]);

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
            content: "",
            streaming: true,
          },
        ],
      }));

      for (const chunk of response) {
        await delay(220);
        if (turnCancelledRef.current) break;
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
      if ((!text && attachments.length === 0) || busy || !task) return;

      const attachmentSummaries = attachments.map(({ data: _data, ...summary }) =>
        summary,
      );
      const titleSource = text || `Review ${attachmentSummaries[0]?.name ?? "attachments"}`;

      const taskId = task.id;
      turnCancelledRef.current = false;
      setBusy(true);
      setError(null);
      updateTask(taskId, (current) => {
        const firstMessage = current.messages.length === 0;
        return {
          ...current,
          title:
            firstMessage && current.title === NEW_TASK_TITLE
              ? deriveTaskTitle(titleSource)
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
          await sendAcpPrompt(text, attachments);
        } else {
          await runBrowserDemo(taskId, text, attachments.length);
        }
        succeeded = true;
      } catch (cause) {
        setError(String(cause));
        setTerminalLines((current) =>
          [...current, `[error] ${String(cause)}`].slice(-120),
        );
        if (isDesktopRuntime()) {
          await stopAcpSession().catch(() => undefined);
          setConnectedSession(null, null);
          setPromptCapabilities(null);
          setStatusText("Grok Build · Ready to retry");
        }
      } finally {
        const cancelled = turnCancelledRef.current;
        updateTask(taskId, (current) => ({
          ...current,
          updatedAt: new Date().toISOString(),
          status: cancelled ? "idle" : succeeded ? "complete" : "error",
          messages: current.messages.map((entry) => ({
            ...entry,
            streaming: false,
          })),
        }));
        setBusy(false);
      }
    },
    [busy, connectTask, runBrowserDemo, setConnectedSession, updateTask],
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
    const taskId = sessionTaskIdRef.current;
    turnCancelledRef.current = true;
    try {
      await cancelAcpTurn();
      setStatusText("Grok Build · Turn cancelled");
    } catch (cause) {
      setError(String(cause));
    } finally {
      if (taskId) {
        updateTask(taskId, (task) => ({
          ...task,
          status: "idle",
          updatedAt: new Date().toISOString(),
          messages: task.messages.map((entry) => ({
            ...entry,
            streaming: false,
          })),
        }));
      }
    }
  }, [updateTask]);

  const installRuntime = useCallback(async () => {
    if (installing) return;
    setInstalling(true);
    setError(null);
    setStatusText("Installing official Grok Runtime…");
    if (!isDesktopRuntime()) {
      setTerminalLines((current) => [
        ...current,
        "[preview] Simulating the official Grok Runtime installer. No software is changed.",
      ]);
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
      await connect();
      const next = await fetchGrokSubscription();
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
        await connect(true);
        setSubscriptionLoading(true);
        const nextSubscription = await fetchGrokSubscription();
        setSubscription(nextSubscription);
        setStatusText("Grok Build · Signed in and verified");
        showNotice(
          nextSubscription.availability === "unsupported"
            ? nextSubscription.message ||
                "Sign-in is verified, but the official Grok CLI does not expose subscription or quota data."
            : "Grok sign-in succeeded and account information was refreshed.",
        );
        if (!isDesktopRuntime()) {
          setTerminalLines((current) => [
            ...current,
            "[preview] OAuth completion was simulated. No account was accessed or changed.",
          ]);
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
  }, [connect, showNotice, signingIn, workspacePath]);

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
      await answerClientRequest(permission.id, result);
      setPermission(null);
    },
    [permission],
  );

  const disconnect = useCallback(async () => {
    const stop = async () => {
      await stopAcpSession();
      setConnectedSession(null, null);
      setPromptCapabilities(null);
      setStatusText("Grok Build · OAuth verified");
    };
    const operation = connectionQueueRef.current.then(stop, stop);
    connectionQueueRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    await operation;
  }, [setConnectedSession]);

  return {
    runtime,
    sessionId,
    promptCapabilities,
    messages: activeTask?.messages ?? [],
    plan: activeTask?.plan ?? [],
    tools: activeTask?.tools ?? [],
    terminalLines,
    permission,
    busy,
    installing,
    signingIn,
    subscriptionLoading,
    subscription,
    statusText,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    connect,
    disconnect,
    send,
    retry,
    cancel,
    installRuntime,
    signIn,
    verifySubscription,
    manageSubscription,
    answerPermission,
    refreshRuntime,
    clearTerminal: () => setTerminalLines([]),
    dismissError: () => setError(null),
  };
}
