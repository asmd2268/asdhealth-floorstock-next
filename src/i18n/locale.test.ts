import { describe, expect, it } from "vitest";

import { resolveLocale, serializeLocaleCookie } from "./locale";

describe("locale persistence", () => {
  it("restores supported cookie locales and defaults invalid values to English", () => {
    expect(resolveLocale("ar")).toBe("ar");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
  });

  it("serializes a scoped, same-site locale cookie", () => {
    expect(serializeLocaleCookie("ar", false)).toBe(
      "asdhealth-locale=ar; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(serializeLocaleCookie("en", true)).toContain("; Secure");
  });
});
