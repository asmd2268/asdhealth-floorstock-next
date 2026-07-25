import "server-only";

import type {
  ProtectedPermission,
  ServerSessionFailureCode,
  ServerSessionService,
} from "./types";
import {
  getServerSessionCookieName,
  SERVER_SESSION_LIFETIME_SECONDS,
} from "./types";
import { createSessionBodySchema, serverSessionLimits } from "./validation";

const statusByCode: Record<ServerSessionFailureCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  provider_unavailable: 503,
};

export interface SessionCookieInstruction {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "strict";
    secure: boolean;
    path: "/";
    maxAge: number;
    expires: Date;
    priority: "high";
  };
}

export interface SessionHttpResult {
  response: Response;
  cookie?: SessionCookieInstruction;
  clearCookie?: SessionCookieInstruction;
}

function safeError(code: ServerSessionFailureCode): Response {
  return Response.json(
    { ok: false, error: { code } },
    {
      status: statusByCode[code],
      headers: { "cache-control": "no-store" },
    },
  );
}

function isSameOriginRequest(request: Request, allowedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin || new TextEncoder().encode(origin).byteLength > 2_048) {
    return false;
  }
  try {
    if (
      new URL(origin).origin !== origin ||
      new URL(request.url).origin !== allowedOrigin
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return (
    origin === allowedOrigin &&
    request.headers.get("sec-fetch-site") === "same-origin"
  );
}

export function createClearSessionCookie(
  production: boolean,
): SessionCookieInstruction {
  return {
    name: getServerSessionCookieName(production),
    value: "",
    options: {
      httpOnly: true,
      sameSite: "strict",
      secure: production,
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      priority: "high",
    },
  };
}

export function invalidSessionCookieResult(
  production: boolean,
): SessionHttpResult {
  return {
    response: safeError("unauthenticated"),
    clearCookie: createClearSessionCookie(production),
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    throw new Error("Invalid content type.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > serverSessionLimits.requestBodyBytes
  ) {
    throw new Error("Invalid content length.");
  }
  const text = await request.text();
  if (
    new TextEncoder().encode(text).byteLength >
    serverSessionLimits.requestBodyBytes
  ) {
    throw new Error("Request body too large.");
  }
  return JSON.parse(text) as unknown;
}

export async function handleCreateSessionRequest(
  request: Request,
  previousCookieValue: string | undefined,
  service: ServerSessionService,
  allowedOrigin: string,
  production: boolean,
): Promise<SessionHttpResult> {
  if (!isSameOriginRequest(request, allowedOrigin)) {
    return { response: safeError("forbidden") };
  }

  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch {
    return { response: safeError("invalid_request") };
  }
  const body = createSessionBodySchema.safeParse(input);
  if (!body.success) return { response: safeError("invalid_request") };

  const result = await service.create(body.data.idToken, previousCookieValue);
  if (!result.ok) return { response: safeError(result.code) };
  return {
    response: Response.json(
      { ok: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    ),
    cookie: {
      name: getServerSessionCookieName(production),
      value: result.value.cookieValue,
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        path: "/",
        maxAge: SERVER_SESSION_LIFETIME_SECONDS,
        expires: new Date(result.value.expiresAtMilliseconds),
        priority: "high",
      },
    },
  };
}

export async function handleDeleteSessionRequest(
  request: Request,
  cookieValue: string | undefined,
  service: ServerSessionService,
  allowedOrigin: string,
  production: boolean,
): Promise<SessionHttpResult> {
  if (!isSameOriginRequest(request, allowedOrigin)) {
    return { response: safeError("forbidden") };
  }
  if (request.headers.get("x-asdhealth-session-action") !== "sign-out") {
    return { response: safeError("forbidden") };
  }
  const result = await service.revoke(cookieValue);
  if (!result.ok) {
    return {
      response: safeError(result.code),
      clearCookie:
        result.code === "unauthenticated"
          ? createClearSessionCookie(production)
          : undefined,
    };
  }
  return {
    response: Response.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    ),
    clearCookie: createClearSessionCookie(production),
  };
}

export async function handleProtectedApiRequest(
  cookieValue: string | undefined,
  service: ServerSessionService,
  permission: ProtectedPermission,
): Promise<Response> {
  const result = await service.authorize(cookieValue, permission);
  if (!result.ok) return safeError(result.code);
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
