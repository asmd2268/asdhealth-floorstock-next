import type {
  BrowserServerSessionTransport,
  SessionTransportResult,
} from "@/services/contracts/server-session";

type Fetcher = typeof fetch;

async function normalizeResponse(
  response: Response,
): Promise<SessionTransportResult> {
  if (response.ok) return { ok: true };
  if (response.status === 401) return { ok: false, reason: "unauthenticated" };
  if (response.status === 403) return { ok: false, reason: "access_denied" };
  return { ok: false, reason: "provider_unavailable" };
}

export function createBrowserServerSessionTransport(
  fetcher: Fetcher = fetch,
): BrowserServerSessionTransport {
  return {
    async create(idToken) {
      try {
        const response = await fetcher("/api/auth/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        return normalizeResponse(response);
      } catch {
        return { ok: false, reason: "provider_unavailable" };
      }
    },
    async revoke() {
      try {
        const response = await fetcher("/api/auth/session", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "x-asdhealth-session-action": "sign-out" },
        });
        return normalizeResponse(response);
      } catch {
        return { ok: false, reason: "provider_unavailable" };
      }
    },
  };
}

let browserSessionTransport: BrowserServerSessionTransport | undefined;

export function getBrowserServerSessionTransport(): BrowserServerSessionTransport {
  browserSessionTransport ??= createBrowserServerSessionTransport();
  return browserSessionTransport;
}
