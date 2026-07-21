import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTask as createGrokTask,
  ensureWorkspaceTask,
  parseTaskStore,
  serializeTaskStore,
  TASK_STORE_KEY,
  workspaceStorageKey,
  type TaskStoreSnapshot,
} from "../lib/tasks";
import type { GrokTask } from "../types";

export type UpdateTask = (
  taskId: string,
  updater: (task: GrokTask) => GrokTask,
) => void;

const loadSnapshot = (workspacePath: string) => {
  if (typeof window === "undefined") {
    return ensureWorkspaceTask(
      { version: 1, tasks: [], activeTaskIds: {} },
      workspacePath,
    );
  }

  return ensureWorkspaceTask(
    parseTaskStore(window.localStorage.getItem(TASK_STORE_KEY)),
    workspacePath,
  );
};

const persistSnapshot = (snapshot: TaskStoreSnapshot) => {
  try {
    window.localStorage.setItem(TASK_STORE_KEY, serializeTaskStore(snapshot));
  } catch {
    // Storage may be unavailable or full. The in-memory task remains usable.
  }
};

export function useTaskStore(workspacePath: string) {
  const [snapshot, setSnapshot] = useState<TaskStoreSnapshot>(() =>
    loadSnapshot(workspacePath),
  );
  const latestSnapshot = useRef(snapshot);
  const workspaceKey = workspaceStorageKey(workspacePath);

  useEffect(() => {
    setSnapshot((current) => ensureWorkspaceTask(current, workspacePath));
  }, [workspacePath]);

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
    () =>
      snapshot.tasks
        .filter(
          (task) => workspaceStorageKey(task.workspacePath) === workspaceKey,
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        ),
    [snapshot.tasks, workspaceKey],
  );

  const activeTaskId = snapshot.activeTaskIds[workspaceKey] ?? tasks[0]?.id ?? null;
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  const createTask = useCallback(() => {
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
  }, [workspacePath]);

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

  return {
    tasks,
    activeTask,
    activeTaskId,
    createTask,
    selectTask,
    updateTask,
  };
}
