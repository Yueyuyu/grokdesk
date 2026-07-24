import { describe, expect, it } from "vitest";
import {
  EMPTY_UPDATE_DOWNLOAD_PROGRESS,
  formatUpdateSize,
  reduceUpdateDownloadProgress,
} from "./appUpdate";

describe("app update download progress", () => {
  it("tracks a signed package with a known content length", () => {
    const started = reduceUpdateDownloadProgress(
      EMPTY_UPDATE_DOWNLOAD_PROGRESS,
      {
        event: "Started",
        data: { contentLength: 1_000 },
      },
    );
    const halfway = reduceUpdateDownloadProgress(started, {
      event: "Progress",
      data: { chunkLength: 500 },
    });
    const finished = reduceUpdateDownloadProgress(halfway, {
      event: "Finished",
    });

    expect(started).toEqual({
      downloadedBytes: 0,
      totalBytes: 1_000,
      percent: 0,
    });
    expect(halfway.percent).toBe(50);
    expect(finished.percent).toBe(100);
  });

  it("keeps byte progress truthful when the server omits a total", () => {
    const started = reduceUpdateDownloadProgress(
      EMPTY_UPDATE_DOWNLOAD_PROGRESS,
      {
        event: "Started",
        data: {},
      },
    );
    const next = reduceUpdateDownloadProgress(started, {
      event: "Progress",
      data: { chunkLength: 2_048 },
    });

    expect(next).toEqual({
      downloadedBytes: 2_048,
      totalBytes: null,
      percent: null,
    });
    expect(formatUpdateSize(next.downloadedBytes)).toBe("2.0 KiB");
  });
});
