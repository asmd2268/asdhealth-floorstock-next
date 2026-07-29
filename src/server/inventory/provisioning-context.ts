import "server-only";

import {
  inventoryProvisioningResource,
  type InventoryProvisioningActorContext,
  type InventoryProvisioningOperation,
} from "@/domain/inventory/provisioning-types";
import type { InventoryResult } from "@/domain/inventory/types";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import { fingerprintTrustedAuthorization } from "@/server/session/trusted-authorization";
import {
  getServerSessionCookieName,
  type ServerSessionService,
} from "@/server/session/types";

export interface InventoryProvisioningContextDependencies {
  sessionService(): ServerSessionService;
  production: boolean;
}

const defaults: InventoryProvisioningContextDependencies = {
  sessionService: getServerSessionService,
  production: process.env.NODE_ENV === "production",
};

export async function resolveInventoryProvisioningContext(
  cookieHeader: string | null,
  operation: InventoryProvisioningOperation,
  dependencies: InventoryProvisioningContextDependencies = defaults,
): Promise<InventoryResult<InventoryProvisioningActorContext>> {
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
        resource: inventoryProvisioningResource[operation],
        action: "manage",
      });
    if (!session.ok) return { ok: false, code: session.code };
    const trusted = session.value.trusted;
    const user = trusted.user;
    if (
      trusted.featureFlags.inventory !== true ||
      user.organizationId === null ||
      user.activeScope.kind !== "facility" ||
      user.activeScope.facilityId !== user.activeFacilityId ||
      user.activeScope.organizationId !== user.organizationId
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
