import "server-only";

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitDecision;
}

export function createFixedWindowRateLimiter(
  limit: number,
  windowMs: number,
): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return {
    check(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((windowMs - (now - current.startedAt)) / 1000),
          ),
        };
      }
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
