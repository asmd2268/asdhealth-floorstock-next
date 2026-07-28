import "server-only";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import type {
  InventoryActorContext,
  InventoryOperation,
  InventoryResult,
  PostedInventoryResult,
} from "@/domain/inventory/types";
import { parseJsonWithoutDuplicateKeys } from "@/server/session/json";
import { getServerSessionEnvironment } from "@/server/session/environment";

import { resolveInventoryContext } from "./context";
import { getInventoryService } from "./composition";

export const INVENTORY_BODY_LIMIT = 32_768;
export const INVENTORY_CSRF_HEADER = "x-asdhealth-inventory-action";

const status = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  insufficient_stock: 409,
  inactive_item: 409,
  expired_lot: 409,
  provider_unavailable: 503,
} as const;

function failure(code: keyof typeof status): Response {
  const publicCode = code === "not_found" ? "forbidden" : code;
  return Response.json(
    { ok: false, error: { code: publicCode } },
    { status: status[publicCode], headers: { "Cache-Control": "no-store" } },
  );
}

async function readBody(request: Request, expected: number): Promise<unknown> {
  if (!request.body) throw new Error("missing");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expected || total > INVENTORY_BODY_LIMIT) {
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

export interface InventoryHttpDependencies {
  origin(): string;
  resolveContext(
    cookie: string | null,
    operation: InventoryOperation,
  ): ReturnType<typeof resolveInventoryContext>;
  post(
    context: InventoryActorContext,
    operation: InventoryOperation,
    requestId: string,
    body: unknown,
  ): Promise<InventoryResult<PostedInventoryResult>>;
}

const defaults: InventoryHttpDependencies = {
  origin: () => getServerSessionEnvironment().allowedOrigin,
  resolveContext: resolveInventoryContext,
  post: (context, operation, requestId, body) =>
    getInventoryService().post(context, operation, requestId, body),
};

export async function handleInventoryMutation(
  request: Request,
  operation: InventoryOperation,
  dependencies: InventoryHttpDependencies = defaults,
): Promise<Response> {
  try {
    const allowedOrigin = dependencies.origin();
    if (
      new URL(request.url).origin !== allowedOrigin ||
      request.headers.get("origin") !== allowedOrigin ||
      request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.get(INVENTORY_CSRF_HEADER) !== operation ||
      request.headers.get("content-type") !== "application/json"
    )
      return failure("forbidden");
    const lengthValue = request.headers.get("content-length");
    if (!lengthValue || !/^(?:0|[1-9][0-9]{0,5})$/u.test(lengthValue))
      return failure("invalid_request");
    const length = Number(lengthValue);
    if (length > INVENTORY_BODY_LIMIT) return failure("invalid_request");
    const requestId = provisioningIdentifierSchema.safeParse(
      request.headers.get("x-request-id"),
    );
    if (!requestId.success) return failure("invalid_request");
    const context = await dependencies.resolveContext(
      request.headers.get("cookie"),
      operation,
    );
    if (!context.ok) return failure(context.code);
    let body: unknown;
    try {
      body = await readBody(request, length);
    } catch {
      return failure("invalid_request");
    }
    const result = await dependencies.post(
      context.value,
      operation,
      requestId.data,
      body,
    );
    if (!result.ok) return failure(result.code);
    return Response.json(
      {
        ok: true,
        transactionId: result.value.transactionId,
        duplicate: result.value.duplicate,
      },
      {
        status: result.value.duplicate ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return failure("provider_unavailable");
  }
}
