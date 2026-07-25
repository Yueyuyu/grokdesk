import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  archiveTask as archiveTaskInSnapshot,
  createTaskBranch,
  createTask as createGrokTask,
  deleteTask as deleteTaskFromSnapshot,
  emptyTaskStore,
  ensureWorkspaceTask,
  hasTaskCapacity,
  MAX_TASKS,
  parseTaskStore,
  renameTask as renameTaskInSnapshot,
  restoreTask as restoreTaskInSnapshot,
  serializeTaskStore,
  workspaceStorageKey,
  type TaskStoreSnapshot,
} from "../lib/tasks";
import { parseTaskImport, serializeTaskExport } from "../lib/taskExchange";
import {
  loadNativeTaskStore,
  parseTaskStoreBackup,
  readTaskStoreBackupFile,
  readTaskStoreShadow,
  resolveTaskStoreLoad,
  saveNativeTaskStore,
  serializeTaskStoreBackup,
  writeTaskStoreBackupFile,
  writeTaskStoreShadow,
  type TaskStorageStatus,
} from "../lib/taskPersistence";
import { loadDefaultRuntimeProfile } from "../lib/runtimeProfile";
import { isDesktopRuntime } from "../lib/desktop";
import { isWorkspaceSelected } from "../lib/workspace";
import type { GrokTask } from "../types";

export type UpdateTask = (
  taskId: string,
  updater: (task: GrokTask) => GrokTask,
) => void;

const loadProvisionalSnapshot = () => {
  if (typeof window === "undefined") return emptyTaskStore();
  return parseTaskStore(readTaskStoreShadow().raw);
};

const initialStorageStatus = (
  native: boolean,
  nativeMessage: string,
  browserMessage: string,
): TaskStorageStatus => ({
  mode: native ? "native" : "browser",
  phase: native ? "loading" : "saved",
  message: native ? nativeMessage : browserMessage,
  lastSavedAtMs: null,
  byteLength: 0,
  recoveredFromBackup: false,
  recoveredFromShadow: false,
  migratedFromLegacy: false,
});

export function useTaskStore(workspacePath: string) {
  const { formatNumber, t } = useI18n();
  const nativeStorage = isDesktopRuntime();
  const workspaceSelected = isWorkspaceSelected(workspacePath);
  const [snapshot, setSnapshot] = useState<TaskStoreSnapshot>(
    loadProvisionalSnapshot,
  );
  const [hydrated, setHydrated] = useState(!nativeStorage);
  const [storageStatus, setStorageStatus] = useState<TaskStorageStatus>(() =>
    initialStorageStatus(
      nativeStorage,
      t("storage.loading"),
      t("storage.savedBrowser"),
    ),
  );
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [exclusiveOperation, setExclusiveOperation] = useState(false);
  const latestSnapshot = useRef(snapshot);
  const latestWorkspacePath = useRef(workspacePath);
  const hydratedRef = useRef(!nativeStorage);
  const mountedRef = useRef(true);
  const hydrationStartedRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const exclusiveOperationRef = useRef(false);
  const workspaceKey = workspaceStorageKey(workspacePath);
  const capacityMessage = t("tasks.capacity", {
    count: formatNumber(MAX_TASKS),
  });

  latestWorkspacePath.current = workspacePath;
  latestSnapshot.current = snapshot;

  const setCapacityNotice = useCallback(() => {
    setStorageNotice(capacityMessage);
  }, [capacityMessage]);

  const hydrateNativeStorage = useCallback(async () => {
    if (!nativeStorage) return;
    setStorageStatus((current) => ({
      ...current,
      phase: "loading",
      message: t("storage.loadingBackup"),
    }));
    try {
      const [native, shadow] = await Promise.all([
        loadNativeTaskStore(),
        Promise.resolve(readTaskStoreShadow()),
      ]);
      const resolution = resolveTaskStoreLoad(native, shadow);
      const currentWorkspace = latestWorkspacePath.current;
      const next = isWorkspaceSelected(currentWorkspace)
        ? ensureWorkspaceTask(resolution.snapshot, currentWorkspace, {
            runtimeProfile: loadDefaultRuntimeProfile(),
          })
        : resolution.snapshot;
      if (
        isWorkspaceSelected(currentWorkspace) &&
        next === resolution.snapshot &&
        !next.tasks.some(
          (task) =>
            workspaceStorageKey(task.workspacePath) ===
              workspaceStorageKey(currentWorkspace) && !task.archivedAt,
        )
      ) {
        setCapacityNotice();
      }

      let savedAt = native.modifiedAtMs;
      let byteLength = native.byteLength;
      const shouldRepairNative =
        resolution.source === "shadow" || native.recoveredFromBackup;
      if (shouldRepairNative || native.source === "empty") {
        const saved = await saveNativeTaskStore(next);
        savedAt = saved.modifiedAtMs;
        byteLength = saved.byteLength;
      }
      writeTaskStoreShadow(serializeTaskStore(next), savedAt ?? Date.now());

      if (!mountedRef.current) return;
      latestSnapshot.current = next;
      hydratedRef.current = true;
      setSnapshot(next);
      setHydrated(true);
      setStorageStatus({
        mode: "native",
        phase: "saved",
        message: native.recoveredFromBackup
          ? t("storage.recoveredBackup")
          : resolution.recoveredFromShadow
            ? t("storage.recoveredShadow")
            : resolution.migratedFromLegacy
              ? t("storage.migrated")
              : t("storage.savedNative"),
        lastSavedAtMs: savedAt,
        byteLength,
        recoveredFromBackup: native.recoveredFromBackup,
        recoveredFromShadow: resolution.recoveredFromShadow,
        migratedFromLegacy: resolution.migratedFromLegacy,
      });
    } catch {
      if (!mountedRef.current) return;
      hydratedRef.current = false;
      setHydrated(false);
      setStorageStatus((current) => ({
        ...current,
        phase: "error",
        message: t("storage.readFailed"),
      }));
    }
  }, [nativeStorage, setCapacityNotice, t]);

  useEffect(() => {
    mountedRef.current = true;
    if (nativeStorage && !hydrationStartedRef.current) {
      hydrationStartedRef.current = true;
      void hydrateNativeStorage();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [hydrateNativeStorage, nativeStorage]);

  useEffect(() => {
    if (!hydrated || !workspaceSelected) return;
    setSnapshot((current) => {
      const next = ensureWorkspaceTask(current, workspacePath, {
        runtimeProfile: loadDefaultRuntimeProfile(),
      });
      if (
        next === current &&
        !current.tasks.some(
          (task) =>
            workspaceStorageKey(task.workspacePath) === workspaceKey &&
            !task.archivedAt,
        )
      ) {
        setCapacityNotice();
      }
      return next;
    });
  }, [
    hydrated,
    setCapacityNotice,
    workspaceKey,
    workspacePath,
    workspaceSelected,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimerRef.current !== null) return;

    saveRevisionRef.current += 1;
    const revision = saveRevisionRef.current;
    setStorageStatus((current) => ({
      ...current,
      phase: "saving",
      message:
        current.mode === "native"
          ? t("storage.saving")
          : t("storage.savingBrowser"),
    }));
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const pending = latestSnapshot.current;
      const raw = serializeTaskStore(pending);
      const shadow = writeTaskStoreShadow(raw);
      if (!nativeStorage) {
        if (!mountedRef.current) return;
        setStorageStatus((current) => ({
          ...current,
          phase: shadow.error ? "error" : "saved",
          message:
            (shadow.error ? t("storage.browserWriteFailed") : null) ??
            t("storage.savedBrowser"),
          lastSavedAtMs: shadow.savedAtMs,
          byteLength: new TextEncoder().encode(raw).byteLength,
        }));
        return;
      }

      const operation = saveQueueRef.current.then(async () => {
        const saved = await saveNativeTaskStore(pending);
        writeTaskStoreShadow(raw, saved.modifiedAtMs);
        if (!mountedRef.current || revision !== saveRevisionRef.current) return;
        setStorageStatus((current) => ({
          ...current,
          phase: "saved",
          message: t("storage.savedNative"),
          lastSavedAtMs: saved.modifiedAtMs,
          byteLength: saved.byteLength,
        }));
      });
      saveQueueRef.current = operation.catch(() => undefined);
      void operation.catch((cause) => {
        if (!mountedRef.current || revision !== saveRevisionRef.current) return;
        setStorageStatus((current) => ({
          ...current,
          phase: "error",
          message: t("storage.writeFailed"),
        }));
      });
    }, 250);
  }, [hydrated, nativeStorage, snapshot, t]);

  useEffect(() => {
    const flushShadow = () => {
      writeTaskStoreShadow(serializeTaskStore(latestSnapshot.current));
    };
    window.addEventListener("beforeunload", flushShadow);
    return () => {
      window.removeEventListener("beforeunload", flushShadow);
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushShadow();
    };
  }, []);

  const workspaceTasks = useMemo(
    () =>
      hydrated && workspaceSelected
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
    [hydrated, snapshot.tasks, workspaceKey, workspaceSelected],
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
    if (
      !hydratedRef.current ||
      exclusiveOperationRef.current ||
      !workspaceSelected
    ) {
      return null;
    }
    if (!hasTaskCapacity(latestSnapshot.current)) {
      setCapacityNotice();
      return null;
    }
    const task = createGrokTask(workspacePath, {
      runtimeProfile: loadDefaultRuntimeProfile(),
    });
    setSnapshot((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      activeTaskIds: {
        ...current.activeTaskIds,
        [workspaceStorageKey(workspacePath)]: task.id,
      },
    }));
    setStorageNotice(null);
    return task.id;
  }, [setCapacityNotice, workspacePath, workspaceSelected]);

  const selectTask = useCallback(
    (taskId: string) => {
      if (!hydratedRef.current || exclusiveOperationRef.current) return;
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
    if (!hydratedRef.current || exclusiveOperationRef.current) return;
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
    if (!hydratedRef.current || exclusiveOperationRef.current) return;
    setSnapshot((current) => renameTaskInSnapshot(current, taskId, title));
  }, []);

  const deleteTask = useCallback(
    (taskId: string) => {
      if (!hydratedRef.current || exclusiveOperationRef.current) return;
      setSnapshot((current) =>
        deleteTaskFromSnapshot(current, taskId, workspacePath),
      );
      setStorageNotice(null);
    },
    [workspacePath],
  );

  const branchTask = useCallback(
    (taskId: string) => {
      if (!hydratedRef.current || exclusiveOperationRef.current) return null;
      if (!hasTaskCapacity(latestSnapshot.current)) {
        setCapacityNotice();
        return null;
      }
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
        tasks: [branch, ...current.tasks],
        activeTaskIds: { ...current.activeTaskIds, [workspaceKey]: branch.id },
      }));
      setStorageNotice(null);
      return branch.id;
    },
    [setCapacityNotice, workspaceKey],
  );

  const archiveTask = useCallback(
    (taskId: string) => {
      if (!hydratedRef.current || exclusiveOperationRef.current) return;
      const activeCount = latestSnapshot.current.tasks.filter(
        (task) =>
          workspaceStorageKey(task.workspacePath) === workspaceKey &&
          !task.archivedAt,
      ).length;
      if (
        activeCount === 1 &&
        !hasTaskCapacity(latestSnapshot.current)
      ) {
        setCapacityNotice();
        return;
      }
      setSnapshot((current) =>
        archiveTaskInSnapshot(current, taskId, workspacePath),
      );
    },
    [setCapacityNotice, workspaceKey, workspacePath],
  );

  const restoreTask = useCallback(
    (taskId: string) => {
      if (!hydratedRef.current || exclusiveOperationRef.current) return;
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
    if (!task) throw new Error(t("tasks.noLongerExists"));
    try {
      return { title: task.title, content: serializeTaskExport(task) };
    } catch {
      throw new Error(t("tasks.exportFailed"));
    }
  }, [t]);

  const importTask = useCallback(
    (raw: string) => {
      if (
        !hydratedRef.current ||
        exclusiveOperationRef.current ||
        !workspaceSelected
      ) {
        throw new Error(t("tasks.chooseWorkspaceBeforeImport"));
      }
      if (!hasTaskCapacity(latestSnapshot.current)) {
        setCapacityNotice();
        throw new Error(capacityMessage);
      }
      let task: GrokTask;
      try {
        task = parseTaskImport(raw, workspacePath);
      } catch {
        throw new Error(t("tasks.importFailed"));
      }
      setSnapshot((current) => ({
        ...current,
        tasks: [task, ...current.tasks],
        activeTaskIds: { ...current.activeTaskIds, [workspaceKey]: task.id },
      }));
      setStorageNotice(null);
      return task.id;
    },
    [
      setCapacityNotice,
      capacityMessage,
      t,
      workspaceKey,
      workspacePath,
      workspaceSelected,
    ],
  );

  const exportStoreBackup = useCallback(async () => {
    if (!hydratedRef.current) {
      throw new Error(
        t("storage.exportNotReady"),
      );
    }
    try {
      const content = serializeTaskStoreBackup(latestSnapshot.current);
      return await writeTaskStoreBackupFile(content);
    } catch {
      throw new Error(t("storage.exportFailed"));
    }
  }, [t]);

  const restoreStoreBackup = useCallback(async () => {
    let raw: string | null;
    try {
      raw = await readTaskStoreBackupFile();
    } catch {
      throw new Error(t("storage.restoreFailed"));
    }
    if (!raw) return false;
    let restored: TaskStoreSnapshot;
    try {
      restored = parseTaskStoreBackup(raw);
    } catch {
      throw new Error(t("storage.restoreFailed"));
    }
    const accepted = window.confirm(
      t("storage.restoreConfirmation", {
        backup: formatNumber(restored.tasks.length),
        current: formatNumber(latestSnapshot.current.tasks.length),
      }),
    );
    if (!accepted) return false;
    exclusiveOperationRef.current = true;
    setExclusiveOperation(true);
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    const currentWorkspace = latestWorkspacePath.current;
    const next = isWorkspaceSelected(currentWorkspace)
      ? ensureWorkspaceTask(restored, currentWorkspace, {
          runtimeProfile: loadDefaultRuntimeProfile(),
        })
      : restored;

    setStorageStatus((current) => ({
      ...current,
      phase: "saving",
      message: t("storage.validatingRestore"),
    }));
    try {
      const serialized = serializeTaskStore(next);
      let savedAt = Date.now();
      let byteLength = new TextEncoder().encode(serialized).byteLength;
      if (nativeStorage) {
        const operation = saveQueueRef.current.then(() =>
          saveNativeTaskStore(next),
        );
        saveQueueRef.current = operation.then(
          () => undefined,
          () => undefined,
        );
        const saved = await operation;
        savedAt = saved.modifiedAtMs;
        byteLength = saved.byteLength;
        writeTaskStoreShadow(serialized, savedAt);
      } else {
        const shadow = writeTaskStoreShadow(serialized, savedAt);
        if (shadow.error) throw new Error(shadow.error);
        savedAt = shadow.savedAtMs ?? savedAt;
      }
      if (!mountedRef.current || revision !== saveRevisionRef.current) {
        return true;
      }
      latestSnapshot.current = next;
      hydratedRef.current = true;
      setHydrated(true);
      setSnapshot(next);
      const missingCurrentWorkspace =
        isWorkspaceSelected(currentWorkspace) &&
        !next.tasks.some(
          (task) =>
            workspaceStorageKey(task.workspacePath) ===
              workspaceStorageKey(currentWorkspace) && !task.archivedAt,
        );
      if (missingCurrentWorkspace) {
        setCapacityNotice();
      } else {
        setStorageNotice(null);
      }
      setStorageStatus((current) => ({
        ...current,
        phase: "saved",
        message: nativeStorage
          ? t("storage.restoredNative")
          : t("storage.restoredBrowser"),
        lastSavedAtMs: savedAt,
        byteLength,
      }));
      return true;
    } catch {
      if (mountedRef.current && revision === saveRevisionRef.current) {
        setStorageStatus((current) => ({
          ...current,
          phase: "error",
          message: t("storage.restoreFailed"),
        }));
      }
      throw new Error(t("storage.restoreFailed"));
    } finally {
      exclusiveOperationRef.current = false;
      if (mountedRef.current) setExclusiveOperation(false);
    }
  }, [formatNumber, nativeStorage, setCapacityNotice, t]);

  const retryStorage = useCallback(async () => {
    if (!nativeStorage) {
      const raw = serializeTaskStore(latestSnapshot.current);
      const shadow = writeTaskStoreShadow(raw);
      setStorageStatus((current) => ({
        ...current,
        phase: shadow.error ? "error" : "saved",
        message:
          (shadow.error ? t("storage.browserWriteFailed") : null) ??
          t("storage.resavedBrowser"),
        lastSavedAtMs: shadow.savedAtMs,
        byteLength: new TextEncoder().encode(raw).byteLength,
      }));
      return;
    }
    if (!hydratedRef.current) {
      await hydrateNativeStorage();
      return;
    }
    setStorageStatus((current) => ({
      ...current,
      phase: "saving",
      message: t("storage.retryingNative"),
    }));
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    const pending = latestSnapshot.current;
    const serialized = serializeTaskStore(pending);
    try {
      const operation = saveQueueRef.current.then(() =>
        saveNativeTaskStore(pending),
      );
      saveQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      const saved = await operation;
      writeTaskStoreShadow(serialized, saved.modifiedAtMs);
      if (!mountedRef.current || revision !== saveRevisionRef.current) return;
      setStorageStatus((current) => ({
        ...current,
        phase: "saved",
        message: t("storage.rewrittenNative"),
        lastSavedAtMs: saved.modifiedAtMs,
        byteLength: saved.byteLength,
      }));
    } catch {
      if (!mountedRef.current || revision !== saveRevisionRef.current) {
        throw new Error(t("storage.retryFailed"));
      }
      setStorageStatus((current) => ({
        ...current,
        phase: "error",
        message: t("storage.retryFailed"),
      }));
      throw new Error(t("storage.retryFailed"));
    }
  }, [hydrateNativeStorage, nativeStorage, t]);

  return {
    tasks,
    archivedTasks,
    activeTask,
    activeTaskId,
    hydrated,
    storageStatus,
    storageNotice,
    exclusiveOperation,
    taskCount: snapshot.tasks.length,
    taskCapacity: MAX_TASKS,
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
    exportStoreBackup,
    restoreStoreBackup,
    retryStorage,
  };
}
