import type {
  ChatAttachmentSummary,
  ChatEntry,
  GrokTask,
  PlanStep,
  TaskOrigin,
  TaskStatus,
  ToolActivity,
} from "../types";
import { parseRuntimeProfile } from "./runtimeProfile";

export const TASK_STORE_KEY = "grokdesk.tasks.v2";
export const LEGACY_TASK_STORE_KEY = "grokdesk.tasks.v1";
export const TASK_STORE_VERSION = 2;
export const NEW_TASK_TITLE = "New task";

export const MAX_TASKS = 200;
const MAX_MESSAGES_PER_TASK = 500;
const MAX_PLAN_STEPS = 200;
const MAX_TOOL_ACTIVITIES = 1_000;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_TEXT_LENGTH = 100_000;

export interface TaskStoreSnapshot {
  version: typeof TASK_STORE_VERSION;
  tasks: GrokTask[];
  activeTaskIds: Record<string, string>;
}

export interface TaskGroup {
  label: "Today" | "Yesterday" | "This week" | "Earlier";
  tasks: GrokTask[];
}

const taskStatuses = new Set<TaskStatus>([
  "idle",
  "running",
  "complete",
  "error",
]);

const taskOrigins = new Set<TaskOrigin>(["created", "branch", "import"]);

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

const safeString = (
  value: unknown,
  fallback = "",
  maximumLength = MAX_TEXT_LENGTH,
) =>
  typeof value === "string" ? value.slice(0, maximumLength) : fallback;

const safeIsoDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseAttachmentSummary = (value: unknown): ChatAttachmentSummary | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const name = safeString(candidate.name, "", 255).trim();
  const mimeType = safeString(
    candidate.mimeType,
    "application/octet-stream",
    160,
  );
  const size = Number(candidate.size);
  const kind = attachmentKinds.has(candidate.kind as ChatAttachmentSummary["kind"])
    ? (candidate.kind as ChatAttachmentSummary["kind"])
    : null;
  if (!name || !kind || !Number.isFinite(size) || size < 0) return null;

  return {
    name,
    mimeType,
    size: Math.min(size, 24 * 1024 * 1024),
    kind,
  };
};

const parseMessage = (value: unknown): ChatEntry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const role = candidate.role === "user" || candidate.role === "agent"
    ? candidate.role
    : null;
  const id = safeString(candidate.id, "", 200);
  if (!role || !id) return null;

  return {
    id,
    role,
    name: safeString(
      candidate.name,
      role === "user" ? "You" : "Grok Build",
      120,
    ),
    time: safeString(candidate.time, "", 80),
    createdAt: safeIsoDate(candidate.createdAt) ?? undefined,
    content: safeString(candidate.content),
    attachments: Array.isArray(candidate.attachments)
      ? candidate.attachments
          .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
          .map(parseAttachmentSummary)
          .filter(
            (attachment): attachment is ChatAttachmentSummary =>
              attachment !== null,
          )
      : undefined,
    streaming: candidate.streaming === true,
  };
};

const parsePlanStep = (value: unknown): PlanStep | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id, "", 200);
  if (!id) return null;
  const status = planStatuses.has(candidate.status as PlanStep["status"])
    ? (candidate.status as PlanStep["status"])
    : "pending";

  return {
    id,
    title: safeString(candidate.title, "Plan step", 500),
    detail: safeString(candidate.detail, "", 2_000),
    status,
  };
};

const parseTool = (value: unknown): ToolActivity | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id, "", 200);
  if (!id) return null;
  const status = toolStatuses.has(candidate.status as ToolActivity["status"])
    ? (candidate.status as ToolActivity["status"])
    : "pending";
  const progress = Number(candidate.progress);

  return {
    id,
    action: safeString(candidate.action, "Run", 120),
    target: safeString(candidate.target, "Grok Build tool", 2_000),
    progress: Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : 0,
    status,
  };
};

const parseTask = (value: unknown): GrokTask | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id, "", 200);
  const workspacePath = safeString(candidate.workspacePath, "", 4_000);
  const createdAt = safeIsoDate(candidate.createdAt);
  const updatedAt = safeIsoDate(candidate.updatedAt);
  if (!id || !workspacePath || !createdAt || !updatedAt) return null;

  const parsedStatus = taskStatuses.has(candidate.status as TaskStatus)
    ? (candidate.status as TaskStatus)
    : "idle";
  const origin = taskOrigins.has(candidate.origin as TaskOrigin)
    ? (candidate.origin as TaskOrigin)
    : "created";

  return {
    id,
    workspacePath,
    title: safeString(candidate.title, NEW_TASK_TITLE, 160).trim() || NEW_TASK_TITLE,
    createdAt,
    updatedAt,
    // A process cannot still be running after a full application restart.
    status: parsedStatus === "running" ? "idle" : parsedStatus,
    archivedAt: safeIsoDate(candidate.archivedAt),
    origin,
    sourceTaskId:
      origin === "branch" &&
      typeof candidate.sourceTaskId === "string" &&
      candidate.sourceTaskId
        ? candidate.sourceTaskId.slice(0, 200)
        : null,
    acpSessionId:
      typeof candidate.acpSessionId === "string" && candidate.acpSessionId
        ? candidate.acpSessionId.slice(0, 200)
        : null,
    runtimeProfile: parseRuntimeProfile(candidate.runtimeProfile),
    messages: Array.isArray(candidate.messages)
      ? candidate.messages
          .slice(-MAX_MESSAGES_PER_TASK)
          .map(parseMessage)
          .filter((entry): entry is ChatEntry => entry !== null)
          .map((entry) => ({ ...entry, streaming: false }))
      : [],
    plan: Array.isArray(candidate.plan)
      ? candidate.plan
          .slice(0, MAX_PLAN_STEPS)
          .map(parsePlanStep)
          .filter((step): step is PlanStep => step !== null)
      : [],
    tools: Array.isArray(candidate.tools)
      ? candidate.tools
          .slice(0, MAX_TOOL_ACTIVITIES)
          .map(parseTool)
          .filter((tool): tool is ToolActivity => tool !== null)
      : [],
  };
};

export const emptyTaskStore = (): TaskStoreSnapshot => ({
  version: TASK_STORE_VERSION,
  tasks: [],
  activeTaskIds: {},
});

export function parseTaskStore(raw: string | null): TaskStoreSnapshot {
  if (!raw) return emptyTaskStore();

  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    if (
      !candidate ||
      (candidate.version !== 1 && candidate.version !== TASK_STORE_VERSION) ||
      !Array.isArray(candidate.tasks)
    ) {
      return emptyTaskStore();
    }

    const ids = new Set<string>();
    const tasks = candidate.tasks
      .map(parseTask)
      .filter((task): task is GrokTask => {
        if (!task || ids.has(task.id)) return false;
        ids.add(task.id);
        return true;
      })
      .slice(0, MAX_TASKS);
    const activeIds = new Set(
      tasks.filter((task) => !task.archivedAt).map((task) => task.id),
    );

    const activeTaskIds = Object.fromEntries(
      Object.entries(
        candidate.activeTaskIds && typeof candidate.activeTaskIds === "object"
          ? (candidate.activeTaskIds as Record<string, unknown>)
          : {},
      ).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && activeIds.has(entry[1]),
      ),
    );

    return { version: TASK_STORE_VERSION, tasks, activeTaskIds };
  } catch {
    return emptyTaskStore();
  }
}

export const serializeTaskStore = (snapshot: TaskStoreSnapshot) =>
  JSON.stringify(snapshot);

export function workspaceStorageKey(workspacePath: string) {
  const normalized = (workspacePath.trim() || ".").replaceAll("/", "\\");
  const withoutTrailingSlash =
    normalized.length > 3 ? normalized.replace(/\\+$/, "") : normalized;
  return withoutTrailingSlash.toLocaleLowerCase();
}

export function createTask(
  workspacePath: string,
  options: {
    id?: string;
    now?: Date;
    runtimeProfile?: GrokTask["runtimeProfile"];
  } = {},
): GrokTask {
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    id: options.id ?? createId(),
    workspacePath: workspacePath.trim() || ".",
    title: NEW_TASK_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "idle",
    archivedAt: null,
    origin: "created",
    sourceTaskId: null,
    acpSessionId: null,
    runtimeProfile: parseRuntimeProfile(options.runtimeProfile),
    messages: [],
    plan: [],
    tools: [],
  };
}

export function filterTasks(tasks: GrokTask[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return tasks;

  return tasks.filter((task) => {
    if (task.title.toLocaleLowerCase().includes(normalized)) return true;
    return task.messages.some(
      (message) =>
        message.content.toLocaleLowerCase().includes(normalized) ||
        message.attachments?.some((attachment) =>
          attachment.name.toLocaleLowerCase().includes(normalized),
        ),
    );
  });
}

export function renameTask(
  snapshot: TaskStoreSnapshot,
  taskId: string,
  title: string,
) {
  const normalized = title.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!normalized) return snapshot;

  let changed = false;
  const tasks = snapshot.tasks.map((task) => {
    if (task.id !== taskId || task.title === normalized) return task;
    changed = true;
    return { ...task, title: normalized, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...snapshot, tasks } : snapshot;
}

export function deleteTask(
  snapshot: TaskStoreSnapshot,
  taskId: string,
  workspacePath: string,
  options: { replacementId?: string; now?: Date } = {},
) {
  const workspaceKey = workspaceStorageKey(workspacePath);
  const target = snapshot.tasks.find(
    (task) =>
      task.id === taskId &&
      workspaceStorageKey(task.workspacePath) === workspaceKey,
  );
  if (!target) return snapshot;

  let tasks = snapshot.tasks.filter((task) => task.id !== taskId);
  let workspaceTasks = tasks
    .filter(
      (task) =>
        workspaceStorageKey(task.workspacePath) === workspaceKey &&
        !task.archivedAt,
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );

  if (workspaceTasks.length === 0) {
    const replacement = createTask(workspacePath, {
      id: options.replacementId,
      now: options.now,
    });
    tasks = [replacement, ...tasks].slice(0, MAX_TASKS);
    workspaceTasks = [replacement];
  }

  const activeTaskIds = { ...snapshot.activeTaskIds };
  if (
    activeTaskIds[workspaceKey] === taskId ||
    !workspaceTasks.some((task) => task.id === activeTaskIds[workspaceKey])
  ) {
    activeTaskIds[workspaceKey] = workspaceTasks[0].id;
  }

  return { ...snapshot, tasks, activeTaskIds };
}

export function ensureWorkspaceTask(
  snapshot: TaskStoreSnapshot,
  workspacePath: string,
  options: {
    id?: string;
    now?: Date;
    runtimeProfile?: GrokTask["runtimeProfile"];
  } = {},
) {
  const key = workspaceStorageKey(workspacePath);
  const workspaceTasks = snapshot.tasks
    .filter(
      (task) =>
        workspaceStorageKey(task.workspacePath) === key && !task.archivedAt,
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  const requestedActiveId = snapshot.activeTaskIds[key];
  const activeTask = workspaceTasks.find((task) => task.id === requestedActiveId);

  if (activeTask) return snapshot;
  if (workspaceTasks[0]) {
    return {
      ...snapshot,
      activeTaskIds: { ...snapshot.activeTaskIds, [key]: workspaceTasks[0].id },
    };
  }

  const task = createTask(workspacePath, options);
  return {
    ...snapshot,
    tasks: [task, ...snapshot.tasks].slice(0, MAX_TASKS),
    activeTaskIds: { ...snapshot.activeTaskIds, [key]: task.id },
  };
}

export function createTaskBranch(
  source: GrokTask,
  options: { id?: string; now?: Date } = {},
): GrokTask {
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    ...source,
    id: options.id ?? createId(),
    title: `${source.title} (branch)`.slice(0, 160),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "idle",
    archivedAt: null,
    origin: "branch",
    sourceTaskId: source.id,
    // Grok Runtime does not expose a server-side session fork operation.
    acpSessionId: null,
    messages: source.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => ({ ...attachment })),
      streaming: false,
    })),
    plan: source.plan.map((step) => ({ ...step })),
    tools: source.tools.map((tool) => ({ ...tool })),
  };
}

export function archiveTask(
  snapshot: TaskStoreSnapshot,
  taskId: string,
  workspacePath: string,
  options: { replacementId?: string; now?: Date } = {},
) {
  const workspaceKey = workspaceStorageKey(workspacePath);
  const timestamp = (options.now ?? new Date()).toISOString();
  let changed = false;
  let tasks = snapshot.tasks.map((task) => {
    if (
      task.id !== taskId ||
      task.archivedAt ||
      workspaceStorageKey(task.workspacePath) !== workspaceKey
    ) {
      return task;
    }
    changed = true;
    return {
      ...task,
      archivedAt: timestamp,
      updatedAt: timestamp,
      status: task.status === "running" ? ("idle" as const) : task.status,
    };
  });
  if (!changed) return snapshot;

  let activeTasks = tasks
    .filter(
      (task) =>
        workspaceStorageKey(task.workspacePath) === workspaceKey &&
        !task.archivedAt,
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  if (activeTasks.length === 0) {
    const replacement = createTask(workspacePath, {
      id: options.replacementId,
      now: options.now,
    });
    tasks = [replacement, ...tasks].slice(0, MAX_TASKS);
    activeTasks = [replacement];
  }

  const activeTaskIds = { ...snapshot.activeTaskIds };
  if (
    activeTaskIds[workspaceKey] === taskId ||
    !activeTasks.some((task) => task.id === activeTaskIds[workspaceKey])
  ) {
    activeTaskIds[workspaceKey] = activeTasks[0].id;
  }
  return { ...snapshot, tasks, activeTaskIds };
}

export function restoreTask(
  snapshot: TaskStoreSnapshot,
  taskId: string,
  workspacePath: string,
  options: { now?: Date } = {},
) {
  const workspaceKey = workspaceStorageKey(workspacePath);
  const timestamp = (options.now ?? new Date()).toISOString();
  let changed = false;
  const tasks = snapshot.tasks.map((task) => {
    if (
      task.id !== taskId ||
      !task.archivedAt ||
      workspaceStorageKey(task.workspacePath) !== workspaceKey
    ) {
      return task;
    }
    changed = true;
    return { ...task, archivedAt: null, updatedAt: timestamp, status: "idle" as const };
  });
  if (!changed) return snapshot;
  return {
    ...snapshot,
    tasks,
    activeTaskIds: { ...snapshot.activeTaskIds, [workspaceKey]: taskId },
  };
}

export function deriveTaskTitle(prompt: string, maximumLength = 56) {
  const firstMeaningfulLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalized = (firstMeaningfulLine || NEW_TASK_TITLE)
    .replace(/^[#>*\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(normalized || NEW_TASK_TITLE);
  if (characters.length <= maximumLength) return characters.join("");
  return `${characters.slice(0, Math.max(1, maximumLength - 1)).join("")}…`;
}

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupTasks(tasks: GrokTask[], now = new Date()): TaskGroup[] {
  const today = startOfLocalDay(now);
  const dayInMilliseconds = 24 * 60 * 60 * 1_000;
  const buckets: Record<TaskGroup["label"], GrokTask[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  [...tasks]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .forEach((task) => {
      const taskDay = startOfLocalDay(new Date(task.updatedAt));
      const daysAgo = Math.max(0, Math.round((today - taskDay) / dayInMilliseconds));
      const label: TaskGroup["label"] =
        daysAgo === 0
          ? "Today"
          : daysAgo === 1
            ? "Yesterday"
            : daysAgo < 7
              ? "This week"
              : "Earlier";
      buckets[label].push(task);
    });

  return (["Today", "Yesterday", "This week", "Earlier"] as const)
    .map((label) => ({ label, tasks: buckets[label] }))
    .filter((group) => group.tasks.length > 0);
}

export function formatTaskTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = startOfLocalDay(date) === startOfLocalDay(now);
  if (sameDay) {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}
