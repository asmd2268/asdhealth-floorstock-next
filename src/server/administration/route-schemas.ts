import "server-only";

import { z } from "zod";

import { roleIds } from "@/domain/access/types";
import {
  featureFlagsSchema,
  provisioningIdentifierSchema,
  provisioningScopeSchema,
} from "@/domain/provisioning/schemas";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

export const administrationAccountStatusSchema = z
  .object({ accountStatus: z.enum(["active", "disabled"]) })
  .strict();

export const administrationMembershipSchema = z
  .object({
    organizationId: provisioningIdentifierSchema,
    facilityIds: z
      .array(provisioningIdentifierSchema)
      .min(1)
      .max(trustedSessionLimits.facilityMemberships),
    activeFacilityId: provisioningIdentifierSchema,
    departmentIds: z
      .array(provisioningIdentifierSchema)
      .max(trustedSessionLimits.departmentMemberships),
    activeDepartmentId: provisioningIdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((membership, context) => {
    if (
      new Set(membership.departmentIds).size !== membership.departmentIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["departmentIds"],
        message: "Department identifiers must be unique.",
      });
    }
    if (
      membership.activeDepartmentId !== null &&
      !membership.departmentIds.includes(membership.activeDepartmentId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeDepartmentId"],
        message: "Active department must be included in the membership.",
      });
    }
  });

export const administrationRoleSchema = z
  .object({ roleId: z.enum(roleIds), scope: provisioningScopeSchema })
  .strict();

export const administrationEmptySchema = z.object({}).strict();

export const administrationFacilitySchema = z
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

export const administrationDepartmentSchema = z
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

export const administrationFeatureFlagsSchema = z
  .object({
    featureFlags: featureFlagsSchema,
    expectedFeatureFlags: featureFlagsSchema,
  })
  .strict();
