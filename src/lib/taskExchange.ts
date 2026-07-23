import type {
  ChatAttachmentSummary,
  ChatEntry,
  GrokTask,
  PlanStep,
  ToolActivity,
} from "../types";
import { parseRuntimeProfile } from "./runtimeProfile";

export const TASK_EXPORT_SCHEMA = "grokdesk.task-export";
export const TASK_EXPORT_VERSION = 1;
export const MAX_TASK_EXCHANGE_BYTES = 8 * 1024 * 1024;

const MAX_MESSAGES = 500;
const MAX_PLAN_STEPS = 200;
const MAX_TOOL_ACTIVITIES = 1_000;
const MAX_ATTACHMENTS = 8;
const MAX_TEXT_LENGTH = 100_000;

interface TaskExportEnvelope {
  schema: typeof TASK_EXPORT_SCHEMA;
  version: typeof TASK_EXPORT_VERSION;
  exportedAt: string;
  sourceWorkspacePath: string;
  task: Pick<
    GrokTask,
    "title" | "runtimeProfile" | "messages" | "plan" | "tools"
  >;
}

const planStatuses = new Set<PlanStep["status"]>([
  "complete",
  "active",
  "pending",
]);
const toolStatuses = new Set<ToolActivity["status"]>([
  "complete",
  "active",
  "pending",
  "failed",
]);
const attachmentKinds = new Set<ChatAttachmentSummary["kind"]>([
  "image",
  "text",
  "binary",
]);

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const isIsoDate = (value: unknown) => {
  if (typeof value !== "string") return false;
  return !Number.isNaN(new Date(value).getTime());
};

const isStringWithin = (
  value: unknown,
  maximumLength: number,
  allowEmpty = true,
) =>
  typeof value === "string" &&
  value.length <= maximumLength &&
  (allowEmpty || value.length > 0);

const parseAttachment = (value: unknown): ChatAttachmentSummary | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStringWithin(candidate.name, 255, false) ||
    !isStringWithin(candidate.mimeType, 160, false) ||
    !attachmentKinds.has(candidate.kind as ChatAttachmentSummary["kind"]) ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size) ||
    candidate.size < 0 ||
    candidate.size > 24 * 1024 * 1024
  ) {
    return null;
  }
  return {
    name: candidate.name as string,
    mimeType: candidate.mimeType as string,
    size: candidate.size,
    kind: candidate.kind as ChatAttachmentSummary["kind"],
  };
};

const parseMessage = (value: unknown): ChatEntry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStringWithin(candidate.id, 200, false) ||
    (candidate.role !== "user" && candidate.role !== "agent") ||
    !isStringWithin(candidate.name, 120) ||
    !isStringWithin(candidate.time, 80) ||
    !isStringWithin(candidate.content, MAX_TEXT_LENGTH) ||
    (candidate.streaming !== undefined && typeof candidate.streaming !== "boolean")
  ) {
    return null;
  }

  let attachments: ChatAttachmentSummary[] | undefined;
  if (candidate.attachments !== undefined) {
    if (!Array.isArray(candidate.attachments) || candidate.attachments.length > MAX_ATTACHMENTS) {
      return null;
    }
    const parsed = candidate.attachments.map(parseAttachment);
    if (parsed.some((attachment) => attachment === null)) return null;
    attachments = parsed as ChatAttachmentSummary[];
  }
  return {
    id: candidate.id as string,
    role: candidate.role,
    name: candidate.name as string,
    time: candidate.time as string,
    content: candidate.content as string,
    attachments,
    streaming: false,
  };
};

const parsePlanStep = (value: unknown): PlanStep | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStringWithin(candidate.id, 200, false) ||
    !isStringWithin(candidate.title, 500) ||
    !isStringWithin(candidate.detail, 2_000) ||
    !planStatuses.has(candidate.status as PlanStep["status"])
  ) {
    return null;
  }
  return {
    id: candidate.id as string,
    title: candidate.title as string,
    detail: candidate.detail as string,
    status: candidate.status as PlanStep["status"],
  };
};

const parseTool = (value: unknown): ToolActivity | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStringWithin(candidate.id, 200, false) ||
    !isStringWithin(candidate.action, 120) ||
    !isStringWithin(candidate.target, 2_000) ||
    typeof candidate.progress !== "number" ||
    !Number.isFinite(candidate.progress) ||
    candidate.progress < 0 ||
    candidate.progress > 100 ||
    !toolStatuses.has(candidate.status as ToolActivity["status"])
  ) {
    return null;
  }
  return {
    id: candidate.id as string,
    action: candidate.action as string,
    target: candidate.target as string,
    progress: candidate.progress,
    status: candidate.status as ToolActivity["status"],
  };
};

function requireArray<T>(
  value: unknown,
  field: string,
  maximumLength: number,
  parser: (entry: unknown) => T | null,
) {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new Error(`Invalid ${field}: expected at most ${maximumLength} entries.`);
  }
  const parsed = value.map(parser);
  if (parsed.some((entry) => entry === null)) {
    throw new Error(`Invalid ${field}: one or more entries are malformed.`);
  }
  return parsed as T[];
}

function requireUniqueIds(
  items: Array<{ id: string }>,
  field: string,
) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error(`Invalid ${field}: duplicate entry ID.`);
    }
    ids.add(item.id);
  }
}

export function serializeTaskExport(
  task: GrokTask,
  options: { now?: Date } = {},
) {
  if (
    !isStringWithin(task.workspacePath, 4_000, false) ||
    task.workspacePath.includes("\0") ||
    !isStringWithin(task.title, 160, false) ||
    task.title.trim() !== task.title
  ) {
    throw new Error("This task contains invalid title or workspace metadata.");
  }
  const envelope: TaskExportEnvelope = {
    schema: TASK_EXPORT_SCHEMA,
    version: TASK_EXPORT_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    sourceWorkspacePath: task.workspacePath,
    task: {
      title: task.title,
      runtimeProfile: parseRuntimeProfile(task.runtimeProfile),
      messages: task.messages.map((message) => ({
        id: message.id,
        role: message.role,
        name: message.name,
        time: message.time,
        content: message.content,
        attachments: message.attachments?.map((attachment) => ({
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
        })),
        streaming: false,
      })),
      plan: task.plan.map(({ id, title, detail, status }) => ({
        id,
        title,
        detail,
        status,
      })),
      tools: task.tools.map(({ id, action, target, progress, status }) => ({
        id,
        action,
        target,
        progress,
        status,
      })),
    },
  };
  const validatedMessages = requireArray(
    envelope.task.messages,
    "messages",
    MAX_MESSAGES,
    parseMessage,
  );
  const validatedPlan = requireArray(
    envelope.task.plan,
    "plan",
    MAX_PLAN_STEPS,
    parsePlanStep,
  );
  const validatedTools = requireArray(
    envelope.task.tools,
    "tools",
    MAX_TOOL_ACTIVITIES,
    parseTool,
  );
  requireUniqueIds(validatedMessages, "messages");
  requireUniqueIds(validatedPlan, "plan");
  requireUniqueIds(validatedTools, "tools");
  const serialized = JSON.stringify(envelope, null, 2);
  if (byteLength(serialized) > MAX_TASK_EXCHANGE_BYTES) {
    throw new Error("This task export exceeds the 8 MiB safety limit.");
  }
  return serialized;
}

export function parseTaskImport(
  raw: string,
  workspacePath: string,
  options: { id?: string; now?: Date } = {},
): GrokTask {
  if (!raw.trim()) throw new Error("The selected task file is empty.");
  if (byteLength(raw) > MAX_TASK_EXCHANGE_BYTES) {
    throw new Error("The selected task file exceeds the 8 MiB safety limit.");
  }
  if (
    !isStringWithin(workspacePath, 4_000, false) ||
    workspacePath.includes("\0") ||
    workspacePath.trim() !== workspacePath
  ) {
    throw new Error("Choose a valid workspace before importing a task.");
  }

  let candidate: Record<string, unknown>;
  try {
    candidate = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (
    !candidate ||
    candidate.schema !== TASK_EXPORT_SCHEMA ||
    candidate.version !== TASK_EXPORT_VERSION ||
    !isIsoDate(candidate.exportedAt) ||
    !candidate.task ||
    typeof candidate.task !== "object"
  ) {
    throw new Error("This is not a supported GrokDesk task export.");
  }
  if (
    !isStringWithin(candidate.sourceWorkspacePath, 4_000, false) ||
    (candidate.sourceWorkspacePath as string).includes("\0")
  ) {
    throw new Error("The exported workspace path is invalid.");
  }

  const exportedTask = candidate.task as Record<string, unknown>;
  if (
    !isStringWithin(exportedTask.title, 160, false) ||
    (exportedTask.title as string).trim() !== exportedTask.title
  ) {
    throw new Error("The exported task title is invalid or too long.");
  }
  const messages = requireArray(
    exportedTask.messages,
    "messages",
    MAX_MESSAGES,
    parseMessage,
  );
  const plan = requireArray(
    exportedTask.plan,
    "plan",
    MAX_PLAN_STEPS,
    parsePlanStep,
  );
  const tools = requireArray(
    exportedTask.tools,
    "tools",
    MAX_TOOL_ACTIVITIES,
    parseTool,
  );
  requireUniqueIds(messages, "messages");
  requireUniqueIds(plan, "plan");
  requireUniqueIds(tools, "tools");
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    id: options.id ?? createId(),
    workspacePath,
    title: exportedTask.title as string,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "idle",
    archivedAt: null,
    origin: "import",
    sourceTaskId: null,
    acpSessionId: null,
    runtimeProfile: parseRuntimeProfile(exportedTask.runtimeProfile),
    messages,
    plan,
    tools,
  };
}
