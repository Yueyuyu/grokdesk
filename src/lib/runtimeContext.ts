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

export function formatContextBytes(bytes: number, locale = "en") {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1_024) {
    return `${new Intl.NumberFormat(locale).format(Math.round(bytes))} B`;
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: bytes < 10_240 ? 1 : 0,
    maximumFractionDigits: bytes < 10_240 ? 1 : 0,
  }).format(bytes / 1_024)} KB`;
}

export function formatContextTokens(
  tokens: number,
  locale = "en",
  label = "tokens",
) {
  if (!Number.isFinite(tokens) || tokens <= 0) return `0 ${label}`;
  if (tokens < 1_000) {
    return `~${new Intl.NumberFormat(locale).format(Math.round(tokens))} ${label}`;
  }
  return `~${new Intl.NumberFormat(locale, {
    minimumFractionDigits: tokens < 10_000 ? 1 : 0,
    maximumFractionDigits: tokens < 10_000 ? 1 : 0,
  }).format(tokens / 1_000)}k ${label}`;
}
