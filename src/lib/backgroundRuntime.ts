export interface TaskScopedEvent<T> {
  taskId: string;
  payload: T;
}

export interface TaskSessionStatus {
  state: "connected" | "disconnected" | "evicted";
  message: string;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function parseTaskScopedEvent<T>(
  value: unknown,
): TaskScopedEvent<T> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.taskId !== "string" ||
    !TASK_ID_PATTERN.test(candidate.taskId) ||
    !Object.hasOwn(candidate, "payload")
  ) {
    return null;
  }
  return {
    taskId: candidate.taskId,
    payload: candidate.payload as T,
  };
}

export function backgroundTaskCount(
  runningTaskIds: readonly string[],
  activeTaskId: string | null,
) {
  return runningTaskIds.reduce(
    (count, taskId) => count + (taskId === activeTaskId ? 0 : 1),
    0,
  );
}
