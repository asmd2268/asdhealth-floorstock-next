import { getServerSessionService } from "@/server/session/composition";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { handleProtectedApiRequest } from "@/server/session/http";
import { getServerSessionCookieName } from "@/server/session/types";

export async function GET(request: Request) {
  try {
    const cookieName = getServerSessionCookieName(
      process.env.NODE_ENV === "production",
    );
    const sessionCookie = readUniqueSessionCookie(
      request.headers.get("cookie"),
      cookieName,
    );
    if (!sessionCookie.ok) {
      return Response.json(
        { ok: false, error: { code: "unauthenticated" } },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    return handleProtectedApiRequest(
      sessionCookie.value,
      getServerSessionService(),
      { resource: "dashboard", action: "read" },
    );
  } catch {
    return Response.json(
      { ok: false, error: { code: "provider_unavailable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
