import "server-only";

import type {
  InventoryActorContext,
  InventoryOperation,
  InventoryResult,
} from "@/domain/inventory/types";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import { fingerprintTrustedAuthorization } from "@/server/session/trusted-authorization";
import {
  getServerSessionCookieName,
  type ServerSessionService,
} from "@/server/session/types";

const action = {
  receive: "receive",
  issue: "issue",
  adjust_increase: "adjust",
  adjust_decrease: "adjust",
  transfer: "transfer",
} as const;

export interface InventoryContextDependencies {
  sessionService(): ServerSessionService;
  production: boolean;
}

const defaults: InventoryContextDependencies = {
  sessionService: getServerSessionService,
  production: process.env.NODE_ENV === "production",
};

export async function resolveInventoryContext(
  cookieHeader: string | null,
  operation: InventoryOperation,
  dependencies: InventoryContextDependencies = defaults,
): Promise<InventoryResult<InventoryActorContext>> {
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
        resource: "inventory_stock",
        action: action[operation],
      });
    if (!session.ok) return { ok: false, code: session.code };
    const trusted = session.value.trusted;
    const user = trusted.user;
    if (
      user.organizationId === null ||
      user.activeScope.kind !== "facility" ||
      user.activeScope.facilityId !== user.activeFacilityId ||
      user.activeScope.organizationId !== user.organizationId ||
      trusted.featureFlags.inventory !== true
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
