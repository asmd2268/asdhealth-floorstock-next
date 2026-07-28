import { cookies } from "next/headers";

import { getServerSessionService } from "@/server/session/composition";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionEnvironment } from "@/server/session/environment";
import {
  handleSwitchFacilityRequest,
  invalidSessionCookieResult,
  isSameOriginRequest,
  type SessionHttpResult,
} from "@/server/session/http";
import { getServerSessionCookieName } from "@/server/session/types";

async function applyCookie(result: SessionHttpResult): Promise<Response> {
  if (result.cookie || result.clearCookie) {
    const instruction = result.cookie ?? result.clearCookie!;
    const cookieStore = await cookies();
    cookieStore.set(instruction.name, instruction.value, instruction.options);
  }
  return result.response;
}

export async function POST(request: Request) {
  try {
    const production = process.env.NODE_ENV === "production";
    const allowedOrigin = getServerSessionEnvironment().allowedOrigin;
    if (
      !isSameOriginRequest(request, allowedOrigin) ||
      request.headers.get("x-asdhealth-session-action") !== "switch-facility"
    ) {
      return Response.json(
        { ok: false, error: { code: "forbidden" } },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const sessionCookie = readUniqueSessionCookie(
      request.headers.get("cookie"),
      getServerSessionCookieName(production),
    );
    if (!sessionCookie.ok || !sessionCookie.value) {
      return applyCookie(invalidSessionCookieResult(production));
    }
    return applyCookie(
      await handleSwitchFacilityRequest(
        request,
        sessionCookie.value,
        getServerSessionService(),
        allowedOrigin,
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
