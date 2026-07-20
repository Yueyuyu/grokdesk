import type {
  AcpSessionUpdate,
  PlanStep,
  ToolActivity,
} from "../types";

export function normalizeSessionUpdate(payload: unknown): AcpSessionUpdate | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const envelope = payload as Record<string, unknown>;
  const params =
    envelope.params && typeof envelope.params === "object"
      ? (envelope.params as Record<string, unknown>)
      : envelope;
  const update =
    params.update && typeof params.update === "object"
      ? (params.update as AcpSessionUpdate)
      : (params as AcpSessionUpdate);

  return update.sessionUpdate ? update : null;
}

export function planFromUpdate(update: AcpSessionUpdate): PlanStep[] | null {
  if (update.sessionUpdate !== "plan" || !Array.isArray(update.entries)) {
    return null;
  }

  return update.entries.map((entry, index) => {
    const status = String(entry.status ?? "pending").toLowerCase();
    return {
      id: `acp-plan-${index}`,
      title: entry.content || `Plan step ${index + 1}`,
      detail: entry.priority ? `${entry.priority} priority` : "Updated by Grok Build",
      status:
        status === "completed" || status === "complete"
          ? "complete"
          : status === "in_progress" || status === "active"
            ? "active"
            : "pending",
    } satisfies PlanStep;
  });
}

export function toolFromUpdate(update: AcpSessionUpdate): ToolActivity | null {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return null;
  }

  const rawStatus = String(update.status ?? "active").toLowerCase();
  const status: ToolActivity["status"] =
    rawStatus === "completed" || rawStatus === "complete"
      ? "complete"
      : rawStatus === "failed" || rawStatus === "error"
        ? "failed"
        : "active";

  return {
    id: update.toolCallId || `tool-${Date.now()}`,
    action: update.sessionUpdate === "tool_call_update" ? "Update" : "Run",
    target: update.title || "Grok Build tool",
    progress: status === "complete" ? 100 : status === "failed" ? 100 : 48,
    status,
  };
}
