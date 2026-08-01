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
const departmentSchema = z
  .object({
    id: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
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
    departments: z
      .array(departmentSchema)
      .max(trustedSessionLimits.tenantDepartments)
      .optional(),
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
    const departmentIds = new Set(
      (tenant.departments ?? []).map((department) => department.id),
    );
    if (departmentIds.size !== (tenant.departments ?? []).length) {
      context.addIssue({
        code: "custom",
        path: ["departments"],
        message: "Department identifiers must be unique.",
      });
    }
    (tenant.departments ?? []).forEach((department, index) => {
      const facility = tenant.facilities.find(
        (candidate) => candidate.id === department.facilityId,
      );
      if (!facility || facility.organizationId !== department.organizationId) {
        context.addIssue({
          code: "custom",
          path: ["departments", index],
          message: "Department facility and organization must match.",
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

export const upsertDepartmentSchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    department: departmentSchema,
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
    departmentIds: z
      .array(provisioningIdentifierSchema)
      .max(trustedSessionLimits.departmentMemberships)
      .optional(),
    activeDepartmentId: provisioningIdentifierSchema.nullable().optional(),
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
    if (
      profile.departmentIds &&
      new Set(profile.departmentIds).size !== profile.departmentIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["departmentIds"],
        message: "Department identifiers must be unique.",
      });
    }
    if (
      profile.activeDepartmentId &&
      !profile.departmentIds?.includes(profile.activeDepartmentId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeDepartmentId"],
        message: "Active department must be an allowed department.",
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
    departmentIds: z
      .array(provisioningIdentifierSchema)
      .max(trustedSessionLimits.departmentMemberships)
      .optional(),
    activeDepartmentId: provisioningIdentifierSchema.nullable().optional(),
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
    if (
      membership.departmentIds &&
      new Set(membership.departmentIds).size !== membership.departmentIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["departmentIds"],
        message: "Department identifiers must be unique.",
      });
    }
    if (
      membership.activeDepartmentId &&
      !membership.departmentIds?.includes(membership.activeDepartmentId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeDepartmentId"],
        message: "Active department must be an allowed department.",
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
