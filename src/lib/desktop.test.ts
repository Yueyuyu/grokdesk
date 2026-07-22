import { describe, expect, it } from "vitest";
import { cancelWorkspaceCommand, runWorkspaceCommand } from "./desktop";

describe("workspace terminal browser boundary", () => {
  it("never simulates workspace command execution in a browser preview", async () => {
    await expect(
      runWorkspaceCommand("C:\\Preview\\workspace", "git status", "terminal-1"),
    ).rejects.toThrow("Workspace terminal is available only");
  });

  it("does not simulate process cancellation outside the desktop app", async () => {
    await expect(cancelWorkspaceCommand("terminal-1")).rejects.toThrow(
      "Workspace terminal is available only",
    );
  });
});
