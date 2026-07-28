import "server-only";

import type { ZodType } from "zod";

import type { AdministrationContext } from "@/domain/administration/types";
import type {
  ProvisioningFailureCode,
  ProvisioningResult,
} from "@/domain/provisioning/types";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { parseJsonWithoutDuplicateKeys } from "@/server/session/json";
import { getServerSessionEnvironment } from "@/server/session/environment";

import { resolveAdministrationContext } from "./context";

export const ADMINISTRATION_BODY_LIMIT = 16_384;
export const ADMINISTRATION_CSRF_HEADER = "x-asdhealth-admin-action";

const statusByCode: Record<ProvisioningFailureCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  provider_unavailable: 503,
};

function response(code: ProvisioningFailureCode): Response {
  const publicCode = code === "not_found" ? "forbidden" : code;
  return Response.json(
    { ok: false, error: { code: publicCode } },
    {
      status: statusByCode[publicCode],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function declaredLength(value: string | null): number | null {
  if (!value || !/^(?:0|[1-9][0-9]{0,5})$/u.test(value)) return null;
  const length = Number(value);
  return length <= ADMINISTRATION_BODY_LIMIT ? length : null;
}

async function readBoundedBody(
  request: Request,
  expected: number,
): Promise<unknown> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ADMINISTRATION_BODY_LIMIT || total > expected) {
      await reader.cancel();
      throw new Error("Invalid body length");
    }
    chunks.push(value);
  }
  if (total !== expected) throw new Error("Invalid body length");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return parseJsonWithoutDuplicateKeys(text);
}

export interface AdministrationHttpDependencies {
  allowedOrigin(): string;
  resolveContext(cookieHeader: string | null): Promise<
    | { ok: true; value: AdministrationContext }
    | {
        ok: false;
        code:
          | "unauthenticated"
          | "forbidden"
          | "provider_unavailable"
          | "invalid_request"
          | "not_found";
      }
  >;
}

const defaults: AdministrationHttpDependencies = {
  allowedOrigin: () => getServerSessionEnvironment().allowedOrigin,
  resolveContext: resolveAdministrationContext,
};

export async function handleAdministrationMutation<T>(
  request: Request,
  schema: ZodType<T>,
  operation: (
    context: AdministrationContext,
    requestId: string,
    body: T,
  ) => Promise<ProvisioningResult>,
  dependencies: AdministrationHttpDependencies = defaults,
): Promise<Response> {
  try {
    const allowedOrigin = dependencies.allowedOrigin();
    const requestOrigin = new URL(request.url).origin;
    if (
      request.headers.get("origin") !== allowedOrigin ||
      requestOrigin !== allowedOrigin ||
      request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.get(ADMINISTRATION_CSRF_HEADER) !== "1"
    )
      return response("forbidden");
    if (request.headers.get("content-type") !== "application/json")
      return response("invalid_request");
    const length = declaredLength(request.headers.get("content-length"));
    if (length === null) return response("invalid_request");
    const requestId = provisioningIdentifierSchema.safeParse(
      request.headers.get("x-request-id"),
    );
    if (!requestId.success) return response("invalid_request");

    const context = await dependencies.resolveContext(
      request.headers.get("cookie"),
    );
    if (!context.ok) return response(context.code);

    let raw: unknown;
    try {
      raw = await readBoundedBody(request, length);
    } catch {
      return response("invalid_request");
    }
    const body = schema.safeParse(raw);
    if (!body.success) return response("invalid_request");
    const result = await operation(context.value, requestId.data, body.data);
    if (!result.ok) return response(result.code);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return response("provider_unavailable");
  }
}
