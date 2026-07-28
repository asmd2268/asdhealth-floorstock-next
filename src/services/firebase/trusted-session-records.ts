import { z } from "zod";

import { permissionActions, resourceIds, roleIds } from "@/domain/access/types";
import {
  accountStatuses,
  type RoleAssignmentRecord,
  type TenantDirectory,
  type UserProfileRecord,
} from "@/domain/auth/types";

import { isCanonicalTrustedIdentifier } from "./trusted-identifier";
import { trustedSessionLimits } from "./trusted-session-limits";

const trustedId = z
  .string()
  .min(1)
  .max(trustedSessionLimits.identifierLength)
  .refine(
    isCanonicalTrustedIdentifier,
    "Expected a canonical trusted record identifier.",
  );

const safeDisplayName = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/\p{C}/u.test(value));

const platformScope = z
  .object({
    kind: z.literal("platform"),
    platformId: trustedId,
  })
  .strict();

const organizationScope = z
  .object({
    kind: z.literal("organization"),
    platformId: trustedId,
    organizationId: trustedId,
  })
  .strict();

const facilityScope = z
  .object({
    kind: z.literal("facility"),
    platformId: trustedId,
    organizationId: trustedId,
    facilityId: trustedId,
  })
  .strict();

const assignmentScope = z.discriminatedUnion("kind", [
  platformScope,
  organizationScope,
  facilityScope,
]);

const permissionOverride = z
  .object({
    effect: z.enum(["allow", "deny"]),
    resource: z.enum(resourceIds),
    action: z.enum(permissionActions),
    scope: assignmentScope,
  })
  .strict();

const userProfileSchema = z
  .object({
    uid: trustedId,
    tenantId: trustedId,
    organizationId: trustedId.nullable(),
    facilityIds: z
      .array(trustedId)
      .min(1)
      .max(trustedSessionLimits.facilityMemberships),
    activeFacilityId: trustedId.nullable(),
    accountStatus: z.enum(accountStatuses),
    explicitPermissionOverrides: z
      .array(permissionOverride)
      .max(trustedSessionLimits.explicitPermissionOverrides),
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.facilityIds).size !== profile.facilityIds.length) {
      context.addIssue({
        code: "custom",
        message: "Facility membership identifiers must be unique.",
        path: ["facilityIds"],
      });
    }
  });

const roleAssignmentSchema = z
  .object({
    uid: trustedId,
    tenantId: trustedId,
    roleId: z.enum(roleIds),
    scope: assignmentScope,
  })
  .strict();

const featureFlagsSchema = z
  .object({
    announcements: z.boolean(),
    zebra_labels: z.boolean(),
    new_request: z.boolean(),
    controlled_medicines: z.boolean(),
  })
  .strict();

const tenantDirectorySchema = z
  .object({
    tenantId: trustedId,
    status: z.enum(["active", "inactive"]),
    platformId: trustedId,
    organizations: z
      .array(z.object({ id: trustedId }).strict())
      .min(1)
      .max(trustedSessionLimits.tenantOrganizations),
    facilities: z
      .array(
        z
          .object({
            id: trustedId,
            organizationId: trustedId,
            displayName: safeDisplayName.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(trustedSessionLimits.tenantFacilities),
    featureFlags: featureFlagsSchema,
  })
  .strict()
  .superRefine((directory, context) => {
    const organizationIds = new Set(
      directory.organizations.map((organization) => organization.id),
    );
    if (organizationIds.size !== directory.organizations.length) {
      context.addIssue({
        code: "custom",
        message: "Organization identifiers must be unique.",
        path: ["organizations"],
      });
    }

    const facilityIds = new Set(
      directory.facilities.map((facility) => facility.id),
    );
    if (facilityIds.size !== directory.facilities.length) {
      context.addIssue({
        code: "custom",
        message: "Facility identifiers must be unique.",
        path: ["facilities"],
      });
    }

    directory.facilities.forEach((facility, index) => {
      if (!organizationIds.has(facility.organizationId)) {
        context.addIssue({
          code: "custom",
          message: "Facility organization must exist in the tenant directory.",
          path: ["facilities", index, "organizationId"],
        });
      }
    });
  });

export function parseTrustedUserProfile(input: unknown): UserProfileRecord {
  return userProfileSchema.parse(input);
}

export function parseTrustedRoleAssignment(
  input: unknown,
): RoleAssignmentRecord {
  return roleAssignmentSchema.parse(input);
}

export function parseTrustedTenantDirectory(input: unknown): TenantDirectory {
  return tenantDirectorySchema.parse(input);
}
