import { describe, expect, it } from "vitest";
import {
  createTask,
  deleteTask,
  deriveTaskTitle,
  emptyTaskStore,
  ensureWorkspaceTask,
  filterTasks,
  groupTasks,
  parseTaskStore,
  renameTask,
  serializeTaskStore,
  workspaceStorageKey,
} from "./tasks";

describe("task persistence", () => {
  it("creates one honest empty task for a new workspace", () => {
    const snapshot = ensureWorkspaceTask(emptyTaskStore(), "C:\\work\\app", {
      id: "task-1",
      now: new Date("2026-07-21T01:00:00.000Z"),
    });

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]).toMatchObject({
      id: "task-1",
      title: "New task",
      status: "idle",
      acpSessionId: null,
      messages: [],
    });
    expect(snapshot.activeTaskIds[workspaceStorageKey("C:\\work\\app")]).toBe(
      "task-1",
    );
  });

  it("restores safe data while clearing impossible running state", () => {
    const task = createTask("C:\\work\\app", {
      id: "task-1",
      now: new Date("2026-07-21T01:00:00.000Z"),
    });
    const raw = serializeTaskStore({
      version: 1,
      activeTaskIds: { [workspaceStorageKey(task.workspacePath)]: task.id },
      tasks: [
        {
          ...task,
          status: "running",
          acpSessionId: "session-123",
          messages: [
            {
              id: "agent-1",
              role: "agent",
              name: "Grok Build",
              time: "09:30",
              content: "Saved reply",
              streaming: true,
            },
          ],
        },
      ],
    });

    const restored = parseTaskStore(raw);
    expect(restored.tasks[0]).toMatchObject({
      status: "idle",
      acpSessionId: "session-123",
    });
    expect(restored.tasks[0].messages[0].streaming).toBe(false);
  });

  it("falls back safely for malformed or unsupported storage", () => {
    expect(parseTaskStore("not json")).toEqual(emptyTaskStore());
    expect(
      parseTaskStore(JSON.stringify({ version: 99, tasks: [] })),
    ).toEqual(emptyTaskStore());
  });
});

describe("task presentation", () => {
  it("derives a concise title from the first meaningful prompt line", () => {
    expect(deriveTaskTitle("\n  # Fix OAuth callback refresh\nMore detail")).toBe(
      "Fix OAuth callback refresh",
    );
    expect(deriveTaskTitle("这是一个需要自动截断的很长很长很长任务", 12)).toBe(
      "这是一个需要自动截断的…",
    );
  });

  it("searches task titles and saved transcript content", () => {
    const oauthTask = {
      ...createTask("C:\\work\\app", { id: "oauth" }),
      title: "Refresh OAuth",
    };
    const diffTask = {
      ...createTask("C:\\work\\app", { id: "diff" }),
      title: "Workspace review",
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          name: "You",
          time: "10:00",
          content: "Show the unified patch",
        },
      ],
    };

    expect(filterTasks([oauthTask, diffTask], "oauth").map((task) => task.id)).toEqual([
      "oauth",
    ]);
    expect(filterTasks([oauthTask, diffTask], "PATCH").map((task) => task.id)).toEqual([
      "diff",
    ]);
  });

  it("renames and deletes tasks while preserving one active workspace task", () => {
    const workspace = "C:\\work\\app";
    const first = createTask(workspace, {
      id: "first",
      now: new Date("2026-07-21T01:00:00.000Z"),
    });
    const renamed = renameTask(
      {
        version: 1,
        tasks: [first],
        activeTaskIds: { [workspaceStorageKey(workspace)]: first.id },
      },
      first.id,
      "  Reviewed   workspace  ",
    );
    expect(renamed.tasks[0].title).toBe("Reviewed workspace");

    const deleted = deleteTask(renamed, first.id, workspace, {
      replacementId: "replacement",
      now: new Date("2026-07-21T02:00:00.000Z"),
    });
    expect(deleted.tasks.map((task) => task.id)).toEqual(["replacement"]);
    expect(deleted.activeTaskIds[workspaceStorageKey(workspace)]).toBe(
      "replacement",
    );
  });

  it("groups tasks by their real update date", () => {
    const now = new Date(2026, 6, 21, 12, 0, 0);
    const makeTask = (id: string, date: Date) => ({
      ...createTask("C:\\work\\app", { id, now: date }),
      updatedAt: date.toISOString(),
    });
    const groups = groupTasks(
      [
        makeTask("today", new Date(2026, 6, 21, 9, 0, 0)),
        makeTask("yesterday", new Date(2026, 6, 20, 18, 0, 0)),
        makeTask("week", new Date(2026, 6, 17, 18, 0, 0)),
        makeTask("earlier", new Date(2026, 5, 1, 18, 0, 0)),
      ],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "Earlier",
    ]);
    expect(groups.map((group) => group.tasks[0].id)).toEqual([
      "today",
      "yesterday",
      "week",
      "earlier",
    ]);
  });
});
