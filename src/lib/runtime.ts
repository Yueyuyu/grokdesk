import type { AuthenticationState, RuntimeStatus } from "../types";

export type RuntimeSetupStep = "checking" | "install" | "sign-in" | "ready";

export function getRuntimeSetupStep(
  runtime: RuntimeStatus | null,
): RuntimeSetupStep {
  if (!runtime) return "checking";
  if (!runtime.available) return "install";
  if (
    runtime.authenticationState === "missing" ||
    runtime.authenticationState === "expired"
  ) {
    return "sign-in";
  }
  return "ready";
}

export function getAuthenticationLabel(
  authenticationState: AuthenticationState | undefined,
  connected: boolean,
) {
  if (connected || authenticationState === "verified") return "已登录并验证";
  if (authenticationState === "configured") return "已找到凭据，等待验证";
  if (authenticationState === "expired") return "登录已过期，请重新登录";
  return "尚未登录";
}

export function formatCreditUsage(creditUsagePercent: number | null) {
  if (creditUsagePercent === null || !Number.isFinite(creditUsagePercent)) {
    return "尚未查询";
  }
  return `${Math.round(creditUsagePercent)}% 已使用`;
}
