import "server-only";

import { z } from "zod";

import { roleIds } from "@/domain/access/types";
import {
  ADMINISTRATION_PAGE_SIZE,
  ADMINISTRATION_READ_LIMIT,
  ADMINISTRATION_TOTAL_READ_LIMIT,
  type AdministrationAuditEntry,
  type AdministrationContext,
  type AdministrationDirectory,
  type AdministrationFeatureFlags,
  type AdministrationPage,
  type AdministrationResult,
  type AdministrationRoleAssignment,
  type AdministrationUserDetail,
  type AdministrationUserSummary,
} from "@/domain/administration/types";
import {
  canReadAdministration,
  canReadFeatures,
  filterDirectory,
  isProfileVisible,
} from "@/domain/administration/authorization";
import {
  administrativeActions,
  provisioningAuditTargetTypes,
  type AdministrativeAction,
} from "@/domain/provisioning/types";
import { sanitizeAuditMetadata } from "@/domain/provisioning/audit";
import {
  administratorPrincipalSchema,
  provisioningIdentifierSchema,
} from "@/domain/provisioning/schemas";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "@/services/firebase/trusted-session-records";

import type { AdministrationRepository } from "./repository";

const safeAuditValue = z.union([
  z.string().max(128),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const safeAuditKey = z
  .string()
  .max(64)
  .refine((value) => value === value.trim() && !/\p{C}/u.test(value));
const auditSchema = z
  .object({
    eventId: provisioningIdentifierSchema,
    actor: administratorPrincipalSchema,
    action: z.enum(administrativeActions),
    targetType: z.enum(provisioningAuditTargetTypes),
    targetId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    timestamp: z.iso.datetime({ offset: true }),
    requestId: provisioningIdentifierSchema,
    metadata: z
      .record(safeAuditKey, safeAuditValue)
      .refine((value) => Object.keys(value).length <= 20),
  })
  .strict()
  .superRefine((event, context) => {
    const expectedTarget: Record<
      AdministrativeAction,
      (typeof provisioningAuditTargetTypes)[number]
    > = {
      create_tenant: "tenant",
      upsert_facility: "facility",
      upsert_user_profile: "user_profile",
      set_account_status: "account",
      assign_role: "role_assignment",
      revoke_role_assignment: "role_assignment",
      replace_feature_flags: "feature_flags",
    };
    if (event.targetType !== expectedTarget[event.action]) {
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "Audit action and target type must match.",
      });
    }
  });

const fail = <T>(
  code: "forbidden" | "not_found" | "invalid_request" | "provider_unavailable",
): AdministrationResult<T> => ({ ok: false, code });

function parseContext(context: AdministrationContext): boolean {
  return (
    provisioningIdentifierSchema.safeParse(context.tenantId).success &&
    provisioningIdentifierSchema.safeParse(context.platformId).success &&
    provisioningIdentifierSchema.safeParse(context.sessionUid).success &&
    administratorPrincipalSchema.safeParse(context.principal).success &&
    context.principal.uid === context.sessionUid &&
    canReadAdministration(
      context.principal,
      context.tenantId,
      context.platformId,
    )
  );
}

function summary(
  documentId: string,
  raw: unknown,
): AdministrationUserSummary | null {
  try {
    const profile = parseTrustedUserProfile(raw);
    if (
      profile.uid !== documentId ||
      !profile.tenantId ||
      !profile.facilityIds ||
      !profile.accountStatus
    )
      return null;
    return {
      uid: profile.uid,
      organizationId: profile.organizationId ?? null,
      facilityIds: profile.facilityIds,
      activeFacilityId: profile.activeFacilityId ?? null,
      accountStatus: profile.accountStatus,
    };
  } catch {
    return null;
  }
}

export interface AdministrationQueryService {
  directory(
    context: AdministrationContext,
  ): Promise<AdministrationResult<AdministrationDirectory>>;
  users(
    context: AdministrationContext,
    cursor?: string,
  ): Promise<
    AdministrationResult<AdministrationPage<AdministrationUserSummary>>
  >;
  user(
    context: AdministrationContext,
    uid: string,
  ): Promise<AdministrationResult<AdministrationUserDetail>>;
  features(
    context: AdministrationContext,
  ): Promise<AdministrationResult<AdministrationFeatureFlags>>;
  audit(
    context: AdministrationContext,
    cursor?: string,
  ): Promise<
    AdministrationResult<AdministrationPage<AdministrationAuditEntry>>
  >;
}

export function createAdministrationQueryService(
  repository: AdministrationRepository,
): AdministrationQueryService {
  async function trustedDirectory(context: AdministrationContext) {
    if (!parseContext(context)) return null;
    const raw = await repository.getTenantDirectory(context.tenantId);
    if (!raw) return null;
    const directory = parseTrustedTenantDirectory(raw);
    if (
      directory.status !== "active" ||
      directory.tenantId !== context.tenantId ||
      directory.platformId !== context.platformId
    )
      return null;
    return directory;
  }

  return {
    async directory(context) {
      try {
        const directory = await trustedDirectory(context);
        if (!directory) return fail("forbidden");
        const visible = filterDirectory(context.principal, directory);
        return {
          ok: true,
          value: { tenantId: directory.tenantId, ...visible },
        };
      } catch {
        return fail("provider_unavailable");
      }
    },
    async users(context, rawCursor) {
      const cursor =
        rawCursor === undefined
          ? null
          : provisioningIdentifierSchema.safeParse(rawCursor);
      if (cursor !== null && !cursor.success) return fail("invalid_request");
      try {
        const directory = await trustedDirectory(context);
        if (!directory) return fail("forbidden");
        const visible: {
          item: AdministrationUserSummary;
          cursor: string;
        }[] = [];
        let scanCursor = cursor === null ? null : cursor.data;
        let totalReads = 0;
        let mayHaveMore = false;
        while (
          visible.length <= ADMINISTRATION_PAGE_SIZE &&
          totalReads < ADMINISTRATION_TOTAL_READ_LIMIT
        ) {
          const batchLimit = Math.min(
            ADMINISTRATION_READ_LIMIT,
            ADMINISTRATION_TOTAL_READ_LIMIT - totalReads,
          );
          const documents = await repository.listUserProfiles(
            context.tenantId,
            scanCursor,
            batchLimit,
          );
          if (documents.length > batchLimit)
            return fail("provider_unavailable");
          totalReads += documents.length;
          for (const document of documents) {
            const item = summary(document.id, document.data);
            if (!item) return fail("provider_unavailable");
            const profile = parseTrustedUserProfile(document.data);
            if (profile.tenantId !== context.tenantId)
              return fail("provider_unavailable");
            if (
              context.principal.kind === "tenant_admin" &&
              (await repository.getAdministratorPrincipal(profile.uid))
            )
              continue;
            if (isProfileVisible(context.principal, profile))
              visible.push({ item, cursor: document.id });
            if (visible.length > ADMINISTRATION_PAGE_SIZE) break;
          }
          mayHaveMore = documents.length === batchLimit;
          if (
            visible.length > ADMINISTRATION_PAGE_SIZE ||
            !mayHaveMore ||
            documents.length === 0
          )
            break;
          scanCursor = documents.at(-1)?.id ?? null;
          if (!scanCursor) return fail("provider_unavailable");
        }
        if (totalReads > ADMINISTRATION_TOTAL_READ_LIMIT)
          return fail("provider_unavailable");
        const hasMore =
          visible.length > ADMINISTRATION_PAGE_SIZE || mayHaveMore;
        const returned = visible.slice(0, ADMINISTRATION_PAGE_SIZE);
        const items = returned.map(({ item }) => item);
        return {
          ok: true,
          value: {
            items,
            nextCursor: hasMore ? (returned.at(-1)?.cursor ?? null) : null,
          },
        };
      } catch {
        return fail("provider_unavailable");
      }
    },
    async user(context, rawUid) {
      const uid = provisioningIdentifierSchema.safeParse(rawUid);
      if (!uid.success) return fail("invalid_request");
      try {
        const directory = await trustedDirectory(context);
        if (!directory) return fail("forbidden");
        const raw = await repository.getUserProfile(uid.data);
        if (!raw) return fail("not_found");
        const profile = parseTrustedUserProfile(raw);
        if (
          profile.uid !== uid.data ||
          profile.tenantId !== context.tenantId ||
          !isProfileVisible(context.principal, profile)
        )
          return fail("not_found");
        if (
          context.principal.kind === "tenant_admin" &&
          (await repository.getAdministratorPrincipal(uid.data))
        )
          return fail("not_found");
        const item = summary(uid.data, raw);
        if (!item) return fail("provider_unavailable");
        const rawAssignments = await repository.listRoleAssignments(
          uid.data,
          context.tenantId,
        );
        if (rawAssignments.length >= ADMINISTRATION_READ_LIMIT)
          return fail("provider_unavailable");
        const roleAssignments: AdministrationRoleAssignment[] =
          rawAssignments.map((document) => {
            const assignment = parseTrustedRoleAssignment(document.data);
            if (
              assignment.uid !== uid.data ||
              assignment.tenantId !== context.tenantId ||
              !roleIds.includes(assignment.roleId as (typeof roleIds)[number])
            )
              throw new Error("Invalid assignment");
            return {
              assignmentId: document.id,
              roleId: assignment.roleId as (typeof roleIds)[number],
              scope: assignment.scope,
            };
          });
        return { ok: true, value: { ...item, roleAssignments } };
      } catch {
        return fail("provider_unavailable");
      }
    },
    async features(context) {
      try {
        const directory = await trustedDirectory(context);
        if (
          !directory ||
          !canReadFeatures(
            context.principal,
            context.tenantId,
            context.platformId,
          )
        )
          return fail("forbidden");
        if (!directory.featureFlags) return fail("provider_unavailable");
        return {
          ok: true,
          value: {
            tenantId: context.tenantId,
            featureFlags: directory.featureFlags,
          },
        };
      } catch {
        return fail("provider_unavailable");
      }
    },
    async audit(context, rawCursor) {
      const cursor =
        rawCursor === undefined
          ? null
          : provisioningIdentifierSchema.safeParse(rawCursor);
      if (cursor !== null && !cursor.success) return fail("invalid_request");
      try {
        const directory = await trustedDirectory(context);
        if (!directory) return fail("forbidden");
        const entries: {
          item: AdministrationAuditEntry;
          cursor: string;
        }[] = [];
        let scanCursor = cursor === null ? null : cursor.data;
        let totalReads = 0;
        let mayHaveMore = false;
        while (
          entries.length <= ADMINISTRATION_PAGE_SIZE &&
          totalReads < ADMINISTRATION_TOTAL_READ_LIMIT
        ) {
          const batchLimit = Math.min(
            ADMINISTRATION_READ_LIMIT,
            ADMINISTRATION_TOTAL_READ_LIMIT - totalReads,
          );
          const documents = await repository.listAuditEvents(
            context.tenantId,
            scanCursor,
            batchLimit,
          );
          if (documents.length > batchLimit)
            return fail("provider_unavailable");
          totalReads += documents.length;
          for (const document of documents) {
            const parsed = auditSchema.safeParse(document.data);
            if (
              !parsed.success ||
              parsed.data.eventId !== document.id ||
              parsed.data.tenantId !== context.tenantId ||
              parsed.data.actor.platformId !== context.platformId ||
              (parsed.data.actor.kind === "tenant_admin" &&
                parsed.data.actor.tenantId !== context.tenantId)
            )
              return fail("provider_unavailable");
            if (
              context.principal.kind === "tenant_admin" &&
              context.principal.scope === "restricted"
            ) {
              if (
                parsed.data.targetType === "facility" &&
                !context.principal.facilityIds.includes(parsed.data.targetId)
              )
                continue;
              if (parsed.data.targetType !== "facility") continue;
            }
            entries.push({
              cursor: document.id,
              item: {
                eventId: parsed.data.eventId,
                actorUid: parsed.data.actor.uid,
                action: parsed.data.action,
                targetType: parsed.data.targetType,
                targetId: parsed.data.targetId,
                timestamp: parsed.data.timestamp,
                metadata: sanitizeAuditMetadata(parsed.data.metadata),
              },
            });
            if (entries.length > ADMINISTRATION_PAGE_SIZE) break;
          }
          mayHaveMore = documents.length === batchLimit;
          if (
            entries.length > ADMINISTRATION_PAGE_SIZE ||
            !mayHaveMore ||
            documents.length === 0
          )
            break;
          scanCursor = documents.at(-1)?.id ?? null;
          if (!scanCursor) return fail("provider_unavailable");
        }
        const returned = entries.slice(0, ADMINISTRATION_PAGE_SIZE);
        const items = returned.map(({ item }) => item);
        return {
          ok: true,
          value: {
            items,
            nextCursor:
              entries.length > ADMINISTRATION_PAGE_SIZE || mayHaveMore
                ? (returned.at(-1)?.cursor ?? null)
                : null,
          },
        };
      } catch {
        return fail("provider_unavailable");
      }
    },
  };
}
