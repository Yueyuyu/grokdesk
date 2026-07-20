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
  tier: string | null;
  creditUsagePercent: number | null;
  periodEnd: string | null;
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

export interface ChangedFile {
  path: string;
  status: "M" | "A" | "D";
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
