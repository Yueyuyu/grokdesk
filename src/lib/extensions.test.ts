import { describe, expect, it } from "vitest";
import type { GrokMcpServerSummary, GrokPluginSummary } from "../types";
import {
  filterPlugins,
  isValidMcpName,
  parseMcpArgumentLines,
  pluginComponentLabels,
  resolvedMcpScope,
} from "./extensions";

const plugin = (
  overrides: Partial<GrokPluginSummary> = {},
): GrokPluginSummary => ({
  status: "available",
  name: "cloudflare",
  version: null,
  description: "Cloud platform tools",
  marketplace: "xAI Official",
  scope: null,
  path: null,
  enabled: false,
  trusted: null,
  skillCount: 2,
  commandCount: 1,
  agentCount: 0,
  hookCount: 0,
  mcpServerCount: 1,
  ...overrides,
});

describe("plugin catalog projection", () => {
  it("separates installed plugins from marketplace results", () => {
    const plugins = [plugin(), plugin({ status: "enabled", name: "local-tools" })];
    expect(filterPlugins(plugins, "installed", "").map((item) => item.name)).toEqual([
      "local-tools",
    ]);
    expect(filterPlugins(plugins, "marketplace", "cloud")).toHaveLength(1);
  });

  it("shows only non-empty component counts", () => {
    expect(pluginComponentLabels(plugin())).toEqual([
      "2 skills",
      "1 commands",
      "1 MCP",
    ]);
  });
});

describe("MCP form helpers", () => {
  it("uses one explicit argument per line", () => {
    expect(parseMcpArgumentLines("-y\n@modelcontextprotocol/server-git\n\nC:\\repo")).toEqual([
      "-y",
      "@modelcontextprotocol/server-git",
      "C:\\repo",
    ]);
  });

  it("validates Grok-compatible server names", () => {
    expect(isValidMcpName("project-tools_2")).toBe(true);
    expect(isValidMcpName("project tools")).toBe(false);
    expect(isValidMcpName("-hidden")).toBe(false);
  });

  it("requires a matching workspace for project-scoped removal", () => {
    const server: GrokMcpServerSummary = {
      name: "project-tools",
      transport: "stdio",
      scope: "project",
      endpoint: "npx",
      enabled: true,
      status: null,
      source: null,
      toolCount: 0,
    };
    expect(resolvedMcpScope(server, false)).toBeNull();
    expect(resolvedMcpScope(server, true)).toBe("project");
  });
});
