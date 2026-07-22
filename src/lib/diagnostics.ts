import type {
  DiagnosticReport,
  DiagnosticStatus,
} from "../types";

export const diagnosticStatusLabels: Record<DiagnosticStatus, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  blocked: "Blocked",
  info: "Optional",
};

export function getDiagnosticCounts(report: DiagnosticReport | null) {
  const counts: Record<DiagnosticStatus, number> = {
    healthy: 0,
    attention: 0,
    blocked: 0,
    info: 0,
  };
  report?.checks.forEach((check) => {
    counts[check.status] += 1;
  });
  return counts;
}

export function getOverallDiagnosticStatus(
  report: DiagnosticReport | null,
): DiagnosticStatus {
  if (!report) return "info";
  if (report.checks.some((check) => check.status === "blocked")) {
    return "blocked";
  }
  if (report.checks.some((check) => check.status === "attention")) {
    return "attention";
  }
  return "healthy";
}

const redactUrlQuery = (value: string) => {
  try {
    const url = new URL(value);
    if (!url.search && !url.hash) return value;
    return `${url.origin}${url.pathname}?[redacted]`;
  } catch {
    return "[url redacted]";
  }
};

export function sanitizeDiagnosticText(value: string, workspacePath = "") {
  let sanitized = value;
  const workspace = workspacePath.trim();
  if (workspace) {
    sanitized = sanitized.replaceAll(workspace, "[workspace]");
    sanitized = sanitized.replaceAll(
      workspace.replaceAll("\\", "/"),
      "[workspace]",
    );
  }

  sanitized = sanitized
    .replace(
      /((?:authorization|proxy-authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|secret|cookie)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/\bbearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s<>)]+/gi, redactUrlQuery)
    .replace(
      /\b[a-z]:\\(?:[^\\\r\n:*?"<>|]+\\)*[^\\\r\n:*?"<>|]*/gi,
      "[path]",
    )
    .replace(/\/(?:Users|home)\/[^\s/]+(?:\/[^\s]*)?/g, "[path]")
    .replace(
      /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi,
      "[email]",
    );

  return sanitized;
}

export function formatDiagnosticReport(
  report: DiagnosticReport,
  generatedAt: Date,
  workspacePath = "",
) {
  const counts = getDiagnosticCounts(report);
  const overall = getOverallDiagnosticStatus(report);
  const lines = [
    "# GrokDesk diagnostics report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "Privacy: This sanitized report excludes prompts, responses, terminal output, attachment contents, absolute paths, account identifiers, OAuth tokens, cookies, MCP names, endpoints, and headers.",
    "",
    "## Environment",
    "",
    `- GrokDesk: v${report.appVersion}`,
    `- Platform: ${report.platform}`,
    `- Official Runtime: ${report.runtimeVersion ?? "Not detected"}`,
    `- Workspace selected: ${report.workspaceSelected ? "Yes" : "No"}`,
    "",
    "## Summary",
    "",
    `- Overall: ${diagnosticStatusLabels[overall]}`,
    `- Healthy: ${counts.healthy}`,
    `- Needs attention: ${counts.attention}`,
    `- Blocked: ${counts.blocked}`,
    `- Optional: ${counts.info}`,
    "",
    "## Checks",
    "",
  ];

  report.checks.forEach((check) => {
    lines.push(
      `### ${diagnosticStatusLabels[check.status]} — ${check.title}`,
      "",
      `- Category: ${check.category}`,
      `- Summary: ${check.summary}`,
      `- Detail: ${check.detail}`,
    );
    if (check.action) lines.push(`- Suggested action: ${check.action.label}`);
    lines.push("");
  });

  return sanitizeDiagnosticText(lines.join("\n"), workspacePath);
}
