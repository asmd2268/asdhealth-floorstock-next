import { describe, expect, it } from "vitest";

import { parseServerSessionEnvironment } from "./environment";

describe("server session environment", () => {
  it("accepts an exact HTTPS origin and local HTTP development origin", () => {
    expect(
      parseServerSessionEnvironment({
        SERVER_SESSION_ALLOWED_ORIGIN: "https://floorstock.asdhealth.example",
      }),
    ).toEqual({ allowedOrigin: "https://floorstock.asdhealth.example" });
    expect(
      parseServerSessionEnvironment({
        SERVER_SESSION_ALLOWED_ORIGIN: "http://localhost:3000",
      }).allowedOrigin,
    ).toBe("http://localhost:3000");
  });

  it.each([
    undefined,
    "https://replace-with-application-origin.example",
    "http://floorstock.asdhealth.example",
    "https://floorstock.asdhealth.example/path",
    "not-an-origin",
  ])("fails closed for missing or malformed origin %s", (origin) => {
    expect(() =>
      parseServerSessionEnvironment({ SERVER_SESSION_ALLOWED_ORIGIN: origin }),
    ).toThrow();
  });
});
