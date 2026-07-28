import { z } from "zod";

import { permissionActions, resourceIds, roleIds } from "@/domain/access/types";
import { accountStatuses } from "@/domain/auth/types";
import { isCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

export const provisioningIdentifierSchema = z
  .string()
  .min(1)
  .max(trustedSessionLimits.identifierLength)
  .refine(
    isCanonicalTrustedIdentifier,
    "Expected a canonical trusted identifier.",
  );

const safeDisplayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine(
    (value) => value === value.trim() && !/\p{C}/u.test(value),
    "Expected a bounded display name without surrounding whitespace or control characters.",
  );

const platformScopeSchema = z
  .object({
    kind: z.literal("platform"),
    platformId: provisioningIdentifierSchema,
  })
  .strict();

const organizationScopeSchema = z
  .object({
    kind: z.literal("organization"),
    platformId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
  })
  .strict();

const facilityScopeSchema = z
  .object({
    kind: z.literal("facility"),
    platformId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
  })
  .strict();

export const provisioningScopeSchema = z.discriminatedUnion("kind", [
  platformScopeSchema,
  organizationScopeSchema,
  facilityScopeSchema,
]);

const permissionOverrideSchema = z
  .object({
    effect: z.enum(["allow", "deny"]),
    resource: z.enum(resourceIds),
    action: z.enum(permissionActions),
    scope: provisioningScopeSchema,
  })
  .strict();

export const featureFlagsSchema = z
  .object({
    announcements: z.boolean(),
    zebra_labels: z.boolean(),
    new_request: z.boolean(),
    controlled_medicines: z.boolean(),
    inventory: z.boolean().default(false),
  })
  .strict();

const organizationSchema = z
  .object({ id: provisioningIdentifierSchema })
  .strict();
const facilitySchema = z
  .object({
    id: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    displayName: safeDisplayNameSchema.optional(),
  })
  .strict();

export const administratorPrincipalSchema = z.union([
  z
    .object({
      kind: z.literal("platform_owner"),
      uid: provisioningIdentifierSchema,
      platformId: provisioningIdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tenant_admin"),
      scope: z.literal("unrestricted"),
      uid: provisioningIdentifierSchema,
      platformId: provisioningIdentifierSchema,
      tenantId: provisioningIdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tenant_admin"),
      scope: z.literal("restricted"),
      uid: provisioningIdentifierSchema,
      platformId: provisioningIdentifierSchema,
      tenantId: provisioningIdentifierSchema,
      organizationIds: z
        .array(provisioningIdentifierSchema)
        .min(1)
        .max(trustedSessionLimits.tenantOrganizations),
      facilityIds: z
        .array(provisioningIdentifierSchema)
        .max(trustedSessionLimits.facilityMemberships),
    })
    .strict()
    .superRefine((principal, context) => {
      if (
        new Set(principal.organizationIds).size !==
        principal.organizationIds.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["organizationIds"],
          message: "Organization identifiers must be unique.",
        });
      }
      if (
        new Set(principal.facilityIds).size !== principal.facilityIds.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["facilityIds"],
          message: "Facility identifiers must be unique.",
        });
      }
    }),
]);

export const requestContextSchema = z
  .object({
    actor: administratorPrincipalSchema,
    requestId: provisioningIdentifierSchema,
  })
  .strict();

export const createTenantSchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    platformId: provisioningIdentifierSchema,
    organizations: z
      .array(organizationSchema)
      .min(1)
      .max(trustedSessionLimits.tenantOrganizations),
    facilities: z
      .array(facilitySchema)
      .min(1)
      .max(trustedSessionLimits.tenantFacilities),
    featureFlags: featureFlagsSchema,
  })
  .strict()
  .superRefine((tenant, context) => {
    const organizationIds = new Set(
      tenant.organizations.map((organization) => organization.id),
    );
    if (organizationIds.size !== tenant.organizations.length) {
      context.addIssue({
        code: "custom",
        path: ["organizations"],
        message: "Organization identifiers must be unique.",
      });
    }
    const facilityIds = new Set(
      tenant.facilities.map((facility) => facility.id),
    );
    if (facilityIds.size !== tenant.facilities.length) {
      context.addIssue({
        code: "custom",
        path: ["facilities"],
        message: "Facility identifiers must be unique.",
      });
    }
    tenant.facilities.forEach((facility, index) => {
      if (!organizationIds.has(facility.organizationId)) {
        context.addIssue({
          code: "custom",
          path: ["facilities", index, "organizationId"],
          message: "Facility organization must exist.",
        });
      }
    });
  });

export const upsertFacilitySchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    facility: facilitySchema,
  })
  .strict();

export const upsertUserProfileSchema = z
  .object({
    uid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema.nullable(),
    facilityIds: z
      .array(provisioningIdentifierSchema)
      .min(1)
      .max(trustedSessionLimits.facilityMemberships),
    activeFacilityId: provisioningIdentifierSchema.nullable(),
    accountStatus: z.enum(accountStatuses),
    explicitPermissionOverrides: z
      .array(permissionOverrideSchema)
      .max(trustedSessionLimits.explicitPermissionOverrides),
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.facilityIds).size !== profile.facilityIds.length) {
      context.addIssue({
        code: "custom",
        path: ["facilityIds"],
        message: "Facility identifiers must be unique.",
      });
    }
    if (
      profile.activeFacilityId !== null &&
      !profile.facilityIds.includes(profile.activeFacilityId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeFacilityId"],
        message: "Active facility must be an allowed facility.",
      });
    }
  });

export const setAccountStatusSchema = z
  .object({
    uid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    accountStatus: z.enum(["active", "disabled"]),
  })
  .strict();

export const updateUserMembershipSchema = z
  .object({
    uid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityIds: z
      .array(provisioningIdentifierSchema)
      .min(1)
      .max(trustedSessionLimits.facilityMemberships),
    activeFacilityId: provisioningIdentifierSchema,
  })
  .strict()
  .superRefine((membership, context) => {
    if (
      new Set(membership.facilityIds).size !== membership.facilityIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["facilityIds"],
        message: "Facility identifiers must be unique.",
      });
    }
    if (!membership.facilityIds.includes(membership.activeFacilityId)) {
      context.addIssue({
        code: "custom",
        path: ["activeFacilityId"],
        message: "Active facility must be an allowed facility.",
      });
    }
  });

export const assignRoleSchema = z
  .object({
    assignmentId: provisioningIdentifierSchema,
    uid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    roleId: z.enum(roleIds),
    scope: provisioningScopeSchema,
  })
  .strict();

export const revokeRoleAssignmentSchema = z
  .object({
    assignmentId: provisioningIdentifierSchema,
    uid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
  })
  .strict();

export const replaceFeatureFlagsSchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    featureFlags: featureFlagsSchema,
    expectedFeatureFlags: featureFlagsSchema.optional(),
  })
  .strict();
