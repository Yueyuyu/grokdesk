import type { Update } from "@tauri-apps/plugin-updater";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import packageJson from "../../package.json";
import {
  EMPTY_UPDATE_DOWNLOAD_PROGRESS,
  reduceUpdateDownloadProgress,
  type UpdateDownloadProgress,
} from "../lib/appUpdate";

export const APP_VERSION = packageJson.version;

export type AppUpdatePhase =
  | "preview"
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "restarting"
  | "error";

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  notes: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  progress: UpdateDownloadProgress;
}

export interface AppUpdateController {
  state: AppUpdateState;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installAndRestart: () => Promise<void>;
}

const initialUpdateState = (preview: boolean): AppUpdateState => ({
  phase: preview ? "preview" : "idle",
  currentVersion: APP_VERSION,
  availableVersion: null,
  notes: null,
  publishedAt: null,
  checkedAt: null,
  error: null,
  progress: EMPTY_UPDATE_DOWNLOAD_PROGRESS,
});

const updaterErrorMessage = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.trim() || "The update service returned an unknown error.";
};

export function useAppUpdate(preview: boolean): AppUpdateController {
  const [state, setState] = useState<AppUpdateState>(() =>
    initialUpdateState(preview),
  );
  const updateRef = useRef<Update | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      const update = updateRef.current;
      updateRef.current = null;
      if (update) void update.close().catch(() => undefined);
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (preview) {
      setState(initialUpdateState(true));
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((current) => ({
      ...current,
      phase: "checking",
      error: null,
      progress: EMPTY_UPDATE_DOWNLOAD_PROGRESS,
    }));

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const nextUpdate = await check({ timeout: 15_000 });
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        if (nextUpdate) await nextUpdate.close();
        return;
      }

      const previousUpdate = updateRef.current;
      updateRef.current = nextUpdate;
      if (previousUpdate && previousUpdate !== nextUpdate) {
        void previousUpdate.close().catch(() => undefined);
      }

      const checkedAt = new Date().toISOString();
      if (!nextUpdate) {
        setState({
          ...initialUpdateState(false),
          phase: "current",
          checkedAt,
        });
        return;
      }

      setState({
        phase: "available",
        currentVersion: nextUpdate.currentVersion,
        availableVersion: nextUpdate.version,
        notes: nextUpdate.body?.trim() || null,
        publishedAt: nextUpdate.date ?? null,
        checkedAt,
        error: null,
        progress: EMPTY_UPDATE_DOWNLOAD_PROGRESS,
      });
    } catch (cause) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setState((current) => ({
        ...current,
        phase: "error",
        checkedAt: new Date().toISOString(),
        error: updaterErrorMessage(cause),
      }));
    }
  }, [preview]);

  useEffect(() => {
    if (preview) {
      setState(initialUpdateState(true));
      return;
    }
    const timeout = window.setTimeout(() => {
      void checkForUpdates();
    }, 1_200);
    return () => window.clearTimeout(timeout);
  }, [checkForUpdates, preview]);

  const downloadUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: "Check for updates again before downloading.",
      }));
      return;
    }

    setState((current) => ({
      ...current,
      phase: "downloading",
      error: null,
      progress: EMPTY_UPDATE_DOWNLOAD_PROGRESS,
    }));

    try {
      await update.download((event) => {
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          progress: reduceUpdateDownloadProgress(current.progress, event),
        }));
      });
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        phase: "downloaded",
        progress: {
          ...current.progress,
          percent: current.progress.totalBytes ? 100 : null,
        },
      }));
    } catch (cause) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        phase: "error",
        error: updaterErrorMessage(cause),
      }));
    }
  }, []);

  const installAndRestart = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: "The downloaded update is no longer available. Check again.",
      }));
      return;
    }

    setState((current) => ({
      ...current,
      phase: "installing",
      error: null,
    }));
    try {
      await update.install();
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, phase: "restarting" }));
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (cause) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        phase: "error",
        error: updaterErrorMessage(cause),
      }));
    }
  }, []);

  return {
    state,
    checkForUpdates,
    downloadUpdate,
    installAndRestart,
  };
}
