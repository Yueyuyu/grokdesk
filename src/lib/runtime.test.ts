import { describe, expect, it } from "vitest";
import type { RuntimeStatus } from "../types";
import {
  formatCreditUsage,
  getAuthenticationLabel,
  getRuntimeSetupStep,
} from "./runtime";

const runtime = (
  overrides: Partial<RuntimeStatus> = {},
): RuntimeStatus => ({
  available: true,
  authenticationState: "configured",
  executablePath: "grok",
  version: "grok 0.2.93",
  authFilePath: null,
  ...overrides,
});

describe("Grok Runtime setup state", () => {
  it("requires installation before authentication", () => {
    expect(getRuntimeSetupStep(runtime({ available: false }))).toBe("install");
  });

  it("requires OAuth when credentials are missing or expired", () => {
    expect(
      getRuntimeSetupStep(runtime({ authenticationState: "missing" })),
    ).toBe("sign-in");
    expect(
      getRuntimeSetupStep(runtime({ authenticationState: "expired" })),
    ).toBe("sign-in");
  });

  it("opens the workspace once official credentials are configured", () => {
    expect(getRuntimeSetupStep(runtime())).toBe("ready");
  });
});

describe("runtime labels", () => {
  it("uses connection evidence as the strongest authentication signal", () => {
    expect(getAuthenticationLabel("configured", true)).toBe("已登录并验证");
  });

  it("formats billing usage without fake precision", () => {
    expect(formatCreditUsage(24.4)).toBe("24% 已使用");
    expect(formatCreditUsage(null)).toBe("尚未查询");
  });
});
