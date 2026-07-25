import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  emptyTaskStore,
  LEGACY_TASK_STORE_KEY,
  parseTaskStoreResult,
  serializeTaskStore,
  TASK_STORE_KEY,
  type TaskStoreSnapshot,
} from "./tasks";

export const MAX_TASK_STORE_BYTES = 64 * 1024 * 1024;
export const TASK_STORE_SHADOW_TIMESTAMP_KEY =
  "grokdesk.tasks.v2.shadow-saved-at";
export const TASK_BACKUP_SCHEMA = "grokdesk-task-store-backup";
export const TASK_BACKUP_VERSION = 1;

export interface NativeTaskStoreLoad {
  content: string | null;
  source: "primary" | "backup" | "empty";
  recoveredFromBackup: boolean;
  modifiedAtMs: number | null;
  byteLength: number;
}

export interface NativeTaskStoreSave {
  modifiedAtMs: number;
  byteLength: number;
}

export interface TaskStoreShadow {
  raw: string | null;
  savedAtMs: number | null;
  error: string | null;
}

export interface TaskStoreResolution {
  snapshot: TaskStoreSnapshot;
  source: "native" | "shadow" | "empty";
  migratedFromLegacy: boolean;
  recoveredFromShadow: boolean;
}

export type TaskStoragePhase = "loading" | "saving" | "saved" | "error";
export type TaskStorageMode = "native" | "browser";

export interface TaskStorageStatus {
  mode: TaskStorageMode;
  phase: TaskStoragePhase;
  message: string;
  lastSavedAtMs: number | null;
  byteLength: number;
  recoveredFromBackup: boolean;
  recoveredFromShadow: boolean;
  migratedFromLegacy: boolean;
}

interface TaskStoreBackupEnvelope {
  schema: typeof TASK_BACKUP_SCHEMA;
  version: typeof TASK_BACKUP_VERSION;
  exportedAt: string;
  store: TaskStoreSnapshot;
}

const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;

const storageOrWindow = (storage?: Storage) => storage ?? window.localStorage;

export function readTaskStoreShadow(storage?: Storage): TaskStoreShadow {
  try {
    const target = storageOrWindow(storage);
    const raw =
      target.getItem(TASK_STORE_KEY) ??
      target.getItem(LEGACY_TASK_STORE_KEY);
    const timestamp = Number(target.getItem(TASK_STORE_SHADOW_TIMESTAMP_KEY));
    return {
      raw,
      savedAtMs:
        Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null,
      error: null,
    };
  } catch {
    return {
      raw: null,
      savedAtMs: null,
      error: "Browser fallback storage is unavailable.",
    };
  }
}

export function writeTaskStoreShadow(
  raw: string,
  savedAtMs = Date.now(),
  storage?: Storage,
): TaskStoreShadow {
  try {
    const target = storageOrWindow(storage);
    target.setItem(TASK_STORE_KEY, raw);
    target.setItem(TASK_STORE_SHADOW_TIMESTAMP_KEY, String(savedAtMs));
    return { raw, savedAtMs, error: null };
  } catch {
    return {
      raw,
      savedAtMs: null,
      error:
        "Browser fallback storage is full or unavailable. Native storage remains authoritative.",
    };
  }
}

export function resolveTaskStoreLoad(
  native: NativeTaskStoreLoad,
  shadow: TaskStoreShadow,
): TaskStoreResolution {
  if (!native.content && shadow.error) {
    throw new Error(shadow.error);
  }

  const nativeParsed = native.content
    ? parseTaskStoreResult(native.content)
    : null;
  if (nativeParsed && !nativeParsed.valid) {
    throw new Error(
      nativeParsed.error ?? "Native task history failed schema validation.",
    );
  }

  const shadowParsed = shadow.raw ? parseTaskStoreResult(shadow.raw) : null;
  const validShadow =
    shadowParsed?.valid === true ? shadowParsed.snapshot : null;
  const shadowIsNewer =
    Boolean(validShadow) &&
    shadow.savedAtMs !== null &&
    (native.modifiedAtMs === null || shadow.savedAtMs > native.modifiedAtMs);

  if (validShadow && (!native.content || shadowIsNewer)) {
    return {
      snapshot: validShadow,
      source: "shadow",
      migratedFromLegacy: !native.content && shadow.savedAtMs === null,
      recoveredFromShadow: Boolean(native.content && shadowIsNewer),
    };
  }

  if (nativeParsed?.valid) {
    return {
      snapshot: nativeParsed.snapshot,
      source: "native",
      migratedFromLegacy: false,
      recoveredFromShadow: false,
    };
  }

  if (shadowParsed && !shadowParsed.valid) {
    throw new Error(
      shadowParsed.error ?? "The legacy task history could not be migrated.",
    );
  }

  return {
    snapshot: emptyTaskStore(),
    source: "empty",
    migratedFromLegacy: false,
    recoveredFromShadow: false,
  };
}

export async function loadNativeTaskStore(): Promise<NativeTaskStoreLoad> {
  if (!isTauri()) {
    throw new Error("Native task storage is available only in GrokDesk.");
  }
  return invoke<NativeTaskStoreLoad>("load_native_task_store");
}

export async function saveNativeTaskStore(
  snapshot: TaskStoreSnapshot,
): Promise<NativeTaskStoreSave> {
  if (!isTauri()) {
    throw new Error("Native task storage is available only in GrokDesk.");
  }
  return invoke<NativeTaskStoreSave>("save_native_task_store", {
    content: serializeTaskStore(snapshot),
  });
}

export function serializeTaskStoreBackup(
  snapshot: TaskStoreSnapshot,
  now = new Date(),
) {
  const normalized = parseTaskStoreResult(serializeTaskStore(snapshot));
  if (!normalized.valid) {
    throw new Error(
      normalized.error ?? "The current GrokDesk task history is malformed.",
    );
  }
  const portableStore: TaskStoreSnapshot = {
    ...normalized.snapshot,
    tasks: normalized.snapshot.tasks.map((task) => ({
      ...task,
      status: task.status === "running" ? "idle" : task.status,
      acpSessionId: null,
    })),
  };
  const envelope: TaskStoreBackupEnvelope = {
    schema: TASK_BACKUP_SCHEMA,
    version: TASK_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    store: portableStore,
  };
  const content = JSON.stringify(envelope, null, 2);
  if (utf8Length(content) > MAX_TASK_STORE_BYTES) {
    throw new Error("This GrokDesk backup exceeds the 64 MiB safety limit.");
  }
  return content;
}

export function parseTaskStoreBackup(raw: string): TaskStoreSnapshot {
  if (utf8Length(raw) > MAX_TASK_STORE_BYTES) {
    throw new Error("The selected GrokDesk backup exceeds the 64 MiB safety limit.");
  }
  let candidate: Partial<TaskStoreBackupEnvelope>;
  try {
    candidate = JSON.parse(raw) as Partial<TaskStoreBackupEnvelope>;
  } catch {
    throw new Error("The selected GrokDesk backup is not valid JSON.");
  }
  if (
    candidate.schema !== TASK_BACKUP_SCHEMA ||
    candidate.version !== TASK_BACKUP_VERSION ||
    !candidate.store
  ) {
    throw new Error("The selected file is not a supported GrokDesk task backup.");
  }
  const parsed = parseTaskStoreResult(JSON.stringify(candidate.store));
  if (!parsed.valid) {
    throw new Error(parsed.error ?? "The GrokDesk task backup is malformed.");
  }
  return parsed.snapshot;
}

const safeBackupFileName = (now = new Date()) => {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `GrokDesk-${timestamp}.grokdesk-backup.json`;
};

const browserBackupFile = () =>
  new Promise<string | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > MAX_TASK_STORE_BYTES) {
          reject(
            new Error(
              "The selected GrokDesk backup exceeds the 64 MiB safety limit.",
            ),
          );
          return;
        }
        file.text().then(resolve, reject);
      },
      { once: true },
    );
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });

export async function readTaskStoreBackupFile(): Promise<string | null> {
  if (!isTauri()) return browserBackupFile();
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "GrokDesk task backup", extensions: ["json"] }],
  });
  if (typeof selected !== "string") return null;
  return invoke<string>("read_task_store_backup_file", { path: selected });
}

export async function writeTaskStoreBackupFile(
  content: string,
): Promise<boolean> {
  const fileName = safeBackupFileName();
  if (!isTauri()) {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }
  const selected = await save({
    defaultPath: fileName,
    filters: [{ name: "GrokDesk task backup", extensions: ["json"] }],
  });
  if (typeof selected !== "string") return false;
  const path = selected.toLocaleLowerCase().endsWith(".json")
    ? selected
    : `${selected}.json`;
  await invoke("write_task_store_backup_file", { path, content });
  return true;
}
