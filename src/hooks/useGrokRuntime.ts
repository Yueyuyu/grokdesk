import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialMessages,
  initialPlan,
  initialTools,
  terminalSeed,
} from "../data/demo";
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
import type {
  ChatEntry,
  GrokSubscription,
  PermissionOption,
  PermissionRequest,
  PlanStep,
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

export function useGrokRuntime(workspacePath: string) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>(initialMessages);
  const [plan, setPlan] = useState<PlanStep[]>(initialPlan);
  const [tools, setTools] = useState<ToolActivity[]>(initialTools);
  const [terminalLines, setTerminalLines] = useState<string[]>(terminalSeed);
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
  const accountAutoRefreshStarted = useRef(false);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
  }, []);

  const refreshRuntime = useCallback(async () => {
    try {
      const next = await probeRuntime();
      if (!mounted.current) return;
      setRuntime(next);
      setStatusText(runtimeStatusText(next));
      return next;
    } catch (cause) {
      if (!mounted.current) return;
      setError(String(cause));
      setStatusText("Grok Build · Detection failed");
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshRuntime();

    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const subscriptions = [
      listenDesktopEvent<unknown>("grok://session-update", (payload) => {
        const update = normalizeSessionUpdate(payload);
        if (!update) return;

        const nextPlan = planFromUpdate(update);
        if (nextPlan) setPlan(nextPlan);

        const nextTool = toolFromUpdate(update);
        if (nextTool) {
          setTools((current) => {
            const index = current.findIndex((item) => item.id === nextTool.id);
            if (index === -1) return [...current, nextTool].slice(-6);
            return current.map((item) => (item.id === nextTool.id ? nextTool : item));
          });
        }

        const messageChunk = update.content?.text;
        if (update.sessionUpdate === "agent_message_chunk" && messageChunk) {
          setMessages((current) => {
            const last = current.at(-1);
            if (last?.role === "agent" && last.streaming) {
              return current.map((item, index) =>
                index === current.length - 1
                  ? { ...item, content: item.content + messageChunk }
                  : item,
              );
            }
            return [
              ...current,
              {
                id: `agent-${Date.now()}`,
                role: "agent",
                name: "Grok Build",
                time: formatTime(),
                content: messageChunk,
                streaming: true,
              },
            ];
          });
        }
      }),
      listenDesktopEvent<ClientRequestPayload>("grok://client-request", (payload) => {
        const rawOptions = Array.isArray(payload.params?.options)
          ? payload.params.options
          : [];
        const options = rawOptions
          .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
          .map(
            (option, index): PermissionOption => ({
              optionId: String(option.optionId ?? option.option_id ?? `option-${index}`),
              name: String(option.name ?? option.label ?? `Option ${index + 1}`),
              kind: option.kind ? String(option.kind) : undefined,
            }),
          );

        setPermission({
          id: payload.id,
          title: String(payload.params?.title ?? "Grok Build needs permission"),
          description: String(
            payload.params?.description ??
              payload.params?.toolCallTitle ??
              "Review this action before Grok Build continues.",
          ),
          options:
            options.length > 0
              ? options
              : [
                  { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
                  { optionId: "reject_once", name: "Deny", kind: "reject_once" },
                ],
        });
      }),
      listenDesktopEvent<string>("grok://stderr", (line) => {
        setTerminalLines((current) => [...current, line].slice(-120));
      }),
      listenDesktopEvent<string>("grok://install-log", (line) => {
        setTerminalLines((current) => [...current, line].slice(-120));
      }),
      listenDesktopEvent<string>("grok://status", (status) => setStatusText(status)),
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
  }, [refreshRuntime]);

  const connect = useCallback(async (restart = false) => {
    if (sessionId && !restart) return sessionId;
    setError(null);
    setStatusText("Starting Grok Build ACP…");
    try {
      if (restart) {
        await stopAcpSession();
        setSessionId(null);
      }
      const nextSession = await startAcpSession(workspacePath || ".");
      setSessionId(nextSession);
      setRuntime((current) =>
        current ? { ...current, authenticationState: "verified" } : current,
      );
      setStatusText("Grok Build · ACP connected");
      return nextSession;
    } catch (cause) {
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
    }
  }, [sessionId, workspacePath]);

  const runBrowserDemo = useCallback(async (prompt: string) => {
    const response = [
      "I’ve reviewed the request and the current workspace. ",
      "The session is connected through the same ACP update stream the native app uses. ",
      `Next I’ll apply the smallest safe change for “${prompt.slice(0, 46)}${prompt.length > 46 ? "…" : ""}”.`,
    ];

    setMessages((current) => [
      ...current,
      {
        id: `agent-${Date.now()}`,
        role: "agent",
        name: "Grok Build",
        time: formatTime(),
        content: "",
        streaming: true,
      },
    ]);
    for (const chunk of response) {
      await delay(260);
      setMessages((current) =>
        current.map((entry, index) =>
          index === current.length - 1
            ? { ...entry, content: entry.content + chunk }
            : entry,
        ),
      );
    }
    setPlan((current) =>
      current.map((step, index) =>
        index === 2
          ? { ...step, status: "complete" }
          : index === 3
            ? { ...step, status: "active" }
            : step,
      ),
    );
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;
      setBusy(true);
      setError(null);
      setMessages((current) => [
        ...current.map((entry) => ({ ...entry, streaming: false })),
        {
          id: `user-${Date.now()}`,
          role: "user",
          name: "Alex",
          time: formatTime(),
          content: text,
        },
      ]);

      try {
        if (isDesktopRuntime()) {
          await connect();
          await sendAcpPrompt(text);
        } else {
          await runBrowserDemo(text);
        }
      } catch (cause) {
        setError(String(cause));
        setTerminalLines((current) => [...current, `[error] ${String(cause)}`]);
      } finally {
        setMessages((current) =>
          current.map((entry) => ({ ...entry, streaming: false })),
        );
        setBusy(false);
      }
    },
    [busy, connect, runBrowserDemo],
  );

  const cancel = useCallback(async () => {
    await cancelAcpTurn();
    setBusy(false);
    setStatusText("Grok Build · Turn cancelled");
  }, []);

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
      setStatusText("Grok Build · 账号状态已刷新");
      showNotice(
        next.availability === "unsupported"
          ? next.message || "登录已验证，但当前官方 Grok CLI 未开放套餐与额度查询。"
          : "账号、套餐与额度已刷新。",
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
    setError(null);
    setNotice(null);
    setStatusText("Opening official Grok OAuth…");

    try {
      const result = await launchOAuth();
      if (!result.succeeded) {
        throw new Error(result.message || "官方 Grok 登录没有完成，请重新尝试。");
      }

      const nextRuntime = await probeRuntime();
      if (
        nextRuntime.authenticationState === "missing" ||
        nextRuntime.authenticationState === "expired"
      ) {
        throw new Error("网页授权已结束，但官方 Grok CLI 尚未写入登录凭据。");
      }
      setRuntime(nextRuntime);
      setStatusText("Grok 登录成功，正在刷新账号与订阅…");
      showNotice("Grok 登录成功，正在刷新账号与订阅…");

      if (!isDesktopRuntime()) {
        setSessionId("browser-demo-session");
        const nextSubscription = await fetchGrokSubscription();
        setSubscription(nextSubscription);
        setStatusText("Grok Build · Preview OAuth complete");
        setTerminalLines((current) => [
          ...current,
          "[preview] OAuth completion was simulated. No account was accessed or changed.",
        ]);
        showNotice("预览登录成功，模拟套餐与额度已刷新。");
        return;
      }

      try {
        // A fresh ACP process must read the credentials written by this OAuth attempt.
        await connect(true);
        setSubscriptionLoading(true);
        const nextSubscription = await fetchGrokSubscription();
        setSubscription(nextSubscription);
        setStatusText("Grok Build · 已登录并验证");
        showNotice(
          nextSubscription.availability === "unsupported"
            ? nextSubscription.message ||
                "登录已验证，但当前官方 Grok CLI 未开放套餐与额度查询。"
            : "Grok 登录成功，套餐与额度已自动刷新。",
        );
      } catch (refreshCause) {
        setStatusText("Grok Build · OAuth configured");
        setError(`Grok 登录成功，但账号信息刷新失败：${String(refreshCause)}`);
        showNotice("Grok 登录成功；账号详情可稍后点击“刷新账号与订阅”重试。");
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
  }, [connect, showNotice, signingIn]);

  useEffect(() => {
    const authenticationReady =
      runtime?.available === true &&
      runtime.authenticationState !== "missing" &&
      runtime.authenticationState !== "expired";
    if (
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
  }, [runtime, signingIn, subscription, subscriptionLoading, verifySubscription]);

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
    await stopAcpSession();
    setSessionId(null);
    setStatusText("Grok Build · OAuth verified");
  }, []);

  return {
    runtime,
    sessionId,
    messages,
    plan,
    tools,
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
    cancel,
    installRuntime,
    signIn,
    verifySubscription,
    manageSubscription,
    answerPermission,
    refreshRuntime,
    clearTerminal: () => setTerminalLines([]),
  };
}
