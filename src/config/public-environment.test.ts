import { describe, expect, it } from "vitest";

import { parseDemoRoleSwitcherFlag } from "./public-environment";

describe("demo role switcher environment flag", () => {
  it("is disabled when omitted or explicitly false", () => {
    expect(parseDemoRoleSwitcherFlag(undefined)).toBe(false);
    expect(parseDemoRoleSwitcherFlag("false")).toBe(false);
  });

  it("is enabled only by the explicit true value", () => {
    expect(parseDemoRoleSwitcherFlag("true")).toBe(true);
  });

  it.each(["1", "TRUE", "yes", "enabled"])(
    "rejects malformed value %s",
    (value) => {
      expect(() => parseDemoRoleSwitcherFlag(value)).toThrow();
    },
  );
});
