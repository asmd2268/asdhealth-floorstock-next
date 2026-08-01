import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { resolveScopedPermission } from "@/domain/access/permissions";
import type { SessionResolutionResult } from "@/domain/auth/types";
import { featureIds } from "@/domain/platform/types";

type TrustedSession = Extract<SessionResolutionResult, { ok: true }>;

function scopeKey(scope: TrustedSession["user"]["activeScope"]): string {
  if (scope.kind === "platform") return `platform:${scope.platformId}`;
  if (scope.kind === "organization") {
    return `organization:${scope.platformId}:${scope.organizationId}`;
  }
  return `facility:${scope.platformId}:${scope.organizationId}:${scope.facilityId}`;
}

export function hasTrustedFacilityShellAccess(
  trusted: TrustedSession,
  expectedFacilityId = trusted.user.activeFacilityId,
): boolean {
  if (
    trusted.user.activeFacilityId !== expectedFacilityId ||
    trusted.user.activeScope.kind !== "facility" ||
    trusted.user.activeScope.facilityId !== expectedFacilityId
  ) {
    return false;
  }

  return resolveScopedPermission({
    roleAssignments: trusted.user.roleAssignments,
    resource: "dashboard",
    action: "read",
    subjectScope: trusted.user.activeScope,
    targetScope: trusted.user.activeScope,
    featureFlags: trusted.featureFlags,
    overrides: trusted.user.explicitPermissionOverrides,
  }).allowed;
}

export function fingerprintTrustedAuthorization(
  trusted: TrustedSession,
): string {
  const roles = trusted.user.roleAssignments
    .map((assignment) => `${assignment.role}|${scopeKey(assignment.scope)}`)
    .sort();
  const overrides = trusted.user.explicitPermissionOverrides
    .map(
      (override) =>
        `${override.effect}|${override.resource}|${override.action}|${
          override.scope ? scopeKey(override.scope) : "global"
        }`,
    )
    .sort();
  const payload = JSON.stringify({
    uid: trusted.user.uid,
    tenantId: trusted.user.tenantId,
    platformId: trusted.user.platformId,
    organizationId: trusted.user.organizationId,
    facilityIds: [...trusted.user.facilityIds].sort(),
    activeFacilityId: trusted.user.activeFacilityId,
    departmentIds: [...trusted.user.departmentIds].sort(),
    activeDepartmentId: trusted.user.activeDepartmentId,
    activeScope: scopeKey(trusted.user.activeScope),
    accountStatus: trusted.user.accountStatus,
    roles,
    overrides,
    featureFlags: featureIds.map((feature) => [
      feature,
      trusted.featureFlags[feature],
    ]),
  });
  return createHash("sha256")
    .update("asdhealth:trusted-facility-authorization:v2\0", "utf8")
    .update(payload, "utf8")
    .digest("hex");
}

export function trustedAuthorizationFingerprintMatches(
  actual: string,
  expected: string,
): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === 32 &&
    expectedBytes.length === 32 &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
