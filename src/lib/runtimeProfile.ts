import type { RuntimeLaunchProfile } from "../types";

export const RUNTIME_PROFILE_STORAGE_KEY = "grokdesk.runtime-profile.v1";

export const EMPTY_RUNTIME_PROFILE: RuntimeLaunchProfile = {
  modelId: null,
  reasoningEffort: null,
};

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
const REASONING_EFFORT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

const safeProfileValue = (value: unknown, pattern: RegExp) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return pattern.test(normalized) ? normalized : null;
};

export function parseRuntimeProfile(value: unknown): RuntimeLaunchProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_RUNTIME_PROFILE };
  const candidate = value as Record<string, unknown>;
  return {
    modelId: safeProfileValue(candidate.modelId, MODEL_ID_PATTERN),
    reasoningEffort: safeProfileValue(
      candidate.reasoningEffort,
      REASONING_EFFORT_PATTERN,
    ),
  };
}

export function loadDefaultRuntimeProfile(): RuntimeLaunchProfile {
  if (typeof window === "undefined") return { ...EMPTY_RUNTIME_PROFILE };
  try {
    return parseRuntimeProfile(
      JSON.parse(window.localStorage.getItem(RUNTIME_PROFILE_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...EMPTY_RUNTIME_PROFILE };
  }
}

export function saveDefaultRuntimeProfile(profile: RuntimeLaunchProfile) {
  const validated = parseRuntimeProfile(profile);
  window.localStorage.setItem(
    RUNTIME_PROFILE_STORAGE_KEY,
    JSON.stringify(validated),
  );
  return validated;
}
