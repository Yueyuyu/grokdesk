import type {
  GrokMcpServerSummary,
  GrokPluginSummary,
  McpScope,
} from "../types";

export type PluginCatalogView = "installed" | "marketplace";

export function isInstalledPlugin(plugin: GrokPluginSummary) {
  return plugin.status.toLocaleLowerCase() !== "available";
}

export function filterPlugins(
  plugins: GrokPluginSummary[],
  view: PluginCatalogView,
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  return plugins.filter((plugin) => {
    if (view === "installed" ? !isInstalledPlugin(plugin) : isInstalledPlugin(plugin)) {
      return false;
    }
    if (!normalized) return true;
    return [plugin.name, plugin.description, plugin.marketplace]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

export function pluginComponentLabels(plugin: GrokPluginSummary) {
  return [
    [plugin.skillCount, "skills"],
    [plugin.commandCount, "commands"],
    [plugin.agentCount, "agents"],
    [plugin.hookCount, "hooks"],
    [plugin.mcpServerCount, "MCP"],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${count} ${label}`);
}

export function parseMcpArgumentLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isValidMcpName(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.trim());
}

export function resolvedMcpScope(
  server: GrokMcpServerSummary,
  workspaceReady: boolean,
): McpScope | null {
  const scope = server.scope?.toLocaleLowerCase();
  if (scope === "user") return "user";
  if (scope === "project") return workspaceReady ? "project" : null;
  return null;
}
