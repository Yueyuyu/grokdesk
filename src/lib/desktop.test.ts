import { describe, expect, it } from "vitest";
import {
  cancelWorkspaceCommand,
  fetchGrokSubscription,
  inspectRuntimeModels,
  runDiagnostics,
  runWorkspaceCommand,
  writeDiagnosticReportFile,
} from "./desktop";

describe("workspace terminal browser boundary", () => {
  it("never simulates workspace command execution in a browser preview", async () => {
    await expect(
      runWorkspaceCommand("C:\\Preview\\workspace", "git status", "terminal-1"),
    ).rejects.toThrow("Workspace terminal is available only");
  });

  it("does not simulate process cancellation outside the desktop app", async () => {
    await expect(cancelWorkspaceCommand("terminal-1")).rejects.toThrow(
      "Workspace terminal is available only",
    );
  });
});

describe("diagnostics browser boundary", () => {
  it("never fabricates local health checks in a browser preview", async () => {
    await expect(runDiagnostics("C:\\Preview\\workspace", false)).rejects.toThrow(
      "Diagnostics is available only",
    );
  });

  it("does not export a report without native diagnostic data", async () => {
    await expect(writeDiagnosticReportFile("# report")).rejects.toThrow(
      "Diagnostic report export is available only",
    );
  });
});

describe("runtime model browser boundary", () => {
  it("never fabricates an official model catalog in browser preview", async () => {
    await expect(inspectRuntimeModels()).rejects.toThrow(
      "Runtime model inspection is available only",
    );
  });
});

describe("subscription browser boundary", () => {
  it("leaves preview notices to the localized UI instead of returning fixed English", async () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const windowDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) =>
          key === "grokdesk.preview.oauth-complete" ? "true" : null,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { setTimeout },
    });

    try {
      await expect(fetchGrokSubscription("preview-task")).resolves.toMatchObject(
        {
          availability: "unsupported",
          message: null,
        },
      );
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(
          globalThis,
          "localStorage",
          localStorageDescriptor,
        );
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
      if (windowDescriptor) {
        Object.defineProperty(globalThis, "window", windowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
