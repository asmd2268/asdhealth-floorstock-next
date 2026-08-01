import "server-only";

import { z } from "zod";

import { accountStatuses } from "@/domain/auth/types";
import {
  featureFlagsSchema,
  provisioningIdentifierSchema,
  provisioningScopeSchema,
} from "@/domain/provisioning/schemas";
import { permissionActions, resourceIds, roleIds } from "@/domain/access/types";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

const permissionOverrideSchema = z
  .object({
    effect: z.enum(["allow", "deny"]),
    resource: z.enum(resourceIds),
    action: z.enum(permissionActions),
    scope: provisioningScopeSchema,
  })
  .strict();

export const facilityBodySchema = z
  .object({
    organizationId: provisioningIdentifierSchema,
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value === value.trim() && !/\p{C}/u.test(value))
      .optional(),
  })
  .strict();

export const departmentBodySchema = z
  .object({
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value === value.trim() && !/\p{C}/u.test(value))
      .optional(),
  })
  .strict();

export const userProfileBodySchema = z
  .object({
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
  .strict();

export const accountStatusBodySchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    accountStatus: z.enum(["active", "disabled"]),
  })
  .strict();

export const roleAssignmentBodySchema = z
  .object({
    tenantId: provisioningIdentifierSchema,
    roleId: z.enum(roleIds),
    scope: provisioningScopeSchema,
  })
  .strict();

export const revokeRoleBodySchema = z
  .object({ tenantId: provisioningIdentifierSchema })
  .strict();

export const featureFlagsBodySchema = z
  .object({ featureFlags: featureFlagsSchema })
  .strict();
