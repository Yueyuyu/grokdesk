import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type { RuntimeStatus } from "../types";

export const isDesktopRuntime = () => isTauri();

export async function probeRuntime(): Promise<RuntimeStatus> {
  if (!isDesktopRuntime()) {
    return {
      available: true,
      authenticationState: "verified",
      executablePath: "grok",
      version: "grok 0.2.93 · browser demo",
      authFilePath: null,
    };
  }

  return invoke<RuntimeStatus>("probe_runtime");
}

export async function startAcpSession(cwd: string): Promise<string> {
  if (!isDesktopRuntime()) {
    return "browser-demo-session";
  }
  return invoke<string>("start_acp_session", { cwd });
}

export async function sendAcpPrompt(text: string): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("send_acp_prompt", { text });
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

export async function launchOAuth(): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("start_oauth_login");
}

export async function answerClientRequest(id: number, result: unknown): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  await invoke("respond_to_client_request", { id, result });
}

export async function chooseWorkspace(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
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
