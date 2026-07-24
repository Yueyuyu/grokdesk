import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export interface UpdateDownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export const EMPTY_UPDATE_DOWNLOAD_PROGRESS: UpdateDownloadProgress = {
  downloadedBytes: 0,
  totalBytes: null,
  percent: null,
};

export function reduceUpdateDownloadProgress(
  current: UpdateDownloadProgress,
  event: DownloadEvent,
): UpdateDownloadProgress {
  if (event.event === "Started") {
    return {
      downloadedBytes: 0,
      totalBytes: event.data.contentLength ?? null,
      percent: event.data.contentLength ? 0 : null,
    };
  }

  if (event.event === "Finished") {
    return {
      ...current,
      percent: current.totalBytes ? 100 : null,
    };
  }

  const downloadedBytes = current.downloadedBytes + event.data.chunkLength;
  return {
    ...current,
    downloadedBytes,
    percent: current.totalBytes
      ? Math.min(100, Math.round((downloadedBytes / current.totalBytes) * 100))
      : null,
  };
}

export function formatUpdateSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
