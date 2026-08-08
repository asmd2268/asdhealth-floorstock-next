import { describe, expect, it } from "vitest";
import { createFixedWindowRateLimiter } from "./rate-limit";

describe("fixed window rate limiter", () => {
  it("limits a key and resets after the window", () => {
    const limiter = createFixedWindowRateLimiter(2, 1000);
    expect(limiter.check("actor", 0).allowed).toBe(true);
    expect(limiter.check("actor", 1).allowed).toBe(true);
    expect(limiter.check("actor", 2).allowed).toBe(false);
    expect(limiter.check("other", 2).allowed).toBe(true);
    expect(limiter.check("actor", 1000).allowed).toBe(true);
  });
});
