import "server-only";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestOperation,
  FloorStockRequestResult,
  MutatedFloorStockRequestResult,
} from "@/domain/requests/types";
import { getServerSessionEnvironment } from "@/server/session/environment";
import { parseJsonWithoutDuplicateKeys } from "@/server/session/json";
import { createFixedWindowRateLimiter } from "@/server/security/rate-limit";

import { getFloorStockRequestService } from "./composition";
import { resolveFloorStockRequestContext } from "./context";

export const FLOOR_STOCK_REQUEST_BODY_LIMIT = 32_768;
export const FLOOR_STOCK_REQUEST_CSRF_HEADER =
  "x-asdhealth-floor-stock-request-action";
export const FLOOR_STOCK_REQUEST_RATE_LIMITER = createFixedWindowRateLimiter(
  30,
  60_000,
);

const statuses = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  inactive_configuration: 409,
  inactive_item: 409,
  insufficient_stock: 409,
  expired_lot: 409,
  provider_unavailable: 503,
} as const;

const failure = (code: keyof typeof statuses) => {
  const publicCode = code === "not_found" ? "forbidden" : code;
  return Response.json(
    { ok: false, error: { code: publicCode } },
    {
      status: statuses[publicCode],
      headers: { "Cache-Control": "no-store" },
    },
  );
};

async function readBody(request: Request, expected: number) {
  if (!request.body) throw new Error("missing");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expected || total > FLOOR_STOCK_REQUEST_BODY_LIMIT) {
      await reader.cancel();
      throw new Error("large");
    }
    chunks.push(value);
  }
  if (total !== expected) throw new Error("length");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseJsonWithoutDuplicateKeys(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
}

export interface FloorStockRequestHttpDependencies {
  origin(): string;
  resolveContext(
    cookie: string | null,
    operation: FloorStockRequestOperation,
  ): ReturnType<typeof resolveFloorStockRequestContext>;
  mutate(
    context: FloorStockRequestActorContext,
    operation: FloorStockRequestOperation,
    correlationId: string,
    floorStockRequestId: string | null,
    body: unknown,
  ): Promise<FloorStockRequestResult<MutatedFloorStockRequestResult>>;
}

const defaults: FloorStockRequestHttpDependencies = {
  origin: () => getServerSessionEnvironment().allowedOrigin,
  resolveContext: resolveFloorStockRequestContext,
  mutate: (context, operation, correlationId, requestId, body) =>
    getFloorStockRequestService().mutate(
      context,
      operation,
      correlationId,
      requestId,
      body,
    ),
};

export async function handleFloorStockRequestMutation(
  request: Request,
  operation: FloorStockRequestOperation,
  rawTargetId: string | null = null,
  dependencies: FloorStockRequestHttpDependencies = defaults,
) {
  try {
    const allowedOrigin = dependencies.origin();
    if (
      new URL(request.url).origin !== allowedOrigin ||
      request.headers.get("origin") !== allowedOrigin ||
      request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.get(FLOOR_STOCK_REQUEST_CSRF_HEADER) !== operation ||
      request.headers.get("content-type") !== "application/json"
    )
      return failure("forbidden");
    const targetId =
      operation === "create"
        ? null
        : provisioningIdentifierSchema.safeParse(rawTargetId);
    if (targetId !== null && !targetId.success)
      return failure("invalid_request");
    const lengthValue = request.headers.get("content-length");
    if (!lengthValue || !/^(?:0|[1-9][0-9]{0,5})$/u.test(lengthValue))
      return failure("invalid_request");
    const length = Number(lengthValue);
    if (length > FLOOR_STOCK_REQUEST_BODY_LIMIT)
      return failure("invalid_request");
    const correlationId = provisioningIdentifierSchema.safeParse(
      request.headers.get("x-request-id"),
    );
    if (!correlationId.success) return failure("invalid_request");
    const context = await dependencies.resolveContext(
      request.headers.get("cookie"),
      operation,
    );
    if (!context.ok) return failure(context.code);
    const decision = FLOOR_STOCK_REQUEST_RATE_LIMITER.check(
      `${context.value.tenantId}:${context.value.uid}`,
    );
    if (!decision.allowed)
      return new Response(null, {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      });
    let body: unknown;
    try {
      body = await readBody(request, length);
    } catch {
      return failure("invalid_request");
    }
    const result = await dependencies.mutate(
      context.value,
      operation,
      correlationId.data,
      targetId?.data ?? null,
      body,
    );
    if (!result.ok) return failure(result.code);
    return Response.json(
      { ok: true, ...result.value },
      {
        status: operation === "create" && !result.value.duplicate ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return failure("provider_unavailable");
  }
}
