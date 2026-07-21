import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type { GrokSubscription, RuntimeStatus } from "../types";

const PREVIEW_RUNTIME_KEY = "grokdesk.preview.runtime-installed";
const PREVIEW_AUTH_KEY = "grokdesk.preview.oauth-complete";
const SUBSCRIPTION_URL = "https://grok.com/supergrok?referrer=grok-build";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

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

export async function startAcpSession(
  cwd: string,
  resumeSessionId: string | null = null,
): Promise<string> {
  if (!isDesktopRuntime()) {
    return (
      resumeSessionId ??
      `browser-preview-${
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Date.now()
      }`
    );
  }
  return invoke<string>("start_acp_session", { cwd, resumeSessionId });
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
