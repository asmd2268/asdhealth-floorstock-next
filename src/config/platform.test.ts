import { describe, expect, it } from "vitest";

import { baseBrand, getSafeLogoUrl } from "./platform";

describe("branding configuration", () => {
  it("preserves the ASDHealth base identity", () => {
    expect(baseBrand).toMatchObject({
      productName: "ASDHealth Floor Stock",
      clientDisplayName: "ASDHealth",
      ownerText: "By Ali Abudahash",
    });
  });

  it.each(["/brand/logo.svg", "https://assets.example.com/logo.svg"])(
    "accepts safe logo URL %s",
    (url) => {
      expect(getSafeLogoUrl(url)).toBe(url);
    },
  );

  it.each([
    "javascript:alert(1)",
    "http://example.com/logo.svg",
    "//example.com/logo.svg",
    "/\\example.com/logo.svg",
  ])("rejects unsafe logo URL %s", (url) => {
    expect(getSafeLogoUrl(url)).toBeUndefined();
  });
});
