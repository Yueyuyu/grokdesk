import type { RuntimeSkillSummary } from "../types";

export function filterRuntimeSkills(
  skills: RuntimeSkillSummary[],
  rawQuery: string,
) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return skills;
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.sourceType]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
}

export function formatContextBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  return `${(bytes / 1_024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

export function formatContextTokens(tokens: number) {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0 tokens";
  if (tokens < 1_000) return `~${Math.round(tokens)} tokens`;
  return `~${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k tokens`;
}
