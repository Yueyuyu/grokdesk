import { workspaceStorageKey } from "./tasks";
import type {
  AuditEvent,
  AuditEventKind,
  AuditEventStatus,
} from "../types";

export const AUDIT_STORE_KEY = "grokdesk.audit.v1";
export const AUDIT_STORE_VERSION = 1;
export const AUDIT_RETENTION_DAYS = 30;
export const MAX_AUDIT_EVENTS = 500;

export interface AuditStoreSnapshot {
  version: typeof AUDIT_STORE_VERSION;
  events: AuditEvent[];
}

export interface AuditEventInput {
  id: string;
  workspacePath: string;
  taskId?: string | null;
  kind: AuditEventKind;
  title: string;
  detail: string;
  status: AuditEventStatus;
  durationMs?: number | null;
  exitCode?: number | null;
}

export type RecordAuditEvent = (event: AuditEventInput) => void;

const auditKinds = new Set<AuditEventKind>([
  "permission",
  "tool",
  "command",
]);

const auditStatuses = new Set<AuditEventStatus>([
  "pending",
  "running",
  "allowed",
  "denied",
  "cancelled",
  "succeeded",
  "failed",
  "stopped",
  "interrupted",
]);

const createFallbackTitle = (kind: AuditEventKind) => {
  if (kind === "permission") return "Grok Build permission";
  if (kind === "command") return "Workspace command";
  return "Grok Build tool";
};

const safeIsoDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const safeFiniteNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * 审计记录只保留必要元数据。这里会在写入 localStorage 前清理常见凭据形态，
 * 避免终端命令或 Runtime 标题中的 Token 被长期保存。
 */
export function sanitizeAuditText(value: string, maximumLength = 300) {
  return value
    .replace(/https:\/\/[^/\s:@]+:[^@\s/]+@/gi, "https://[redacted]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(
      /(--(?:api[-_]?key|token|secret|password|authorization)(?:=|\s+))(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/\b(?:ghp|github_pat|sk)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

const parseAuditEvent = (value: unknown): AuditEvent | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.slice(0, 240) : "";
  const workspacePath =
    typeof candidate.workspacePath === "string"
      ? candidate.workspacePath.slice(0, 4_000)
      : "";
  const kind = auditKinds.has(candidate.kind as AuditEventKind)
    ? (candidate.kind as AuditEventKind)
    : null;
  const persistedStatus = auditStatuses.has(candidate.status as AuditEventStatus)
    ? (candidate.status as AuditEventStatus)
    : null;
  const createdAt = safeIsoDate(candidate.createdAt);
  const updatedAt = safeIsoDate(candidate.updatedAt);
  if (!id || !workspacePath || !kind || !persistedStatus || !createdAt || !updatedAt) {
    return null;
  }

  const status =
    persistedStatus === "pending" || persistedStatus === "running"
      ? "interrupted"
      : persistedStatus;

  return {
    id,
    workspacePath,
    taskId:
      typeof candidate.taskId === "string" && candidate.taskId
        ? candidate.taskId.slice(0, 200)
        : null,
    kind,
    title:
      sanitizeAuditText(String(candidate.title ?? ""), 240) ||
      createFallbackTitle(kind),
    detail: sanitizeAuditText(String(candidate.detail ?? ""), 300),
    status,
    createdAt,
    updatedAt,
    durationMs: safeFiniteNumber(candidate.durationMs),
    exitCode: safeFiniteNumber(candidate.exitCode),
  };
};

const keepRecentEvents = (events: AuditEvent[], now: Date) => {
  const minimumTime = now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
  return events
    .filter((event) => new Date(event.updatedAt).getTime() >= minimumTime)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )
    .slice(0, MAX_AUDIT_EVENTS);
};

export const emptyAuditStore = (): AuditStoreSnapshot => ({
  version: AUDIT_STORE_VERSION,
  events: [],
});

export function parseAuditStore(
  raw: string | null,
  now = new Date(),
): AuditStoreSnapshot {
  if (!raw) return emptyAuditStore();
  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    if (
      !candidate ||
      candidate.version !== AUDIT_STORE_VERSION ||
      !Array.isArray(candidate.events)
    ) {
      return emptyAuditStore();
    }
    const ids = new Set<string>();
    const events = candidate.events
      .map(parseAuditEvent)
      .filter((event): event is AuditEvent => {
        if (!event || ids.has(event.id)) return false;
        ids.add(event.id);
        return true;
      });
    return { version: AUDIT_STORE_VERSION, events: keepRecentEvents(events, now) };
  } catch {
    return emptyAuditStore();
  }
}

export const serializeAuditStore = (snapshot: AuditStoreSnapshot) =>
  JSON.stringify({
    version: AUDIT_STORE_VERSION,
    events: snapshot.events.slice(0, MAX_AUDIT_EVENTS),
  });

export function upsertAuditEvent(
  snapshot: AuditStoreSnapshot,
  input: AuditEventInput,
  now = new Date(),
): AuditStoreSnapshot {
  const id = input.id.trim().slice(0, 240);
  const workspacePath = input.workspacePath.trim().slice(0, 4_000);
  if (!id || !workspacePath) return snapshot;

  const previous = snapshot.events.find((event) => event.id === id);
  const timestamp = now.toISOString();
  const next: AuditEvent = {
    id,
    workspacePath,
    taskId: input.taskId?.slice(0, 200) || null,
    kind: input.kind,
    title:
      sanitizeAuditText(input.title, 240) || createFallbackTitle(input.kind),
    detail: sanitizeAuditText(input.detail, 300),
    status: input.status,
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
    durationMs:
      input.durationMs === null || input.durationMs === undefined
        ? null
        : Math.max(0, Math.min(Number(input.durationMs) || 0, 24 * 60 * 60 * 1_000)),
    exitCode:
      input.exitCode === null || input.exitCode === undefined
        ? null
        : Math.trunc(Number(input.exitCode) || 0),
  };
  const events = keepRecentEvents(
    [next, ...snapshot.events.filter((event) => event.id !== id)],
    now,
  );
  return { version: AUDIT_STORE_VERSION, events };
}

export function clearWorkspaceAudit(
  snapshot: AuditStoreSnapshot,
  workspacePath: string,
): AuditStoreSnapshot {
  const workspaceKey = workspaceStorageKey(workspacePath);
  return {
    version: AUDIT_STORE_VERSION,
    events: snapshot.events.filter(
      (event) => workspaceStorageKey(event.workspacePath) !== workspaceKey,
    ),
  };
}
