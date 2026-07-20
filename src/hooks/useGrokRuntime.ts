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
  isDesktopRuntime,
  launchOAuth,
  listenDesktopEvent,
  probeRuntime,
  sendAcpPrompt,
  startAcpSession,
  stopAcpSession,
} from "../lib/desktop";
import type {
  ChatEntry,
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

export function useGrokRuntime(workspacePath: string) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    isDesktopRuntime() ? null : "browser-demo-session",
  );
  const [messages, setMessages] = useState<ChatEntry[]>(initialMessages);
  const [plan, setPlan] = useState<PlanStep[]>(initialPlan);
  const [tools, setTools] = useState<ToolActivity[]>(initialTools);
  const [terminalLines, setTerminalLines] = useState<string[]>(terminalSeed);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Inspecting Grok Build…");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshRuntime = useCallback(async () => {
    try {
      const next = await probeRuntime();
      if (!mounted.current) return;
      setRuntime(next);
      setStatusText(
        next.available
          ? next.authenticationState === "verified"
            ? "Grok Build · ACP ready"
            : next.authenticationState === "configured"
              ? "Grok Build · OAuth configured"
              : "Grok Build · Sign in required"
          : "Grok Build · Not installed",
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(String(cause));
      setStatusText("Grok Build · Detection failed");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshRuntime();

    const unlisteners: Array<() => void> = [];
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
      listenDesktopEvent<string>("grok://status", (status) => setStatusText(status)),
      listenDesktopEvent<boolean>("grok://auth-complete", () => void refreshRuntime()),
    ];

    void Promise.all(subscriptions).then((items) => unlisteners.push(...items));

    return () => {
      mounted.current = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [refreshRuntime]);

  const connect = useCallback(async () => {
    if (sessionId) return sessionId;
    setError(null);
    setStatusText("Starting Grok Build ACP…");
    try {
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

  const signIn = useCallback(async () => {
    setStatusText("Opening official Grok OAuth…");
    await launchOAuth();
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
    statusText,
    error,
    connect,
    disconnect,
    send,
    cancel,
    signIn,
    answerPermission,
    refreshRuntime,
    clearTerminal: () => setTerminalLines([]),
  };
}
