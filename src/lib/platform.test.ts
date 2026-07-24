import { describe, expect, it } from "vitest";
import {
  commandPaletteShortcut,
  detectAppPlatform,
  grokAuthFileHint,
  grokExecutableHint,
  localPathExample,
  sendShortcut,
  workspaceShellPresentation,
} from "./platform";

describe("desktop platform presentation", () => {
  it("detects Windows, macOS, and Linux signals", () => {
    expect(
      detectAppPlatform({ platform: "Win32", userAgent: "Windows NT 10.0" }),
    ).toBe("windows");
    expect(
      detectAppPlatform({ platform: "MacIntel", userAgent: "Mac OS X" }),
    ).toBe("macos");
    expect(
      detectAppPlatform({ platform: "Linux x86_64", userAgent: "X11" }),
    ).toBe("linux");
  });

  it("uses native shortcut and executable labels", () => {
    expect(commandPaletteShortcut("macos")).toBe("⌘ K");
    expect(commandPaletteShortcut("windows")).toBe("Ctrl K");
    expect(sendShortcut("macos")).toBe("⌘ Enter");
    expect(sendShortcut("windows")).toBe("Ctrl Enter");
    expect(grokExecutableHint("macos")).toBe("~/.grok/bin/grok");
    expect(grokExecutableHint("windows")).toContain("grok.exe");
    expect(grokAuthFileHint("macos")).toBe("~/.grok/auth.json");
    expect(grokAuthFileHint("windows")).toContain("%USERPROFILE%");
    expect(localPathExample("macos", "plugin")).toBe(
      "/Users/you/Projects/plugin",
    );
    expect(localPathExample("windows", "plugin")).toBe(
      "C:\\Projects\\plugin",
    );
  });

  it("describes the correct workspace shell", () => {
    expect(workspaceShellPresentation("windows").name).toBe("PowerShell");
    expect(workspaceShellPresentation("macos")).toMatchObject({
      name: "Shell",
      prompt: "$",
    });
  });
});
