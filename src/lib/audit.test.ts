import { describe, expect, it } from "vitest";
import {
  AUDIT_STORE_VERSION,
  clearWorkspaceAudit,
  emptyAuditStore,
  parseAuditStore,
  sanitizeAuditText,
  serializeAuditStore,
  upsertAuditEvent,
} from "./audit";

const now = new Date("2026-07-22T10:00:00.000Z");

describe("local execution audit", () => {
  it("redacts common credentials before persistence", () => {
    const command =
      "deploy --token secret-value OPENAI_API_KEY=sk-example123456 Authorization: Bearer abcdefghijklmnop";
    const sanitized = sanitizeAuditText(command);

    expect(sanitized).not.toContain("secret-value");
    expect(sanitized).not.toContain("sk-example123456");
    expect(sanitized).not.toContain("abcdefghijklmnop");
    expect(sanitized.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("upserts one lifecycle record while preserving its creation time", () => {
    const pending = upsertAuditEvent(
      emptyAuditStore(),
      {
        id: "permission-session-1",
        workspacePath: "C:\\work\\app",
        taskId: "task-1",
        kind: "permission",
        title: "Run workspace command",
        detail: "Waiting for your decision",
        status: "pending",
      },
      now,
    );
    const resolvedAt = new Date("2026-07-22T10:01:00.000Z");
    const allowed = upsertAuditEvent(
      pending,
      {
        id: "permission-session-1",
        workspacePath: "C:\\work\\app",
        taskId: "task-1",
        kind: "permission",
        title: "Run workspace command",
        detail: "Allow once",
        status: "allowed",
      },
      resolvedAt,
    );

    expect(allowed.events).toHaveLength(1);
    expect(allowed.events[0]).toMatchObject({
      status: "allowed",
      createdAt: now.toISOString(),
      updatedAt: resolvedAt.toISOString(),
    });
  });

  it("marks unfinished events as interrupted after restart", () => {
    const running = upsertAuditEvent(
      emptyAuditStore(),
      {
        id: "command-1",
        workspacePath: "C:\\work\\app",
        kind: "command",
        title: "npm test",
        detail: "Workspace command started",
        status: "running",
      },
      now,
    );

    const restored = parseAuditStore(serializeAuditStore(running), now);
    expect(restored.events[0].status).toBe("interrupted");
  });

  it("drops expired data and clears only the selected workspace", () => {
    const oldEvent = {
      id: "old",
      workspacePath: "C:\\work\\old",
      taskId: null,
      kind: "tool",
      title: "Old tool",
      detail: "Expired",
      status: "succeeded",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
      durationMs: null,
      exitCode: null,
    } as const;
    let snapshot = parseAuditStore(
      JSON.stringify({ version: AUDIT_STORE_VERSION, events: [oldEvent] }),
      now,
    );
    expect(snapshot.events).toHaveLength(0);

    snapshot = upsertAuditEvent(
      snapshot,
      {
        id: "one",
        workspacePath: "C:\\work\\one",
        kind: "tool",
        title: "Read",
        detail: "src/App.tsx",
        status: "succeeded",
      },
      now,
    );
    snapshot = upsertAuditEvent(
      snapshot,
      {
        id: "two",
        workspacePath: "C:\\work\\two",
        kind: "command",
        title: "npm test",
        detail: "Exit code 0",
        status: "succeeded",
      },
      now,
    );

    const cleared = clearWorkspaceAudit(snapshot, "c:/work/one/");
    expect(cleared.events.map((event) => event.id)).toEqual(["two"]);
  });
});
