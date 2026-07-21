import type {
  DiffLine,
  WorkspaceChange,
  WorkspaceDiff,
  WorkspaceSnapshot,
  WorkspaceSnapshotMode,
} from "../types";

const previewPatchByPath: Record<string, string> = {
  "src/workspace.ts": [
    "diff --git a/src/workspace.ts b/src/workspace.ts",
    "index 18d31d2..5d91c63 100644",
    "--- a/src/workspace.ts",
    "+++ b/src/workspace.ts",
    "@@ -8,4 +8,8 @@ export function inspectWorkspace() {",
    "   const status = readGitStatus();",
    "-  return status.files;",
    "+  return {",
    "+    branch: status.branch,",
    "+    files: status.files,",
    "+    reviewedAt: new Date().toISOString(),",
    "+  };",
    " }",
    "",
  ].join("\n"),
  "README.md": [
    "diff --git a/README.md b/README.md",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/README.md",
    "@@ -0,0 +1,2 @@",
    "+# Workspace review",
    "+This is simulated browser-preview data.",
    "",
  ].join("\n"),
};

const initialPreviewChanges: WorkspaceChange[] = [
  {
    path: "src/workspace.ts",
    originalPath: null,
    statusCode: "M",
    staged: false,
    unstaged: true,
    indexStatus: null,
    worktreeStatus: "M",
  },
  {
    path: "README.md",
    originalPath: null,
    statusCode: "?",
    staged: false,
    unstaged: true,
    indexStatus: null,
    worktreeStatus: null,
  },
];

let previewChanges = initialPreviewChanges.map((change) => ({ ...change }));

export function isWorkspaceSelected(workspacePath: string) {
  const normalized = workspacePath.trim();
  return Boolean(normalized && normalized !== ".");
}

export function emptyWorkspaceSnapshot(
  mode: WorkspaceSnapshotMode,
  message: string,
): WorkspaceSnapshot {
  return {
    mode,
    repositoryRoot: null,
    branch: null,
    changes: [],
    message,
  };
}

export function previewWorkspaceSimulationEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("workspacePreview") === "changes";
}

export function getPreviewWorkspaceSnapshot(
  workspacePath: string,
): WorkspaceSnapshot {
  if (!isWorkspaceSelected(workspacePath)) {
    return emptyWorkspaceSnapshot(
      "unselected",
      "Choose a simulated project folder to preview the workspace flow.",
    );
  }
  if (!previewWorkspaceSimulationEnabled()) {
    return emptyWorkspaceSnapshot(
      "preview_unavailable",
      "Browser preview cannot inspect local files. Install GrokDesk to review real Git changes.",
    );
  }

  return {
    mode: "preview_simulation",
    repositoryRoot: "C:\\Preview\\grokdesk-sample",
    branch: "preview/workspace-review",
    changes: previewChanges.map((change) => ({ ...change })),
    message: "Simulated preview only — no local files or Git index are changed.",
  };
}

export function getPreviewWorkspaceDiff(path: string): WorkspaceDiff {
  const change = previewChanges.find((item) => item.path === path);
  if (!change) {
    throw new Error(`Preview change \`${path}\` no longer exists.`);
  }
  return {
    path,
    statusCode: change.statusCode,
    staged: change.staged,
    unstaged: change.unstaged,
    patch: previewPatchByPath[path] ?? "",
    binary: false,
    truncated: false,
  };
}

export function applyPreviewWorkspaceAction(
  action: "stage" | "unstage" | "discard",
  workspacePath: string,
  path: string,
): WorkspaceSnapshot {
  if (!previewWorkspaceSimulationEnabled()) {
    throw new Error("Workspace actions are unavailable in browser preview.");
  }

  if (action === "discard") {
    previewChanges = previewChanges.filter((change) => change.path !== path);
  } else {
    previewChanges = previewChanges.map((change) => {
      if (change.path !== path) return change;
      if (action === "stage") {
        return {
          ...change,
          statusCode: change.statusCode === "?" ? "A" : change.statusCode,
          staged: true,
          unstaged: false,
          indexStatus: change.statusCode === "?" ? "A" : change.statusCode,
          worktreeStatus: null,
        };
      }
      return {
        ...change,
        statusCode: change.indexStatus === "A" ? "?" : change.statusCode,
        staged: false,
        unstaged: true,
        indexStatus: null,
        worktreeStatus: change.indexStatus === "A" ? null : change.statusCode,
      };
    });
  }

  return getPreviewWorkspaceSnapshot(workspacePath);
}

export function resetPreviewWorkspaceSimulation() {
  previewChanges = initialPreviewChanges.map((change) => ({ ...change }));
}

export function parseUnifiedDiff(patch: string): DiffLine[] {
  if (!patch) return [];

  const lines: DiffLine[] = [];
  let oldNumber: number | undefined;
  let newNumber: number | undefined;

  for (const rawLine of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      lines.push({ kind: "hunk", content: rawLine });
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      lines.push({ kind: "add", newNumber, content: rawLine.slice(1) });
      if (newNumber !== undefined) newNumber += 1;
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      lines.push({ kind: "remove", oldNumber, content: rawLine.slice(1) });
      if (oldNumber !== undefined) oldNumber += 1;
      continue;
    }
    if (rawLine.startsWith(" ") && oldNumber !== undefined && newNumber !== undefined) {
      lines.push({
        kind: "context",
        oldNumber,
        newNumber,
        content: rawLine.slice(1),
      });
      oldNumber += 1;
      newNumber += 1;
      continue;
    }

    lines.push({ kind: "context", content: rawLine });
  }

  return lines;
}
