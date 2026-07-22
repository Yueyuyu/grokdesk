import { describe, expect, it } from "vitest";
import { createTask } from "./tasks";
import { searchTasks } from "./taskSearch";

const makeTask = (
  id: string,
  title: string,
  updatedAt: string,
) => ({
  ...createTask("C:\\work\\app", { id, now: new Date(updatedAt) }),
  title,
  updatedAt,
});

describe("cross-task search", () => {
  it("returns the most recently updated tasks when the query is empty", () => {
    const older = makeTask("older", "Older task", "2026-07-20T09:00:00.000Z");
    const newer = makeTask("newer", "Newer task", "2026-07-21T09:00:00.000Z");

    expect(searchTasks([older, newer], "").map((result) => result.task.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("ranks task-title matches ahead of transcript matches", () => {
    const titleMatch = makeTask("title", "OAuth callback", "2026-07-20T09:00:00.000Z");
    const messageMatch = {
      ...makeTask("message", "Runtime issue", "2026-07-21T09:00:00.000Z"),
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          name: "You",
          time: "10:00",
          content: "Please inspect the OAuth callback",
        },
      ],
    };

    const results = searchTasks([messageMatch, titleMatch], "oauth");
    expect(results.map((result) => result.task.id)).toEqual(["title", "message"]);
    expect(results[0]).toMatchObject({ kind: "title", label: "Task title" });
  });

  it("searches attachments, plans, tools, and archived tasks", () => {
    const task = {
      ...makeTask("complete", "Release work", "2026-07-21T09:00:00.000Z"),
      archivedAt: "2026-07-21T10:00:00.000Z",
      messages: [
        {
          id: "message-1",
          role: "user" as const,
          name: "You",
          time: "10:00",
          content: "Review files",
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
      plan: [
        { id: "plan-1", title: "Run regression suite", detail: "Vitest and Rust", status: "pending" as const },
      ],
      tools: [
        { id: "tool-1", action: "Package desktop", target: "NSIS installer", progress: 10, status: "active" as const },
      ],
    };

    expect(searchTasks([task], "architecture")[0].kind).toBe("attachment");
    expect(searchTasks([task], "regression")[0].kind).toBe("plan");
    expect(searchTasks([task], "NSIS")[0]).toMatchObject({
      kind: "tool",
      task: { id: "complete", archivedAt: "2026-07-21T10:00:00.000Z" },
    });
  });

  it("returns one concise best match per task and respects the limit", () => {
    const tasks = Array.from({ length: 4 }, (_, index) => ({
      ...makeTask(`task-${index}`, `Search task ${index}`, `2026-07-2${index}T09:00:00.000Z`),
      messages: [
        {
          id: `message-${index}`,
          role: "agent" as const,
          name: "Grok Build",
          time: "10:00",
          content: `Search result ${"detail ".repeat(40)}`,
        },
      ],
    }));

    const results = searchTasks(tasks, "search", 2);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.snippet.length <= 118)).toBe(true);
    expect(results.every((result) => !result.snippet.includes("**"))).toBe(true);
  });
});
