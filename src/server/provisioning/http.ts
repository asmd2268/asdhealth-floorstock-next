import "server-only";

import type { ZodType } from "zod";

import type {
  ProvisioningFailureCode,
  ProvisioningRequestContext,
  ProvisioningResult,
} from "@/domain/provisioning/types";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import { getFirebaseAdminEnvironment } from "../firebase-admin/environment";
import {
  getTrustedAdministratorPrincipalResolver,
  type TrustedAdministratorPrincipalResolver,
} from "./principal-resolver";

const maxRequestBodyBytes = 32_768;

const statusByCode: Record<ProvisioningFailureCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  provider_unavailable: 503,
};

function safeError(code: ProvisioningFailureCode): Response {
  return Response.json(
    { ok: false, error: { code } },
    { status: statusByCode[code] },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (contentType !== "application/json") {
    throw new Error("Invalid content type.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maxRequestBodyBytes
  ) {
    throw new Error("Invalid content length.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxRequestBodyBytes) {
    throw new Error("Request body too large.");
  }
  return JSON.parse(text) as unknown;
}

export interface ProvisioningHttpDependencies {
  allowedOrigin(): string;
  principalResolver(): TrustedAdministratorPrincipalResolver;
}

const defaultDependencies: ProvisioningHttpDependencies = {
  allowedOrigin: () => getFirebaseAdminEnvironment().allowedOrigin,
  principalResolver: getTrustedAdministratorPrincipalResolver,
};

export async function handleTrustedProvisioningRequest<T>(
  request: Request,
  bodySchema: ZodType<T>,
  operation: (
    context: ProvisioningRequestContext,
    body: T,
  ) => Promise<ProvisioningResult>,
  dependencies: ProvisioningHttpDependencies = defaultDependencies,
): Promise<Response> {
  try {
    const allowedOrigin = dependencies.allowedOrigin();
    if (
      request.headers.get("origin") !== allowedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return safeError("forbidden");
    }

    const principalResult = await dependencies
      .principalResolver()
      .resolve(request.headers.get("authorization"));
    if (!principalResult.ok) return safeError(principalResult.code);

    const requestId = provisioningIdentifierSchema.safeParse(
      request.headers.get("x-request-id"),
    );
    if (!requestId.success) return safeError("invalid_request");

    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(request);
    } catch {
      return safeError("invalid_request");
    }
    const body = bodySchema.safeParse(rawBody);
    if (!body.success) return safeError("invalid_request");

    const result = await operation(
      {
        actor: principalResult.principal,
        requestId: requestId.data,
      },
      body.data,
    );
    if (!result.ok) return safeError(result.code);
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return safeError("provider_unavailable");
  }
}
