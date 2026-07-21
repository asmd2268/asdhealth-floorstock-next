import { describe, expect, it } from "vitest";

import {
  parseDemoRoleSwitcherFlag,
  resolveTrustedDemoGate,
} from "./public-environment";

describe("demo role switcher environment flag", () => {
  it("is disabled when omitted or explicitly false", () => {
    expect(parseDemoRoleSwitcherFlag(undefined)).toBe(false);
    expect(parseDemoRoleSwitcherFlag("false")).toBe(false);
  });

  it("is enabled only by the explicit true value", () => {
    expect(parseDemoRoleSwitcherFlag("true")).toBe(true);
  });

  it.each(["1", "TRUE", "yes", "enabled"])(
    "fails closed for malformed value %s",
    (value) => {
      expect(parseDemoRoleSwitcherFlag(value)).toBe(false);
    },
  );

  it("disables demo in production even when explicitly requested", () => {
    expect(resolveTrustedDemoGate("production", "true")).toBe(false);
  });

  it("disables demo in development when the flag is false", () => {
    expect(resolveTrustedDemoGate("development", "false")).toBe(false);
  });

  it("enables demo only in a known non-production runtime with the flag set", () => {
    expect(resolveTrustedDemoGate("development", "true")).toBe(true);
    expect(resolveTrustedDemoGate("test", "true")).toBe(true);
  });

  it("fails closed when the runtime is missing or malformed", () => {
    expect(resolveTrustedDemoGate(undefined, "true")).toBe(false);
    expect(resolveTrustedDemoGate("staging", "true")).toBe(false);
  });
});
