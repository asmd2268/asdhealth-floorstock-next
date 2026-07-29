import "server-only";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import type {
  InventoryProvisioningActorContext,
  InventoryProvisioningOperation,
  InventoryProvisioningResult,
} from "@/domain/inventory/provisioning-types";
import type { InventoryResult } from "@/domain/inventory/types";
import { parseJsonWithoutDuplicateKeys } from "@/server/session/json";
import { getServerSessionEnvironment } from "@/server/session/environment";

import { getInventoryProvisioningService } from "./provisioning-composition";
import { resolveInventoryProvisioningContext } from "./provisioning-context";

export const INVENTORY_PROVISIONING_BODY_LIMIT = 32_768;
export const INVENTORY_PROVISIONING_CSRF_HEADER =
  "x-asdhealth-inventory-provisioning-action";

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
    if (total > expected || total > INVENTORY_PROVISIONING_BODY_LIMIT) {
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

export interface InventoryProvisioningHttpDependencies {
  origin(): string;
  resolveContext(
    cookie: string | null,
    operation: InventoryProvisioningOperation,
  ): Promise<InventoryResult<InventoryProvisioningActorContext>>;
  upsert(
    context: InventoryProvisioningActorContext,
    operation: InventoryProvisioningOperation,
    targetId: string,
    requestId: string,
    body: unknown,
  ): Promise<InventoryResult<InventoryProvisioningResult>>;
}

const defaults: InventoryProvisioningHttpDependencies = {
  origin: () => getServerSessionEnvironment().allowedOrigin,
  resolveContext: resolveInventoryProvisioningContext,
  upsert: (context, operation, targetId, requestId, body) =>
    getInventoryProvisioningService().upsert(
      context,
      operation,
      targetId,
      requestId,
      body,
    ),
};

export async function handleInventoryProvisioningMutation(
  request: Request,
  operation: InventoryProvisioningOperation,
  rawTargetId: string,
  dependencies: InventoryProvisioningHttpDependencies = defaults,
): Promise<Response> {
  try {
    const allowedOrigin = dependencies.origin();
    if (
      new URL(request.url).origin !== allowedOrigin ||
      request.headers.get("origin") !== allowedOrigin ||
      request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.get(INVENTORY_PROVISIONING_CSRF_HEADER) !== operation ||
      request.headers.get("content-type") !== "application/json"
    )
      return failure("forbidden");
    const targetId = provisioningIdentifierSchema.safeParse(rawTargetId);
    const requestId = provisioningIdentifierSchema.safeParse(
      request.headers.get("x-request-id"),
    );
    const lengthValue = request.headers.get("content-length");
    if (
      !targetId.success ||
      !requestId.success ||
      !lengthValue ||
      !/^(?:0|[1-9][0-9]{0,5})$/u.test(lengthValue)
    )
      return failure("invalid_request");
    const length = Number(lengthValue);
    if (length > INVENTORY_PROVISIONING_BODY_LIMIT)
      return failure("invalid_request");
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
    const result = await dependencies.upsert(
      context.value,
      operation,
      targetId.data,
      requestId.data,
      body,
    );
    if (!result.ok) return failure(result.code);
    return Response.json(
      {
        ok: true,
        targetId: result.value.targetId,
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
