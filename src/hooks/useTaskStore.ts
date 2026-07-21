import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTask as createGrokTask,
  deleteTask as deleteTaskFromSnapshot,
  ensureWorkspaceTask,
  parseTaskStore,
  renameTask as renameTaskInSnapshot,
  serializeTaskStore,
  TASK_STORE_KEY,
  workspaceStorageKey,
  type TaskStoreSnapshot,
} from "../lib/tasks";
import { isWorkspaceSelected } from "../lib/workspace";
import type { GrokTask } from "../types";

export type UpdateTask = (
  taskId: string,
  updater: (task: GrokTask) => GrokTask,
) => void;

const loadSnapshot = (workspacePath: string) => {
  const stored =
    typeof window === "undefined"
      ? { version: 1 as const, tasks: [], activeTaskIds: {} }
      : parseTaskStore(window.localStorage.getItem(TASK_STORE_KEY));

  if (!isWorkspaceSelected(workspacePath)) return stored;
  return ensureWorkspaceTask(stored, workspacePath);
};

const persistSnapshot = (snapshot: TaskStoreSnapshot) => {
  try {
    window.localStorage.setItem(TASK_STORE_KEY, serializeTaskStore(snapshot));
  } catch {
    // Storage may be unavailable or full. The in-memory task remains usable.
  }
};

export function useTaskStore(workspacePath: string) {
  const workspaceSelected = isWorkspaceSelected(workspacePath);
  const [snapshot, setSnapshot] = useState<TaskStoreSnapshot>(() =>
    loadSnapshot(workspacePath),
  );
  const latestSnapshot = useRef(snapshot);
  const workspaceKey = workspaceStorageKey(workspacePath);

  useEffect(() => {
    if (!workspaceSelected) return;
    setSnapshot((current) => ensureWorkspaceTask(current, workspacePath));
  }, [workspacePath, workspaceSelected]);

  useEffect(() => {
    latestSnapshot.current = snapshot;
    const timer = window.setTimeout(() => persistSnapshot(snapshot), 120);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  useEffect(() => {
    const flush = () => persistSnapshot(latestSnapshot.current);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const tasks = useMemo(
    () => {
      if (!workspaceSelected) return [];
      return snapshot.tasks
        .filter(
          (task) => workspaceStorageKey(task.workspacePath) === workspaceKey,
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        );
    },
    [snapshot.tasks, workspaceKey, workspaceSelected],
  );

  const activeTaskId = workspaceSelected
    ? snapshot.activeTaskIds[workspaceKey] ?? tasks[0]?.id ?? null
    : null;
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  const createTask = useCallback(() => {
    if (!workspaceSelected) return null;
    const task = createGrokTask(workspacePath);
    setSnapshot((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      activeTaskIds: {
        ...current.activeTaskIds,
        [workspaceStorageKey(workspacePath)]: task.id,
      },
    }));
    return task.id;
  }, [workspacePath, workspaceSelected]);

  const selectTask = useCallback(
    (taskId: string) => {
      setSnapshot((current) => {
        const belongsToWorkspace = current.tasks.some(
          (task) =>
            task.id === taskId &&
            workspaceStorageKey(task.workspacePath) === workspaceKey,
        );
        if (!belongsToWorkspace) return current;

        return {
          ...current,
          activeTaskIds: { ...current.activeTaskIds, [workspaceKey]: taskId },
        };
      });
    },
    [workspaceKey],
  );

  const updateTask = useCallback<UpdateTask>((taskId, updater) => {
    setSnapshot((current) => {
      let changed = false;
      const tasks = current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const next = updater(task);
        changed = next !== task;
        return {
          ...next,
          id: task.id,
          workspacePath: task.workspacePath,
        };
      });
      return changed ? { ...current, tasks } : current;
    });
  }, []);

  const renameTask = useCallback((taskId: string, title: string) => {
    setSnapshot((current) => renameTaskInSnapshot(current, taskId, title));
  }, []);

  const deleteTask = useCallback(
    (taskId: string) => {
      setSnapshot((current) =>
        deleteTaskFromSnapshot(current, taskId, workspacePath),
      );
    },
    [workspacePath],
  );

  return {
    tasks,
    activeTask,
    activeTaskId,
    createTask,
    selectTask,
    updateTask,
    renameTask,
    deleteTask,
  };
}
