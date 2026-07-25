import type { TranslationKey } from "../i18n/types";

const runtimeToolActionKeys: Record<string, TranslationKey> = {
  edit: "runtime.tool.action.edit",
  read: "runtime.tool.action.read",
  run: "runtime.tool.action.run",
  test: "runtime.tool.action.test",
  update: "runtime.tool.action.update",
  write: "runtime.tool.action.write",
};

const previewToolTargetKeys: TranslationKey[] = [
  "runtime.preview.tool.noFilesRead",
  "runtime.preview.tool.noFilesChanged",
  "runtime.preview.tool.noCommand",
  "runtime.preview.tool.noTests",
  "runtime.preview.tool.noGit",
  "runtime.preview.tool.demo",
];

export function runtimeToolActionTranslationKey(
  action: string,
): TranslationKey | null {
  return runtimeToolActionKeys[action.trim().toLocaleLowerCase()] ?? null;
}

export function previewToolTargetTranslationKey(
  toolId: string,
): TranslationKey | null {
  const match = /^preview-tool-(\d+)$/.exec(toolId);
  if (!match) return null;
  return previewToolTargetKeys[Number(match[1])] ?? null;
}

export function fallbackPlanStepNumber(title: string): number | null {
  const match = /^Plan step (\d+)$/.exec(title.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function fallbackPlanPriority(detail: string): string | null {
  const match = /^(.+) priority$/.exec(detail.trim());
  return match?.[1]?.trim() || null;
}

export function isFallbackPlanUpdate(detail: string) {
  return detail.trim() === "Updated by Grok Build";
}

export function isFallbackRuntimeTool(target: string) {
  return target.trim() === "Grok Build tool";
}
