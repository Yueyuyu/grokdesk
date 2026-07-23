import { describe, expect, it } from "vitest";
import type { DiagnosticReport } from "../types";
import {
  formatDiagnosticReport,
  getDiagnosticCounts,
  getOverallDiagnosticStatus,
  sanitizeDiagnosticText,
} from "./diagnostics";

const report = (statuses: DiagnosticReport["checks"][number]["status"][]) =>
  ({
    appVersion: "0.2.5",
    platform: "windows / x86_64",
    runtimeVersion: "grok 0.2.93",
    workspaceSelected: true,
    checks: statuses.map((status, index) => ({
      id: `check-${index}`,
      category: "runtime" as const,
      title: `Check ${index}`,
      status,
      summary: "Safe summary",
      detail: "Safe detail",
      action: null,
    })),
  }) satisfies DiagnosticReport;

describe("diagnostic summary", () => {
  it("prioritizes blocked checks over warnings and healthy checks", () => {
    const value = report(["healthy", "attention", "blocked", "info"]);
    expect(getOverallDiagnosticStatus(value)).toBe("blocked");
    expect(getDiagnosticCounts(value)).toEqual({
      healthy: 1,
      attention: 1,
      blocked: 1,
      info: 1,
    });
  });

  it("treats optional information as healthy when nothing needs action", () => {
    expect(getOverallDiagnosticStatus(report(["healthy", "info"]))).toBe(
      "healthy",
    );
  });
});

describe("sanitized diagnostic export", () => {
  it("redacts credentials, account data, paths, and URL queries", () => {
    const unsafe =
      "C:\\Users\\Yueyu\\project token=abc123 user@example.com https://auth.x.ai/oauth?code=secret Bearer xyz.123";
    const sanitized = sanitizeDiagnosticText(unsafe);
    expect(sanitized).not.toContain("Yueyu");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).not.toContain("user@example.com");
    expect(sanitized).not.toContain("code=secret");
    expect(sanitized).not.toContain("xyz.123");
    expect(sanitized).toContain("[redacted]");
  });

  it("formats a useful report without embedding the workspace path", () => {
    const value = report(["healthy", "attention"]);
    value.checks[1].detail = "Inspect C:\\Clients\\Secret Project before retrying.";
    const output = formatDiagnosticReport(
      value,
      new Date("2026-07-22T08:00:00.000Z"),
      "C:\\Clients\\Secret Project",
    );
    expect(output).toContain("# GrokDesk diagnostics report");
    expect(output).toContain("Needs attention: 1");
    expect(output).not.toContain("Secret Project");
    expect(output).toContain("[workspace]");
  });
});
