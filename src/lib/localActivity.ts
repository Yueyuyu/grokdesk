import type { GrokTask } from "../types";

export interface LocalActivityDay {
  date: string;
  sessions: number;
  userTurns: number;
  agentTurns: number;
}

export interface LocalActivityRow {
  id: string;
  title: string;
  updatedAt: string;
  model: string;
  userTurns: number;
  agentTurns: number;
  toolActivities: number;
  archived: boolean;
}

export interface LocalActivitySnapshot {
  sessions: number;
  userTurns: number;
  agentTurns: number;
  toolActivities: number;
  activeDays: number;
  days: LocalActivityDay[];
  recent: LocalActivityRow[];
}

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const localDayKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const validDate = (value: string | undefined, fallback: string) => {
  const candidate = new Date(value ?? fallback);
  return Number.isNaN(candidate.getTime()) ? new Date(fallback) : candidate;
};

const hasSavedActivity = (task: GrokTask) =>
  task.messages.length > 0 || task.tools.length > 0 || task.plan.length > 0;

export function buildLocalActivity(
  tasks: GrokTask[],
  options: { now?: Date; days?: number; recentLimit?: number } = {},
): LocalActivitySnapshot {
  const now = options.now ?? new Date();
  const dayCount = Math.min(371, Math.max(7, options.days ?? 371));
  const recentLimit = Math.min(40, Math.max(1, options.recentLimit ?? 12));
  const end = startOfLocalDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - dayCount + 1);

  const dayMap = new Map<string, LocalActivityDay>();
  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDayKey(date);
    dayMap.set(key, {
      date: key,
      sessions: 0,
      userTurns: 0,
      agentTurns: 0,
    });
  }

  const activeTasks = tasks.filter(hasSavedActivity);
  let userTurns = 0;
  let agentTurns = 0;
  let toolActivities = 0;

  for (const task of activeTasks) {
    const touchedDays = new Set<string>();
    userTurns += task.messages.filter((message) => message.role === "user").length;
    agentTurns += task.messages.filter((message) => message.role === "agent").length;
    toolActivities += task.tools.length;

    for (const message of task.messages) {
      const key = localDayKey(validDate(message.createdAt, task.updatedAt));
      const day = dayMap.get(key);
      if (!day) continue;
      if (message.role === "user") day.userTurns += 1;
      else day.agentTurns += 1;
      touchedDays.add(key);
    }

    if (task.messages.length === 0) {
      const key = localDayKey(validDate(task.updatedAt, task.createdAt));
      if (dayMap.has(key)) touchedDays.add(key);
    }
    for (const key of touchedDays) {
      const day = dayMap.get(key);
      if (day) day.sessions += 1;
    }
  }

  const days = [...dayMap.values()];
  return {
    sessions: activeTasks.length,
    userTurns,
    agentTurns,
    toolActivities,
    activeDays: days.filter(
      (day) => day.sessions + day.userTurns + day.agentTurns > 0,
    ).length,
    days,
    recent: [...activeTasks]
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )
      .slice(0, recentLimit)
      .map((task) => ({
        id: task.id,
        title: task.title,
        updatedAt: task.updatedAt,
        model: task.runtimeProfile.modelId || "Runtime default",
        userTurns: task.messages.filter((message) => message.role === "user").length,
        agentTurns: task.messages.filter((message) => message.role === "agent").length,
        toolActivities: task.tools.length,
        archived: Boolean(task.archivedAt),
      })),
  };
}
