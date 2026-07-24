import { describe, expect, it } from "vitest";
import type { GrokTask } from "../types";
import { buildLocalActivity } from "./localActivity";

const task = (
  id: string,
  updatedAt: string,
  messages: GrokTask["messages"],
  tools: GrokTask["tools"] = [],
): GrokTask => ({
  id,
  workspacePath: "C:\\project",
  title: `Task ${id}`,
  createdAt: updatedAt,
  updatedAt,
  status: "complete",
  archivedAt: null,
  origin: "created",
  sourceTaskId: null,
  acpSessionId: null,
  runtimeProfile: { modelId: "grok-test", reasoningEffort: null },
  messages,
  plan: [],
  tools,
});

describe("local activity aggregation", () => {
  it("counts only locally saved task activity", () => {
    const now = new Date(2026, 6, 24, 12);
    const active = task(
      "one",
      new Date(2026, 6, 24, 10).toISOString(),
      [
        {
          id: "u1",
          role: "user",
          name: "You",
          time: "10:00",
          createdAt: new Date(2026, 6, 23, 10).toISOString(),
          content: "Hello",
        },
        {
          id: "a1",
          role: "agent",
          name: "Grok Build",
          time: "10:01",
          createdAt: new Date(2026, 6, 23, 10, 1).toISOString(),
          content: "Hi",
        },
      ],
      [
        {
          id: "tool-1",
          action: "Run",
          target: "tests",
          progress: 100,
          status: "complete",
        },
      ],
    );
    const empty = task("empty", new Date(2026, 6, 24, 11).toISOString(), []);

    const snapshot = buildLocalActivity([empty, active], {
      now,
      days: 14,
    });

    expect(snapshot.sessions).toBe(1);
    expect(snapshot.userTurns).toBe(1);
    expect(snapshot.agentTurns).toBe(1);
    expect(snapshot.toolActivities).toBe(1);
    expect(snapshot.activeDays).toBe(1);
    expect(snapshot.recent[0]).toMatchObject({
      id: "one",
      model: "grok-test",
    });
  });

  it("falls back to the task update date for older saved messages", () => {
    const updatedAt = new Date(2026, 6, 24, 10).toISOString();
    const snapshot = buildLocalActivity(
      [
        task("legacy", updatedAt, [
          {
            id: "legacy-user",
            role: "user",
            name: "You",
            time: "10:00",
            content: "Legacy",
          },
        ]),
      ],
      { now: new Date(2026, 6, 24, 12), days: 7 },
    );

    expect(snapshot.days.at(-1)).toMatchObject({
      sessions: 1,
      userTurns: 1,
    });
  });
});
