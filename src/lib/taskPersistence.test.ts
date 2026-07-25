import { describe, expect, it } from "vitest";
import {
  parseTaskStoreBackup,
  readTaskStoreShadow,
  resolveTaskStoreLoad,
  serializeTaskStoreBackup,
  TASK_BACKUP_SCHEMA,
  TASK_BACKUP_VERSION,
  TASK_STORE_SHADOW_TIMESTAMP_KEY,
  type NativeTaskStoreLoad,
} from "./taskPersistence";
import {
  createTask,
  emptyTaskStore,
  LEGACY_TASK_STORE_KEY,
  MAX_TASKS,
  serializeTaskStore,
  TASK_STORE_KEY,
  TASK_STORE_VERSION,
  workspaceStorageKey,
  type TaskStoreSnapshot,
} from "./tasks";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const snapshotWithTask = (
  id: string,
  title: string,
  workspacePath = "C:\\work\\app",
): TaskStoreSnapshot => {
  const task = {
    ...createTask(workspacePath, {
      id,
      now: new Date("2026-07-25T01:00:00.000Z"),
    }),
    title,
  };
  return {
    version: TASK_STORE_VERSION,
    tasks: [task],
    activeTaskIds: { [workspaceStorageKey(workspacePath)]: task.id },
  };
};

const nativeLoad = (
  content: string | null,
  modifiedAtMs: number | null,
): NativeTaskStoreLoad => ({
  content,
  source: content ? "primary" : "empty",
  recoveredFromBackup: false,
  modifiedAtMs,
  byteLength: content ? new TextEncoder().encode(content).byteLength : 0,
});

describe("native task-store resolution", () => {
  it("keeps the native file when its browser shadow is older", () => {
    const native = snapshotWithTask("native", "Native copy");
    const shadow = snapshotWithTask("shadow", "Older shadow");

    const resolved = resolveTaskStoreLoad(
      nativeLoad(serializeTaskStore(native), 200),
      {
        raw: serializeTaskStore(shadow),
        savedAtMs: 100,
        error: null,
      },
    );

    expect(resolved.source).toBe("native");
    expect(resolved.snapshot.tasks[0]?.id).toBe("native");
    expect(resolved.recoveredFromShadow).toBe(false);
  });

  it("migrates an existing localStorage task history on first native launch", () => {
    const storage = new MemoryStorage();
    const legacy = snapshotWithTask("legacy", "Legacy task");
    storage.setItem(LEGACY_TASK_STORE_KEY, serializeTaskStore(legacy));

    const shadow = readTaskStoreShadow(storage);
    const resolved = resolveTaskStoreLoad(nativeLoad(null, null), shadow);

    expect(resolved.source).toBe("shadow");
    expect(resolved.migratedFromLegacy).toBe(true);
    expect(resolved.snapshot.tasks[0]?.id).toBe("legacy");
  });

  it("recovers a newer close-time shadow instead of losing the latest update", () => {
    const storage = new MemoryStorage();
    const native = snapshotWithTask("task", "Before update");
    const shadow = snapshotWithTask("task", "Latest update");
    storage.setItem(TASK_STORE_KEY, serializeTaskStore(shadow));
    storage.setItem(TASK_STORE_SHADOW_TIMESTAMP_KEY, "300");

    const resolved = resolveTaskStoreLoad(
      nativeLoad(serializeTaskStore(native), 200),
      readTaskStoreShadow(storage),
    );

    expect(resolved.source).toBe("shadow");
    expect(resolved.recoveredFromShadow).toBe(true);
    expect(resolved.snapshot.tasks[0]?.title).toBe("Latest update");
  });

  it("does not overwrite an empty native store when shadow storage is unavailable", () => {
    const unavailableStorage = {
      getItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(() =>
      resolveTaskStoreLoad(
        nativeLoad(null, null),
        readTaskStoreShadow(unavailableStorage),
      ),
    ).toThrow("fallback storage is unavailable");
  });
});

describe("full task-store backups", () => {
  it("exports every task while removing ACP session IDs and attachment bodies", () => {
    const snapshot = snapshotWithTask("task", "Portable history");
    snapshot.tasks[0] = {
      ...snapshot.tasks[0],
      status: "running",
      acpSessionId: "session-must-not-export",
      messages: [
        {
          id: "message",
          role: "user",
          name: "You",
          time: "09:00",
          content: "Review this file",
          attachments: [
            {
              name: "context.md",
              mimeType: "text/markdown",
              size: 128,
              kind: "text",
              data: "attachment-body-must-not-export",
            } as never,
          ],
        },
      ],
    };

    const exported = serializeTaskStoreBackup(
      snapshot,
      new Date("2026-07-25T02:00:00.000Z"),
    );
    const restored = parseTaskStoreBackup(exported);

    expect(exported).not.toContain("session-must-not-export");
    expect(exported).not.toContain("attachment-body-must-not-export");
    expect(restored.tasks[0]).toMatchObject({
      id: "task",
      status: "idle",
      acpSessionId: null,
    });
    expect(restored.tasks[0]?.messages[0]?.attachments?.[0]).toEqual({
      name: "context.md",
      mimeType: "text/markdown",
      size: 128,
      kind: "text",
    });
  });

  it("rejects corrupt, unsupported, and over-capacity backup files", () => {
    expect(() => parseTaskStoreBackup("not json")).toThrow("not valid JSON");
    expect(() =>
      parseTaskStoreBackup(
        JSON.stringify({
          schema: TASK_BACKUP_SCHEMA,
          version: TASK_BACKUP_VERSION + 1,
          store: emptyTaskStore(),
        }),
      ),
    ).toThrow("not a supported GrokDesk task backup");

    const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, index) =>
      createTask("C:\\work\\app", { id: `task-${index}` }),
    );
    expect(() =>
      parseTaskStoreBackup(
        JSON.stringify({
          schema: TASK_BACKUP_SCHEMA,
          version: TASK_BACKUP_VERSION,
          exportedAt: "2026-07-25T02:00:00.000Z",
          store: {
            version: TASK_STORE_VERSION,
            tasks,
            activeTaskIds: {},
          },
        }),
      ),
    ).toThrow(`more than the ${MAX_TASKS} supported tasks`);
  });
});
