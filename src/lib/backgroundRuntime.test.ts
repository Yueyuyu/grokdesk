import { describe, expect, it } from "vitest";
import {
  backgroundTaskCount,
  parseTaskScopedEvent,
} from "./backgroundRuntime";

describe("task-scoped Runtime events", () => {
  it("keeps the task routing key with the official Runtime payload", () => {
    expect(
      parseTaskScopedEvent({
        taskId: "019f7d6f-90cf-7582-a3c2-c979c458d326",
        payload: { sessionUpdate: "agent_message_chunk" },
      }),
    ).toEqual({
      taskId: "019f7d6f-90cf-7582-a3c2-c979c458d326",
      payload: { sessionUpdate: "agent_message_chunk" },
    });
  });

  it("rejects malformed or command-like routing keys", () => {
    expect(parseTaskScopedEvent({ taskId: "--task", payload: {} })).toBeNull();
    expect(parseTaskScopedEvent({ taskId: "task id", payload: {} })).toBeNull();
    expect(parseTaskScopedEvent({ taskId: "task-1" })).toBeNull();
  });
});

describe("background task counts", () => {
  it("excludes the task currently shown in the workspace", () => {
    expect(backgroundTaskCount(["task-a", "task-b"], "task-a")).toBe(1);
    expect(backgroundTaskCount(["task-a", "task-b"], null)).toBe(2);
  });
});
