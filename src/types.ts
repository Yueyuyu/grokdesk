export type ThemePreference = "light" | "dark" | "system";

export type NavigationKey =
  | "tasks"
  | "permissions"
  | "plugins"
  | "mcp"
  | "settings";

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

export interface GrokPluginSummary {
  status: string;
  name: string;
  version: string | null;
  description: string | null;
  marketplace: string | null;
  scope: string | null;
  path: string | null;
  enabled: boolean;
  trusted: boolean | null;
  skillCount: number;
  commandCount: number;
  agentCount: number;
  hookCount: number;
  mcpServerCount: number;
}

export interface GrokPluginCatalog {
  plugins: GrokPluginSummary[];
  marketplaceAvailable: boolean;
  message: string | null;
}

export type McpTransport = "stdio" | "http" | "sse";
export type McpScope = "user" | "project";

export interface GrokMcpServerSummary {
  name: string;
  transport: string;
  scope: string | null;
  endpoint: string | null;
  enabled: boolean;
  status: string | null;
  source: string | null;
  toolCount: number;
}

export interface GrokMcpCatalog {
  servers: GrokMcpServerSummary[];
  message: string | null;
}

export interface AddMcpServerInput {
  name: string;
  transport: McpTransport;
  scope: McpScope;
  target: string;
  args: string[];
}

export interface RuntimeCommandResult {
  message: string;
}

export interface WorkspaceCommandOutput {
  commandId: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

export interface WorkspaceCommandResult {
  commandId: string;
  exitCode: number | null;
  cancelled: boolean;
  durationMs: number;
}

export type PromptAttachmentKind = "image" | "text" | "binary";

export interface PromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}

export interface AcpSessionInfo {
  sessionId: string;
  promptCapabilities: PromptCapabilities;
}

/**
 * 仅在当前发送回合中存在的附件内容。任务历史不会持久化 data 字段。
 */
export interface PromptAttachment {
  name: string;
  mimeType: string;
  size: number;
  kind: PromptAttachmentKind;
  data: string;
}

export interface ChatAttachmentSummary {
  name: string;
  mimeType: string;
  size: number;
  kind: PromptAttachmentKind;
}

export interface ChatEntry {
  id: string;
  role: "user" | "agent";
  name: string;
  time: string;
  content: string;
  attachments?: ChatAttachmentSummary[];
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
export type TaskOrigin = "created" | "branch" | "import";

export interface GrokTask {
  id: string;
  workspacePath: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  archivedAt: string | null;
  origin: TaskOrigin;
  sourceTaskId: string | null;
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
  auditEventId: string;
  title: string;
  description: string;
  options: PermissionOption[];
}

export type AuditEventKind = "permission" | "tool" | "command";

export type AuditEventStatus =
  | "pending"
  | "running"
  | "allowed"
  | "denied"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "stopped"
  | "interrupted";

export interface AuditEvent {
  id: string;
  workspacePath: string;
  taskId: string | null;
  kind: AuditEventKind;
  title: string;
  detail: string;
  status: AuditEventStatus;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  exitCode: number | null;
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
