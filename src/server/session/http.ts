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
import {
  createSessionBodySchema,
  serverSessionLimits,
  switchFacilityBodySchema,
} from "./validation";
import { parseJsonWithoutDuplicateKeys } from "./json";

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

export function isSameOriginRequest(
  request: Request,
  allowedOrigin: string,
): boolean {
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

async function readJsonBody(
  request: Request,
  requireDeclaredLength = false,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    throw new Error("Invalid content type.");
  }
  const declaredLengthHeader = request.headers.get("content-length");
  if (requireDeclaredLength && declaredLengthHeader === null) {
    throw new Error("Missing content length.");
  }
  if (
    declaredLengthHeader !== null &&
    !/^(0|[1-9][0-9]*)$/.test(declaredLengthHeader)
  ) {
    throw new Error("Invalid content length.");
  }
  const declaredLength = Number(declaredLengthHeader ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > serverSessionLimits.requestBodyBytes
  ) {
    throw new Error("Invalid content length.");
  }
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let actualLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      actualLength += value.byteLength;
      if (actualLength > serverSessionLimits.requestBodyBytes) {
        await reader.cancel();
        throw new Error("Request body too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declaredLengthHeader !== null && declaredLength !== actualLength) {
    throw new Error("Content length mismatch.");
  }
  const bodyBytes = new Uint8Array(actualLength);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  return parseJsonWithoutDuplicateKeys(text);
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

export async function handleSwitchFacilityRequest(
  request: Request,
  cookieValue: string | undefined,
  service: ServerSessionService,
  allowedOrigin: string,
  production: boolean,
  now: () => number = Date.now,
): Promise<SessionHttpResult> {
  if (!isSameOriginRequest(request, allowedOrigin)) {
    return { response: safeError("forbidden") };
  }
  if (request.headers.get("x-asdhealth-session-action") !== "switch-facility") {
    return { response: safeError("forbidden") };
  }

  let input: unknown;
  try {
    input = await readJsonBody(request, true);
  } catch {
    return { response: safeError("invalid_request") };
  }
  const body = switchFacilityBodySchema.safeParse(input);
  if (!body.success) return { response: safeError("invalid_request") };

  const result = await service.switchFacility(
    cookieValue,
    body.data.facilityId,
  );
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
      {
        ok: true,
        facility: { id: result.value.activeFacilityId },
      },
      { headers: { "cache-control": "no-store" } },
    ),
    cookie: {
      name: getServerSessionCookieName(production),
      value: result.value.cookieValue,
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        path: "/",
        maxAge: Math.max(
          1,
          Math.ceil((result.value.expiresAtMilliseconds - now()) / 1_000),
        ),
        expires: new Date(result.value.expiresAtMilliseconds),
        priority: "high",
      },
    },
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
