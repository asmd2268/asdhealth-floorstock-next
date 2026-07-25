import { describe, expect, it } from "vitest";

import { readUniqueSessionCookie } from "./cookies";

const name = "__Host-asdhealth_session";
const value = `${"a".repeat(43)}.${"b".repeat(43)}`;

describe("server session cookie reader", () => {
  it("accepts exactly one canonical session cookie", () => {
    expect(
      readUniqueSessionCookie(`locale=en; ${name}=${value}; theme=light`, name),
    ).toEqual({ ok: true, value });
  });

  it("distinguishes a missing session cookie from malformed input", () => {
    expect(readUniqueSessionCookie(null, name)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(readUniqueSessionCookie("locale=en", name)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(readUniqueSessionCookie(`${name}=malformed`, name)).toEqual({
      ok: false,
    });
    expect(readUniqueSessionCookie(`${name} =${value}`, name)).toEqual({
      ok: false,
    });
  });

  it("rejects duplicate or ambiguous values even when one is valid", () => {
    expect(
      readUniqueSessionCookie(`${name}=${value}; ${name}=${value}`, name),
    ).toEqual({ ok: false });
    expect(readUniqueSessionCookie(`${name}; locale=en`, name)).toEqual({
      ok: false,
    });
    expect(readUniqueSessionCookie(`${name}=${value}.extra`, name)).toEqual({
      ok: false,
    });
  });

  it("rejects oversized cookie headers before parsing", () => {
    expect(
      readUniqueSessionCookie(`padding=${"x".repeat(8_192)}`, name),
    ).toEqual({ ok: false });
  });
});
