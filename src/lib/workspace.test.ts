import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPreviewWorkspaceAction,
  getPreviewWorkspaceDiff,
  parseUnifiedDiff,
  resetPreviewWorkspaceSimulation,
} from "./workspace";

describe("workspace diff projection", () => {
  it("tracks line numbers across a unified diff hunk", () => {
    const lines = parseUnifiedDiff(
      [
        "@@ -4,2 +4,3 @@",
        " unchanged",
        "-before",
        "+after",
        "+extra",
      ].join("\n"),
    );

    expect(lines).toEqual([
      { kind: "hunk", content: "@@ -4,2 +4,3 @@" },
      { kind: "context", oldNumber: 4, newNumber: 4, content: "unchanged" },
      { kind: "remove", oldNumber: 5, content: "before" },
      { kind: "add", newNumber: 5, content: "after" },
      { kind: "add", newNumber: 6, content: "extra" },
    ]);
  });

  it("keeps file headers as unnumbered context", () => {
    const lines = parseUnifiedDiff("--- a/file.ts\n+++ b/file.ts\n");
    expect(lines.slice(0, 2)).toEqual([
      { kind: "context", content: "--- a/file.ts" },
      { kind: "context", content: "+++ b/file.ts" },
    ]);
  });
});

describe("development workspace preview", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { search: "?workspacePreview=changes" },
    });
    resetPreviewWorkspaceSimulation();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stages, unstages, and discards only the selected preview file", () => {
    const staged = applyPreviewWorkspaceAction(
      "stage",
      "C:\\Preview\\grokdesk-sample",
      "README.md",
    );
    expect(staged.changes.find((change) => change.path === "README.md")).toMatchObject({
      statusCode: "A",
      staged: true,
      unstaged: false,
    });

    const unstaged = applyPreviewWorkspaceAction(
      "unstage",
      "C:\\Preview\\grokdesk-sample",
      "README.md",
    );
    expect(unstaged.changes.find((change) => change.path === "README.md")).toMatchObject({
      statusCode: "?",
      staged: false,
      unstaged: true,
    });

    const discarded = applyPreviewWorkspaceAction(
      "discard",
      "C:\\Preview\\grokdesk-sample",
      "README.md",
    );
    expect(discarded.changes.map((change) => change.path)).toEqual([
      "src/workspace.ts",
    ]);
  });

  it("returns a clearly simulated diff for browser QA", () => {
    expect(getPreviewWorkspaceDiff("src/workspace.ts").patch).toContain(
      "reviewedAt",
    );
  });
});
