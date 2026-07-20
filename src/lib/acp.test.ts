import { describe, expect, it } from "vitest";
import { normalizeSessionUpdate, planFromUpdate, toolFromUpdate } from "./acp";

describe("ACP update projection", () => {
  it("unwraps a session/update event envelope", () => {
    const update = normalizeSessionUpdate({
      params: {
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { text: "hello" },
        },
      },
    });

    expect(update?.content?.text).toBe("hello");
  });

  it("maps ACP plans into UI plan rows", () => {
    const plan = planFromUpdate({
      sessionUpdate: "plan",
      entries: [
        { content: "Inspect auth", status: "completed" },
        { content: "Rotate token", status: "in_progress" },
      ],
    });

    expect(plan?.map((step) => step.status)).toEqual(["complete", "active"]);
  });

  it("maps a completed tool update", () => {
    const tool = toolFromUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-7",
      title: "Run tests",
      status: "completed",
    });

    expect(tool).toMatchObject({ id: "tool-7", progress: 100, status: "complete" });
  });
});
