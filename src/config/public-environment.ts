import { z } from "zod";

const demoRoleSwitcherSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export function parseDemoRoleSwitcherFlag(value: string | undefined): boolean {
  return demoRoleSwitcherSchema.parse(value);
}

export function isDemoRoleSwitcherEnabled(): boolean {
  return parseDemoRoleSwitcherFlag(
    process.env.NEXT_PUBLIC_ENABLE_DEMO_ROLE_SWITCHER,
  );
}
