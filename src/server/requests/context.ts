import "server-only";

import type { PermissionAction } from "@/domain/access/types";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestOperation,
  FloorStockRequestResult,
} from "@/domain/requests/types";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import { fingerprintTrustedAuthorization } from "@/server/session/trusted-authorization";
import {
  getServerSessionCookieName,
  type ServerSessionService,
} from "@/server/session/types";

export const requestActionByOperation: Readonly<
  Record<FloorStockRequestOperation, PermissionAction>
> = {
  create: "create",
  submit: "edit",
  approve: "approve",
  reject: "approve",
  start_fulfillment: "manage",
  complete_fulfillment: "manage",
  deliver: "manage",
  cancel: "delete",
};

export interface FloorStockRequestContextDependencies {
  sessionService(): ServerSessionService;
  production: boolean;
}

const defaults: FloorStockRequestContextDependencies = {
  sessionService: getServerSessionService,
  production: process.env.NODE_ENV === "production",
};

export async function resolveFloorStockRequestContext(
  cookieHeader: string | null,
  operation: FloorStockRequestOperation,
  dependencies: FloorStockRequestContextDependencies = defaults,
): Promise<FloorStockRequestResult<FloorStockRequestActorContext>> {
  const cookie = readUniqueSessionCookie(
    cookieHeader,
    getServerSessionCookieName(dependencies.production),
  );
  if (!cookie.ok || !cookie.value)
    return { ok: false, code: "unauthenticated" };
  try {
    const session = await dependencies
      .sessionService()
      .authorize(cookie.value, {
        resource: "new_request",
        action: requestActionByOperation[operation],
      });
    if (!session.ok) return { ok: false, code: session.code };
    const trusted = session.value.trusted;
    const user = trusted.user;
    if (
      user.organizationId === null ||
      user.activeScope.kind !== "facility" ||
      user.activeScope.facilityId !== user.activeFacilityId ||
      user.activeScope.organizationId !== user.organizationId ||
      trusted.featureFlags.new_request !== true ||
      ((
        ["create", "submit", "cancel"] as FloorStockRequestOperation[]
      ).includes(operation) &&
        user.activeDepartmentId === null)
    )
      return { ok: false, code: "forbidden" };
    return {
      ok: true,
      value: {
        uid: user.uid,
        tenantId: user.tenantId,
        platformId: user.platformId,
        organizationId: user.organizationId,
        activeFacilityId: user.activeFacilityId,
        activeDepartmentId: user.activeDepartmentId,
        activeScope: user.activeScope,
        roleAssignments: user.roleAssignments,
        explicitPermissionOverrides: user.explicitPermissionOverrides,
        featureFlags: trusted.featureFlags,
        trustedStateFingerprint: fingerprintTrustedAuthorization(trusted),
      },
    };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  }
}
