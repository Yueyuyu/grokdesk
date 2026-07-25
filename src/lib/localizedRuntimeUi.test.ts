import { describe, expect, it } from "vitest";
import {
  fallbackPlanPriority,
  fallbackPlanStepNumber,
  isFallbackPlanUpdate,
  isFallbackRuntimeTool,
  normalizePreviewMarkdownChunks,
  previewToolTargetTranslationKey,
  runtimeToolActionTranslationKey,
} from "./localizedRuntimeUi";

describe("localized Runtime UI fallbacks", () => {
  it("recognizes GrokDesk-owned tool action labels without changing Runtime text", () => {
    expect(runtimeToolActionTranslationKey("Run")).toBe(
      "runtime.tool.action.run",
    );
    expect(runtimeToolActionTranslationKey("update")).toBe(
      "runtime.tool.action.update",
    );
    expect(runtimeToolActionTranslationKey("Runtime custom action")).toBeNull();
  });

  it("maps only known browser-preview tool ids", () => {
    expect(previewToolTargetTranslationKey("preview-tool-0")).toBe(
      "runtime.preview.tool.noFilesRead",
    );
    expect(previewToolTargetTranslationKey("preview-tool-5")).toBe(
      "runtime.preview.tool.demo",
    );
    expect(previewToolTargetTranslationKey("runtime-tool-0")).toBeNull();
  });

  it("recognizes local plan fallbacks while preserving arbitrary Runtime copy", () => {
    expect(fallbackPlanStepNumber("Plan step 12")).toBe(12);
    expect(fallbackPlanStepNumber("Review the plan")).toBeNull();
    expect(fallbackPlanPriority("high priority")).toBe("high");
    expect(fallbackPlanPriority("Runtime detail")).toBeNull();
    expect(isFallbackPlanUpdate("Updated by Grok Build")).toBe(true);
    expect(isFallbackPlanUpdate("Updated by Runtime")).toBe(false);
    expect(isFallbackRuntimeTool("Grok Build tool")).toBe(true);
    expect(isFallbackRuntimeTool("Custom tool")).toBe(false);
  });

  it("separates localized preview Markdown without relying on catalog newlines", () => {
    const chunks = normalizePreviewMarkdownChunks([
      "### 浏览器预览",
      "任务已保存。",
      "",
      "- **桌面行为：** 使用官方 Runtime。",
      "| 检查 | 结果 |\n| --- | --- |\n| 本地任务 | 已保存 |",
      "```text\nNo command was executed.\n```",
    ]);

    expect(chunks.join("")).toBe(
      [
        "### 浏览器预览",
        "任务已保存。",
        "- **桌面行为：** 使用官方 Runtime。",
        "| 检查 | 结果 |\n| --- | --- |\n| 本地任务 | 已保存 |",
        "```text\nNo command was executed.\n```",
      ].join("\n\n"),
    );
  });

  it("normalizes catalogs that already include trailing separators", () => {
    expect(
      normalizePreviewMarkdownChunks([
        "### Browser preview\n\n",
        "Saved locally.\n\n",
      ]).join(""),
    ).toBe("### Browser preview\n\nSaved locally.");
  });
});
