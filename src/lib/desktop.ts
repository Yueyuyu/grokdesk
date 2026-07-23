import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AcpSessionInfo,
  AddMcpServerInput,
  DiagnosticReport,
  GrokMcpCatalog,
  GrokPluginCatalog,
  GrokSubscription,
  McpScope,
  PromptAttachment,
  RuntimeCommandResult,
  RuntimeContextSnapshot,
  RuntimeStatus,
  WorkspaceCommandResult,
  WorkspaceDiff,
  WorkspaceSnapshot,
} from "../types";
import {
  applyPreviewWorkspaceAction,
  getPreviewWorkspaceDiff,
  getPreviewWorkspaceSnapshot,
} from "./workspace";
import { MAX_TASK_EXCHANGE_BYTES } from "./taskExchange";

const PREVIEW_RUNTIME_KEY = "grokdesk.preview.runtime-installed";
const PREVIEW_AUTH_KEY = "grokdesk.preview.oauth-complete";
const SUBSCRIPTION_URL = "https://grok.com/supergrok?referrer=grok-build";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const desktopOnlyRuntimeFeature = (feature: string): never => {
  throw new Error(
    `${feature} is available only in the installed GrokDesk desktop app.`,
  );
};

const runtimeWorkspace = (cwd: string) => cwd.trim() || null;

export interface OAuthResult {
  succeeded: boolean;
  message: string | null;
}

function previewRuntimeStatus(): RuntimeStatus {
  const available = localStorage.getItem(PREVIEW_RUNTIME_KEY) === "true";
  const authenticated = localStorage.getItem(PREVIEW_AUTH_KEY) === "true";

  return {
    available,
    authenticationState: authenticated ? "verified" : "missing",
    executablePath: available ? "%USERPROFILE%\\.grok\\bin\\grok.exe" : null,
    version: available ? "grok 0.2.93 · preview simulation" : null,
    authFilePath: authenticated ? "%USERPROFILE%\\.grok\\auth.json" : null,
  };
}

export const isDesktopRuntime = () => isTauri();

export async function probeRuntime(): Promise<RuntimeStatus> {
  if (!isDesktopRuntime()) {
    return previewRuntimeStatus();
  }

  return invoke<RuntimeStatus>("probe_runtime");
}

export async function runDiagnostics(
  cwd: string,
  acpConnected: boolean,
): Promise<DiagnosticReport> {
  if (!isDesktopRuntime()) {
    desktopOnlyRuntimeFeature("Diagnostics");
  }
  return invoke<DiagnosticReport>("run_diagnostics", {
    cwd: runtimeWorkspace(cwd),
    acpConnected,
  });
}

export async function inspectGrokContext(
  cwd: string,
): Promise<RuntimeContextSnapshot> {
  if (!isDesktopRuntime()) {
    desktopOnlyRuntimeFeature("Runtime context inspection");
  }
  return invoke<RuntimeContextSnapshot>("inspect_grok_context", { cwd });
}

export async function writeDiagnosticReportFile(
  content: string,
): Promise<boolean> {
  if (!isDesktopRuntime()) {
    desktopOnlyRuntimeFeature("Diagnostic report export");
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const selected = await save({
    defaultPath: `GrokDesk-diagnostics-${timestamp}.md`,
    filters: [{ name: "Sanitized diagnostics report", extensions: ["md"] }],
  });
  if (typeof selected !== "string") return false;
  const path = selected.toLocaleLowerCase().endsWith(".md")
    ? selected
    : `${selected}.md`;
  await invoke("write_diagnostic_report", { path, content });
  return true;
}

export async function startAcpSession(
  cwd: string,
  resumeSessionId: string | null = null,
): Promise<AcpSessionInfo> {
  if (!isDesktopRuntime()) {
    return {
      sessionId:
        resumeSessionId ??
        `browser-preview-${
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Date.now()
        }`,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
    };
  }
  return invoke<AcpSessionInfo>("start_acp_session", { cwd, resumeSessionId });
}

export async function sendAcpPrompt(
  text: string,
  attachments: PromptAttachment[] = [],
): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("send_acp_prompt", { text, attachments });
}

export async function cancelAcpTurn(): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("cancel_acp_turn");
}

export async function stopAcpSession(): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("stop_acp_session");
}

export async function launchOAuth(): Promise<OAuthResult> {
  if (!isDesktopRuntime()) {
    if (localStorage.getItem(PREVIEW_RUNTIME_KEY) !== "true") {
      throw new Error("Install the simulated Grok Runtime before previewing OAuth.");
    }
    await wait(450);
    localStorage.setItem(PREVIEW_AUTH_KEY, "true");
    return { succeeded: true, message: null };
  }
  return invoke<OAuthResult>("start_oauth_login");
}

export async function installGrokCli(): Promise<RuntimeStatus> {
  if (!isDesktopRuntime()) {
    await wait(650);
    localStorage.setItem(PREVIEW_RUNTIME_KEY, "true");
    return previewRuntimeStatus();
  }
  return invoke<RuntimeStatus>("install_grok_cli");
}

export async function fetchGrokSubscription(): Promise<GrokSubscription> {
  if (!isDesktopRuntime()) {
    if (localStorage.getItem(PREVIEW_AUTH_KEY) !== "true") {
      throw new Error("Complete the simulated OAuth step before checking a subscription.");
    }
    await wait(350);
    return {
      availability: "unsupported",
      tier: null,
      creditUsagePercent: null,
      periodEnd: null,
      message:
        "Browser preview only: no real Grok account, subscription, or quota data is available.",
    };
  }
  return invoke<GrokSubscription>("fetch_grok_subscription");
}

export async function openGrokSubscription(): Promise<void> {
  if (!isDesktopRuntime()) {
    window.open(SUBSCRIPTION_URL, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_grok_subscription");
}

export async function listGrokPlugins(cwd: string): Promise<GrokPluginCatalog> {
  if (!isDesktopRuntime()) {
    return {
      plugins: [],
      marketplaceAvailable: false,
      message:
        "浏览器预览不会读取或模拟本机插件；安装版会直接显示官方 Grok Runtime 的真实结果。",
    };
  }
  return invoke<GrokPluginCatalog>("list_grok_plugins", {
    cwd: runtimeWorkspace(cwd),
  });
}

export async function installGrokPlugin(
  cwd: string,
  source: string,
  trusted: boolean,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Plugin installation");
  return invoke<RuntimeCommandResult>("install_grok_plugin", {
    cwd: runtimeWorkspace(cwd),
    source,
    trusted,
  });
}

export async function setGrokPluginEnabled(
  cwd: string,
  name: string,
  enabled: boolean,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Plugin management");
  return invoke<RuntimeCommandResult>("set_grok_plugin_enabled", {
    cwd: runtimeWorkspace(cwd),
    name,
    enabled,
  });
}

export async function updateGrokPlugin(
  cwd: string,
  name: string,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Plugin updates");
  return invoke<RuntimeCommandResult>("update_grok_plugin", {
    cwd: runtimeWorkspace(cwd),
    name,
  });
}

export async function uninstallGrokPlugin(
  cwd: string,
  name: string,
  keepData: boolean,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Plugin removal");
  return invoke<RuntimeCommandResult>("uninstall_grok_plugin", {
    cwd: runtimeWorkspace(cwd),
    name,
    keepData,
  });
}

export async function refreshGrokPluginMarketplaces(
  cwd: string,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Marketplace refresh");
  return invoke<RuntimeCommandResult>("refresh_grok_plugin_marketplaces", {
    cwd: runtimeWorkspace(cwd),
  });
}

export async function listGrokMcpServers(cwd: string): Promise<GrokMcpCatalog> {
  if (!isDesktopRuntime()) {
    return {
      servers: [],
      message:
        "浏览器预览不会读取或模拟本机 MCP 配置；安装版会直接显示官方 Grok Runtime 的真实结果。",
    };
  }
  return invoke<GrokMcpCatalog>("list_grok_mcp_servers", {
    cwd: runtimeWorkspace(cwd),
  });
}

export async function addGrokMcpServer(
  cwd: string,
  input: AddMcpServerInput,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("MCP configuration");
  return invoke<RuntimeCommandResult>("add_grok_mcp_server", {
    cwd: runtimeWorkspace(cwd),
    input,
  });
}

export async function removeGrokMcpServer(
  cwd: string,
  name: string,
  scope: McpScope,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("MCP configuration");
  return invoke<RuntimeCommandResult>("remove_grok_mcp_server", {
    cwd: runtimeWorkspace(cwd),
    name,
    scope,
  });
}

export async function diagnoseGrokMcpServer(
  cwd: string,
  name: string,
): Promise<RuntimeCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("MCP diagnostics");
  return invoke<RuntimeCommandResult>("diagnose_grok_mcp_server", {
    cwd: runtimeWorkspace(cwd),
    name,
  });
}

export async function answerClientRequest(id: number, result: unknown): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("respond_to_client_request", { id, result });
}

export async function chooseWorkspace(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    await wait(180);
    return "C:\\Preview\\grokdesk-sample";
  }
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

const browserTaskFile = () =>
  new Promise<string | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > MAX_TASK_EXCHANGE_BYTES) {
          reject(new Error("The selected task file exceeds the 8 MiB safety limit."));
          return;
        }
        file.text().then(resolve, reject);
      },
      { once: true },
    );
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });

export async function readTaskExchangeFile(): Promise<string | null> {
  if (!isDesktopRuntime()) return browserTaskFile();
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "GrokDesk task export", extensions: ["json"] }],
  });
  if (typeof selected !== "string") return null;
  return invoke<string>("read_task_exchange_file", { path: selected });
}

const safeTaskFileName = (title: string) => {
  const normalized = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${normalized || "grokdesk-task"}.grokdesk-task.json`;
};

export async function writeTaskExchangeFile(
  title: string,
  content: string,
): Promise<boolean> {
  const fileName = safeTaskFileName(title);
  if (!isDesktopRuntime()) {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }
  const selected = await save({
    defaultPath: fileName,
    filters: [{ name: "GrokDesk task export", extensions: ["json"] }],
  });
  if (typeof selected !== "string") return false;
  const path = selected.toLocaleLowerCase().endsWith(".json")
    ? selected
    : `${selected}.json`;
  await invoke("write_task_exchange_file", { path, content });
  return true;
}

export async function inspectWorkspace(cwd: string): Promise<WorkspaceSnapshot> {
  if (!isDesktopRuntime()) {
    return getPreviewWorkspaceSnapshot(cwd);
  }
  return invoke<WorkspaceSnapshot>("inspect_workspace", { cwd });
}

export async function getWorkspaceDiff(
  cwd: string,
  path: string,
): Promise<WorkspaceDiff> {
  if (!isDesktopRuntime()) {
    return getPreviewWorkspaceDiff(path);
  }
  return invoke<WorkspaceDiff>("get_workspace_diff", { cwd, path });
}

export async function stageWorkspaceChange(
  cwd: string,
  path: string,
): Promise<WorkspaceSnapshot> {
  if (!isDesktopRuntime()) {
    return applyPreviewWorkspaceAction("stage", cwd, path);
  }
  return invoke<WorkspaceSnapshot>("stage_workspace_change", { cwd, path });
}

export async function unstageWorkspaceChange(
  cwd: string,
  path: string,
): Promise<WorkspaceSnapshot> {
  if (!isDesktopRuntime()) {
    return applyPreviewWorkspaceAction("unstage", cwd, path);
  }
  return invoke<WorkspaceSnapshot>("unstage_workspace_change", { cwd, path });
}

export async function discardWorkspaceChange(
  cwd: string,
  path: string,
): Promise<WorkspaceSnapshot> {
  if (!isDesktopRuntime()) {
    return applyPreviewWorkspaceAction("discard", cwd, path);
  }
  return invoke<WorkspaceSnapshot>("discard_workspace_change", { cwd, path });
}

export async function runWorkspaceCommand(
  cwd: string,
  commandLine: string,
  commandId: string,
): Promise<WorkspaceCommandResult> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Workspace terminal");
  return invoke<WorkspaceCommandResult>("run_workspace_command", {
    cwd,
    commandLine,
    commandId,
  });
}

export async function cancelWorkspaceCommand(commandId: string): Promise<void> {
  if (!isDesktopRuntime()) desktopOnlyRuntimeFeature("Workspace terminal");
  await invoke("cancel_workspace_command", { commandId });
}

export function listenDesktopEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isDesktopRuntime()) {
    return Promise.resolve(() => undefined);
  }
  return listen<T>(event, ({ payload }) => handler(payload));
}

export const windowActions = {
  minimize: async () => {
    if (isDesktopRuntime()) await getCurrentWindow().minimize();
  },
  toggleMaximize: async () => {
    if (isDesktopRuntime()) await getCurrentWindow().toggleMaximize();
  },
  close: async () => {
    if (isDesktopRuntime()) await getCurrentWindow().close();
  },
};
