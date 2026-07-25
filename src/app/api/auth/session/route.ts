import { cookies } from "next/headers";

import { getServerSessionService } from "@/server/session/composition";
import { getServerSessionEnvironment } from "@/server/session/environment";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import {
  handleCreateSessionRequest,
  handleDeleteSessionRequest,
  invalidSessionCookieResult,
  type SessionHttpResult,
} from "@/server/session/http";
import { getServerSessionCookieName } from "@/server/session/types";

async function applyCookie(result: SessionHttpResult): Promise<Response> {
  const cookieStore = await cookies();
  if (result.cookie) {
    cookieStore.set(
      result.cookie.name,
      result.cookie.value,
      result.cookie.options,
    );
  } else if (result.clearCookie) {
    cookieStore.set(
      result.clearCookie.name,
      result.clearCookie.value,
      result.clearCookie.options,
    );
  }
  return result.response;
}

export async function POST(request: Request) {
  try {
    const production = process.env.NODE_ENV === "production";
    const cookieName = getServerSessionCookieName(production);
    const sessionCookie = readUniqueSessionCookie(
      request.headers.get("cookie"),
      cookieName,
    );
    if (!sessionCookie.ok) {
      return applyCookie(invalidSessionCookieResult(production));
    }
    return applyCookie(
      await handleCreateSessionRequest(
        request,
        sessionCookie.value,
        getServerSessionService(),
        getServerSessionEnvironment().allowedOrigin,
        production,
      ),
    );
  } catch {
    return Response.json(
      { ok: false, error: { code: "provider_unavailable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const production = process.env.NODE_ENV === "production";
    const cookieName = getServerSessionCookieName(production);
    const sessionCookie = readUniqueSessionCookie(
      request.headers.get("cookie"),
      cookieName,
    );
    if (!sessionCookie.ok) {
      return applyCookie(invalidSessionCookieResult(production));
    }
    return applyCookie(
      await handleDeleteSessionRequest(
        request,
        sessionCookie.value,
        getServerSessionService(),
        getServerSessionEnvironment().allowedOrigin,
        production,
      ),
    );
  } catch {
    return Response.json(
      { ok: false, error: { code: "provider_unavailable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
