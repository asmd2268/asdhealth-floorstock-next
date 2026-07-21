import { z } from "zod";

const demoRoleSwitcherSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export function parseDemoRoleSwitcherFlag(value: string | undefined): boolean {
  const result = demoRoleSwitcherSchema.safeParse(value);
  return result.success ? result.data : false;
}

export function resolveTrustedDemoGate(
  runtime: string | undefined,
  explicitFlag: string | undefined,
): boolean {
  const isNonProductionRuntime =
    runtime === "development" || runtime === "test";
  return isNonProductionRuntime && parseDemoRoleSwitcherFlag(explicitFlag);
}

export function isTrustedDemoModeEnabled(): boolean {
  return resolveTrustedDemoGate(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_ENABLE_DEMO_ROLE_SWITCHER,
  );
}
