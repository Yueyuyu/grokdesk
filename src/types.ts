export type ThemePreference = "light" | "dark" | "system";

export type NavigationKey = "tasks" | "plugins" | "mcp" | "settings";

export type InspectorTab = "changes" | "terminal" | "context";

export type AuthenticationState =
  | "verified"
  | "configured"
  | "missing"
  | "expired";

export interface RuntimeStatus {
  available: boolean;
  authenticationState: AuthenticationState;
  executablePath: string | null;
  version: string | null;
  authFilePath: string | null;
}

export interface GrokSubscription {
  availability: "available" | "unsupported";
  tier: string | null;
  creditUsagePercent: number | null;
  periodEnd: string | null;
  message: string | null;
}

export interface ChatEntry {
  id: string;
  role: "user" | "agent";
  name: string;
  time: string;
  content: string;
  streaming?: boolean;
}

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  status: "complete" | "active" | "pending";
}

export interface ToolActivity {
  id: string;
  action: string;
  target: string;
  progress: number;
  status: "complete" | "active" | "pending" | "failed";
}

export type TaskStatus = "idle" | "running" | "complete" | "error";

export interface GrokTask {
  id: string;
  workspacePath: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  acpSessionId: string | null;
  messages: ChatEntry[];
  plan: PlanStep[];
  tools: ToolActivity[];
}

export interface ChangedFile {
  path: string;
  status: "M" | "A" | "D";
}

export type WorkspaceSnapshotMode =
  | "git"
  | "not_git"
  | "unselected"
  | "preview_unavailable"
  | "preview_simulation";

export interface WorkspaceChange {
  path: string;
  originalPath: string | null;
  statusCode: "M" | "A" | "D" | "R" | "C" | "T" | "?" | "!";
  staged: boolean;
  unstaged: boolean;
  indexStatus: string | null;
  worktreeStatus: string | null;
}

export interface WorkspaceSnapshot {
  mode: WorkspaceSnapshotMode;
  repositoryRoot: string | null;
  branch: string | null;
  changes: WorkspaceChange[];
  message: string | null;
}

export interface WorkspaceDiff {
  path: string;
  statusCode: WorkspaceChange["statusCode"];
  staged: boolean;
  unstaged: boolean;
  patch: string;
  binary: boolean;
  truncated: boolean;
}

export interface DiffLine {
  oldNumber?: number;
  newNumber?: number;
  kind: "context" | "add" | "remove" | "hunk";
  content: string;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind?: string;
}

export interface PermissionRequest {
  id: number;
  title: string;
  description: string;
  options: PermissionOption[];
}

export interface AcpSessionUpdate {
  sessionUpdate?: string;
  content?: { text?: string };
  title?: string;
  toolCallId?: string;
  status?: string;
  entries?: Array<{
    content?: string;
    priority?: "high" | "medium" | "low";
    status?: string;
  }>;
  [key: string]: unknown;
}
