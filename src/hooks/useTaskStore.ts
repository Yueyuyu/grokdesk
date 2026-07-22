import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveTask as archiveTaskInSnapshot,
  createTaskBranch,
  createTask as createGrokTask,
  deleteTask as deleteTaskFromSnapshot,
  emptyTaskStore,
  ensureWorkspaceTask,
  LEGACY_TASK_STORE_KEY,
  MAX_TASKS,
  parseTaskStore,
  renameTask as renameTaskInSnapshot,
  restoreTask as restoreTaskInSnapshot,
  serializeTaskStore,
  TASK_STORE_KEY,
  workspaceStorageKey,
  type TaskStoreSnapshot,
} from "../lib/tasks";
import { parseTaskImport, serializeTaskExport } from "../lib/taskExchange";
import { isWorkspaceSelected } from "../lib/workspace";
import type { GrokTask } from "../types";

export type UpdateTask = (
  taskId: string,
  updater: (task: GrokTask) => GrokTask,
) => void;

const loadSnapshot = (workspacePath: string) => {
  const stored =
    typeof window === "undefined"
      ? emptyTaskStore()
      : parseTaskStore(
          window.localStorage.getItem(TASK_STORE_KEY) ??
            window.localStorage.getItem(LEGACY_TASK_STORE_KEY),
        );

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

  const workspaceTasks = useMemo(
    () =>
      workspaceSelected
        ? snapshot.tasks
            .filter(
              (task) => workspaceStorageKey(task.workspacePath) === workspaceKey,
            )
            .sort(
              (left, right) =>
                new Date(right.updatedAt).getTime() -
                new Date(left.updatedAt).getTime(),
            )
        : [],
    [snapshot.tasks, workspaceKey, workspaceSelected],
  );
  const tasks = useMemo(
    () => workspaceTasks.filter((task) => !task.archivedAt),
    [workspaceTasks],
  );
  const archivedTasks = useMemo(
    () => workspaceTasks.filter((task) => Boolean(task.archivedAt)),
    [workspaceTasks],
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
      tasks: [task, ...current.tasks].slice(0, MAX_TASKS),
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
            !task.archivedAt &&
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

  const branchTask = useCallback(
    (taskId: string) => {
      const source = latestSnapshot.current.tasks.find(
        (task) =>
          task.id === taskId &&
          !task.archivedAt &&
          workspaceStorageKey(task.workspacePath) === workspaceKey,
      );
      if (!source) return null;
      const branch = createTaskBranch(source);
      setSnapshot((current) => ({
        ...current,
        tasks: [branch, ...current.tasks].slice(0, MAX_TASKS),
        activeTaskIds: { ...current.activeTaskIds, [workspaceKey]: branch.id },
      }));
      return branch.id;
    },
    [workspaceKey],
  );

  const archiveTask = useCallback(
    (taskId: string) => {
      setSnapshot((current) =>
        archiveTaskInSnapshot(current, taskId, workspacePath),
      );
    },
    [workspacePath],
  );

  const restoreTask = useCallback(
    (taskId: string) => {
      setSnapshot((current) =>
        restoreTaskInSnapshot(current, taskId, workspacePath),
      );
    },
    [workspacePath],
  );

  const exportTask = useCallback((taskId: string) => {
    const task = latestSnapshot.current.tasks.find(
      (candidate) => candidate.id === taskId,
    );
    if (!task) throw new Error("The selected task no longer exists.");
    return { title: task.title, content: serializeTaskExport(task) };
  }, []);

  const importTask = useCallback(
    (raw: string) => {
      if (!workspaceSelected) {
        throw new Error("Choose a workspace before importing a task.");
      }
      const task = parseTaskImport(raw, workspacePath);
      setSnapshot((current) => ({
        ...current,
        tasks: [task, ...current.tasks].slice(0, MAX_TASKS),
        activeTaskIds: { ...current.activeTaskIds, [workspaceKey]: task.id },
      }));
      return task.id;
    },
    [workspaceKey, workspacePath, workspaceSelected],
  );

  return {
    tasks,
    archivedTasks,
    activeTask,
    activeTaskId,
    createTask,
    selectTask,
    updateTask,
    renameTask,
    deleteTask,
    branchTask,
    archiveTask,
    restoreTask,
    exportTask,
    importTask,
  };
}
