import { describe, expect, it } from "vitest";
import {
  archiveTask,
  createTaskBranch,
  createTask,
  deleteTask,
  deriveTaskTitle,
  emptyTaskStore,
  ensureWorkspaceTask,
  filterTasks,
  groupTasks,
  parseTaskStore,
  renameTask,
  restoreTask,
  TASK_STORE_VERSION,
  workspaceStorageKey,
} from "./tasks";
import {
  MAX_TASK_EXCHANGE_BYTES,
  parseTaskImport,
  serializeTaskExport,
} from "./taskExchange";

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
      archivedAt: null,
      origin: "created",
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
    const raw = JSON.stringify({
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
              attachments: [
                {
                  name: "context.md",
                  mimeType: "text/markdown",
                  size: 512,
                  kind: "text",
                  data: "must-not-survive",
                },
              ],
              streaming: true,
            },
          ],
        },
      ],
    });

    const restored = parseTaskStore(raw);
    expect(restored.tasks[0]).toMatchObject({
      status: "idle",
      archivedAt: null,
      origin: "created",
      acpSessionId: "session-123",
    });
    expect(restored.tasks[0].messages[0].streaming).toBe(false);
    expect(restored.tasks[0].messages[0].attachments).toEqual([
      {
        name: "context.md",
        mimeType: "text/markdown",
        size: 512,
        kind: "text",
      },
    ]);
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
          attachments: [
            {
              name: "architecture.png",
              mimeType: "image/png",
              size: 1_024,
              kind: "image" as const,
            },
          ],
        },
      ],
    };

    expect(filterTasks([oauthTask, diffTask], "oauth").map((task) => task.id)).toEqual([
      "oauth",
    ]);
    expect(filterTasks([oauthTask, diffTask], "PATCH").map((task) => task.id)).toEqual([
      "diff",
    ]);
    expect(
      filterTasks([oauthTask, diffTask], "architecture.png").map(
        (task) => task.id,
      ),
    ).toEqual(["diff"]);
  });

  it("renames and deletes tasks while preserving one active workspace task", () => {
    const workspace = "C:\\work\\app";
    const first = createTask(workspace, {
      id: "first",
      now: new Date("2026-07-21T01:00:00.000Z"),
    });
    const renamed = renameTask(
      {
        version: TASK_STORE_VERSION,
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

  it("creates an honest local branch without reusing the ACP session", () => {
    const source = {
      ...createTask("C:\\work\\app", {
        id: "source",
        now: new Date("2026-07-21T01:00:00.000Z"),
      }),
      title: "Review OAuth",
      acpSessionId: "session-secret",
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          name: "You",
          time: "09:00",
          content: "Check the callback",
        },
      ],
    };
    const branch = createTaskBranch(source, {
      id: "branch",
      now: new Date("2026-07-21T02:00:00.000Z"),
    });

    expect(branch).toMatchObject({
      id: "branch",
      title: "Review OAuth (branch)",
      origin: "branch",
      sourceTaskId: "source",
      acpSessionId: null,
      status: "idle",
    });
    expect(branch.messages[0]).toMatchObject(source.messages[0]);
    expect(branch.messages[0].streaming).toBe(false);
    expect(branch.messages).not.toBe(source.messages);
  });

  it("archives, replaces, and restores tasks without selecting archived data", () => {
    const workspace = "C:\\work\\app";
    const source = createTask(workspace, {
      id: "source",
      now: new Date("2026-07-21T01:00:00.000Z"),
    });
    const initial = {
      ...emptyTaskStore(),
      tasks: [source],
      activeTaskIds: { [workspaceStorageKey(workspace)]: source.id },
    };
    const archived = archiveTask(initial, source.id, workspace, {
      replacementId: "replacement",
      now: new Date("2026-07-21T02:00:00.000Z"),
    });

    expect(archived.tasks.find((task) => task.id === "source")?.archivedAt).toBe(
      "2026-07-21T02:00:00.000Z",
    );
    expect(archived.activeTaskIds[workspaceStorageKey(workspace)]).toBe(
      "replacement",
    );

    const restored = restoreTask(archived, source.id, workspace, {
      now: new Date("2026-07-21T03:00:00.000Z"),
    });
    expect(restored.tasks.find((task) => task.id === "source")?.archivedAt).toBeNull();
    expect(restored.activeTaskIds[workspaceStorageKey(workspace)]).toBe("source");
  });

  it("exports and imports transcripts without credentials or attachment contents", () => {
    const source = {
      ...createTask("C:\\private\\source", {
        id: "source",
        now: new Date("2026-07-21T01:00:00.000Z"),
      }),
      title: "Portable review",
      acpSessionId: "session-must-not-export",
      runtimeProfile: {
        modelId: "grok-4.5",
        reasoningEffort: "medium",
      },
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          name: "You",
          time: "09:00",
          content: "Review this file",
          attachments: [
            {
              name: "context.md",
              mimeType: "text/markdown",
              size: 128,
              kind: "text" as const,
              data: "attachment-body-must-not-export",
            },
          ],
        },
      ],
    };
    const exported = serializeTaskExport(source, {
      now: new Date("2026-07-21T02:00:00.000Z"),
    });
    expect(exported).not.toContain("session-must-not-export");
    expect(exported).not.toContain("attachment-body-must-not-export");

    const imported = parseTaskImport(exported, "C:\\current\\workspace", {
      id: "imported",
      now: new Date("2026-07-21T03:00:00.000Z"),
    });
    expect(imported).toMatchObject({
      id: "imported",
      workspacePath: "C:\\current\\workspace",
      origin: "import",
      acpSessionId: null,
      archivedAt: null,
      runtimeProfile: {
        modelId: "grok-4.5",
        reasoningEffort: "medium",
      },
    });
    expect(imported.messages[0].attachments?.[0]).toEqual({
      name: "context.md",
      mimeType: "text/markdown",
      size: 128,
      kind: "text",
    });
  });

  it("rejects unsupported, malformed, and oversized task imports", () => {
    expect(() => parseTaskImport("{}", "C:\\work\\app")).toThrow(
      "supported GrokDesk task export",
    );
    expect(() =>
      parseTaskImport("x".repeat(MAX_TASK_EXCHANGE_BYTES + 1), "C:\\work\\app"),
    ).toThrow("8 MiB");

    const valid = JSON.parse(
      serializeTaskExport(createTask("C:\\work\\app")),
    );
    valid.task.messages = [{ id: "bad", role: "user", content: 42 }];
    expect(() =>
      parseTaskImport(JSON.stringify(valid), "C:\\work\\app"),
    ).toThrow("messages");

    const duplicateIds = JSON.parse(
      serializeTaskExport(createTask("C:\\work\\app")),
    );
    duplicateIds.task.plan = [
      { id: "same", title: "One", detail: "", status: "pending" },
      { id: "same", title: "Two", detail: "", status: "pending" },
    ];
    expect(() =>
      parseTaskImport(JSON.stringify(duplicateIds), "C:\\work\\app"),
    ).toThrow("duplicate entry ID");
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
