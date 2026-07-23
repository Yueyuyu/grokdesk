import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_RUNTIME_PROFILE,
  loadDefaultRuntimeProfile,
  parseRuntimeProfile,
  RUNTIME_PROFILE_STORAGE_KEY,
  saveDefaultRuntimeProfile,
} from "./runtimeProfile";

describe("runtime launch profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts official model and reasoning identifiers", () => {
    expect(
      parseRuntimeProfile({
        modelId: "grok-4.5",
        reasoningEffort: "high",
      }),
    ).toEqual({
      modelId: "grok-4.5",
      reasoningEffort: "high",
    });
  });

  it("does not persist command-like or malformed values", () => {
    expect(
      parseRuntimeProfile({
        modelId: "--always-approve",
        reasoningEffort: "high effort",
      }),
    ).toEqual(EMPTY_RUNTIME_PROFILE);
  });

  it("round-trips the local default without storing Runtime credentials", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    saveDefaultRuntimeProfile({
      modelId: "grok-4.5",
      reasoningEffort: "medium",
    });

    expect(loadDefaultRuntimeProfile()).toEqual({
      modelId: "grok-4.5",
      reasoningEffort: "medium",
    });
    expect(values.get(RUNTIME_PROFILE_STORAGE_KEY)).toBe(
      '{"modelId":"grok-4.5","reasoningEffort":"medium"}',
    );
  });
});
