export type AppPlatform = "windows" | "macos" | "linux" | "unknown";

interface PlatformSignals {
  userAgent?: string;
  platform?: string;
}

export interface WorkspaceShellPresentation {
  name: string;
  prompt: string;
  commandNoun: string;
  placeholder: string;
}

export function detectAppPlatform(
  signals: PlatformSignals = {
    userAgent:
      typeof navigator === "undefined" ? "" : navigator.userAgent,
    platform: typeof navigator === "undefined" ? "" : navigator.platform,
  },
): AppPlatform {
  const value = `${signals.platform ?? ""} ${signals.userAgent ?? ""}`.toLowerCase();
  if (value.includes("mac") || value.includes("darwin")) return "macos";
  if (value.includes("win")) return "windows";
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "unknown";
}

export function commandPaletteShortcut(platform: AppPlatform) {
  return platform === "macos" ? "⌘ K" : "Ctrl K";
}

export function sendShortcut(platform: AppPlatform) {
  return platform === "macos" ? "⌘ Enter" : "Ctrl Enter";
}

export function grokExecutableHint(platform: AppPlatform) {
  if (platform === "windows") return "%USERPROFILE%\\.grok\\bin\\grok.exe";
  return "~/.grok/bin/grok";
}

export function grokAuthFileHint(platform: AppPlatform) {
  if (platform === "windows") return "%USERPROFILE%\\.grok\\auth.json";
  return "~/.grok/auth.json";
}

export function localPathExample(platform: AppPlatform, suffix = "") {
  const root =
    platform === "windows" ? "C:\\Projects" : "/Users/you/Projects";
  return suffix ? `${root}/${suffix}`.replaceAll("/", platform === "windows" ? "\\" : "/") : root;
}

export function workspaceShellPresentation(
  platform: AppPlatform,
): WorkspaceShellPresentation {
  if (platform === "windows") {
    return {
      name: "PowerShell",
      prompt: "PS>",
      commandNoun: "PowerShell command",
      placeholder: "Enter a PowerShell command",
    };
  }

  return {
    name: "Shell",
    prompt: "$",
    commandNoun: "shell command",
    placeholder: "Enter a shell command",
  };
}
