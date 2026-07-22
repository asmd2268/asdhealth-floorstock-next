import { ZodError, type ZodType } from "zod";

import type { AssignmentScopeRecord } from "@/domain/auth/types";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "@/services/firebase/trusted-session-records";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

import { createAuditEvent } from "./audit";
import { canAdministratorPerform } from "./authorization";
import {
  assignRoleSchema,
  createTenantSchema,
  replaceFeatureFlagsSchema,
  requestContextSchema,
  revokeRoleAssignmentSchema,
  setAccountStatusSchema,
  upsertFacilitySchema,
  upsertUserProfileSchema,
} from "./schemas";
import type {
  ProvisioningDocumentPath,
  ProvisioningStore,
  ProvisioningTransaction,
} from "./store";
import type {
  AdministratorPrincipal,
  AssignRoleInput,
  CreateTenantInput,
  ProvisioningFailureCode,
  ProvisioningRequestContext,
  ProvisioningResult,
  ReplaceFeatureFlagsInput,
  RevokeRoleAssignmentInput,
  SetAccountStatusInput,
  UpsertFacilityInput,
  UpsertUserProfileInput,
} from "./types";

class ProvisioningOperationError extends Error {
  constructor(readonly code: ProvisioningFailureCode) {
    super(code);
  }
}

const paths = {
  tenant: (tenantId: string) =>
    ["tenantDirectories", tenantId] as ProvisioningDocumentPath,
  profile: (uid: string) => ["userProfiles", uid] as ProvisioningDocumentPath,
  assignments: (uid: string) =>
    ["userRoleAssignments", uid, "assignments"] as ProvisioningDocumentPath,
  assignment: (uid: string, assignmentId: string) =>
    [
      "userRoleAssignments",
      uid,
      "assignments",
      assignmentId,
    ] as ProvisioningDocumentPath,
  audit: (eventId: string) =>
    ["provisioningAuditEvents", eventId] as ProvisioningDocumentPath,
};

function reject(code: ProvisioningFailureCode): never {
  throw new ProvisioningOperationError(code);
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function authorizeTenant(
  actor: AdministratorPrincipal,
  action: Parameters<typeof canAdministratorPerform>[1],
  tenantId: string,
): void {
  if (
    !canAdministratorPerform(actor, action, {
      tenantId,
      platformId: actor.platformId,
    })
  ) {
    reject("forbidden");
  }
}

function authorizeScope(
  actor: AdministratorPrincipal,
  scope: AssignmentScopeRecord,
): void {
  if (scope.platformId !== actor.platformId) reject("forbidden");
  if (actor.kind === "platform_owner") return;
  if (scope.kind === "platform") reject("forbidden");
  if (!actor.organizationIds.includes(scope.organizationId)) {
    reject("forbidden");
  }
  if (
    scope.kind === "facility" &&
    !actor.facilityIds.includes(scope.facilityId)
  ) {
    reject("forbidden");
  }
}

function ensureNoSelfAdministration(
  actor: AdministratorPrincipal,
  targetUid: string,
): void {
  if (actor.uid === targetUid) reject("forbidden");
}

function authorizeProfileMembership(
  actor: AdministratorPrincipal,
  profile: ReturnType<typeof parseTrustedUserProfile>,
): void {
  if (actor.kind !== "tenant_admin") return;
  if (
    !profile.organizationId ||
    !profile.facilityIds ||
    !actor.organizationIds.includes(profile.organizationId) ||
    profile.facilityIds.some(
      (facilityId) => !actor.facilityIds.includes(facilityId),
    )
  ) {
    reject("forbidden");
  }
  for (const override of profile.explicitPermissionOverrides ?? []) {
    authorizeScope(actor, override.scope);
  }
}

function validateScopeForProfile(
  scope: AssignmentScopeRecord,
  profile: ReturnType<typeof parseTrustedUserProfile>,
): void {
  if (scope.kind === "platform") return;
  if (
    !profile.organizationId ||
    profile.organizationId !== scope.organizationId
  ) {
    reject("invalid_request");
  }
  if (
    scope.kind === "facility" &&
    !profile.facilityIds?.includes(scope.facilityId)
  ) {
    reject("invalid_request");
  }
}

function validateScopeInTenant(
  scope: AssignmentScopeRecord,
  directory: ReturnType<typeof parseTrustedTenantDirectory>,
): void {
  if (scope.platformId !== directory.platformId) reject("invalid_request");
  if (scope.kind === "platform") return;

  if (
    !directory.organizations.some(
      (organization) => organization.id === scope.organizationId,
    )
  ) {
    reject("invalid_request");
  }

  if (scope.kind === "facility") {
    const facility = directory.facilities.find(
      (candidate) => candidate.id === scope.facilityId,
    );
    if (!facility || facility.organizationId !== scope.organizationId) {
      reject("invalid_request");
    }
  }
}

async function requireTenant(
  transaction: ProvisioningTransaction,
  tenantId: string,
) {
  const document = await transaction.get(paths.tenant(tenantId));
  if (!document) reject("not_found");
  const directory = parseTrustedTenantDirectory(document);
  if (directory.tenantId !== tenantId) reject("conflict");
  return directory;
}

async function requireProfile(
  transaction: ProvisioningTransaction,
  uid: string,
  tenantId: string,
) {
  const document = await transaction.get(paths.profile(uid));
  if (!document) reject("not_found");
  const profile = parseTrustedUserProfile(document);
  if (profile.uid !== uid || profile.tenantId !== tenantId) reject("conflict");
  return profile;
}

function requireActorPlatform(
  actor: AdministratorPrincipal,
  platformId: string,
): void {
  if (actor.platformId !== platformId) reject("forbidden");
}

function mapFailure(error: unknown): ProvisioningResult {
  if (error instanceof ProvisioningOperationError) {
    return { ok: false, code: error.code };
  }
  if (error instanceof ZodError) {
    return { ok: false, code: "invalid_request" };
  }
  return { ok: false, code: "provider_unavailable" };
}

export interface TrustedProvisioningService {
  createTenant(
    context: ProvisioningRequestContext,
    input: CreateTenantInput,
  ): Promise<ProvisioningResult>;
  upsertFacility(
    context: ProvisioningRequestContext,
    input: UpsertFacilityInput,
  ): Promise<ProvisioningResult>;
  upsertUserProfile(
    context: ProvisioningRequestContext,
    input: UpsertUserProfileInput,
  ): Promise<ProvisioningResult>;
  setAccountStatus(
    context: ProvisioningRequestContext,
    input: SetAccountStatusInput,
  ): Promise<ProvisioningResult>;
  assignRole(
    context: ProvisioningRequestContext,
    input: AssignRoleInput,
  ): Promise<ProvisioningResult>;
  revokeRoleAssignment(
    context: ProvisioningRequestContext,
    input: RevokeRoleAssignmentInput,
  ): Promise<ProvisioningResult>;
  replaceFeatureFlags(
    context: ProvisioningRequestContext,
    input: ReplaceFeatureFlagsInput,
  ): Promise<ProvisioningResult>;
}

export function createTrustedProvisioningService(
  store: ProvisioningStore,
  now: () => Date = () => new Date(),
): TrustedProvisioningService {
  async function execute<T>(
    contextValue: ProvisioningRequestContext,
    inputValue: T,
    schema: ZodType<T>,
    operation: (
      transaction: ProvisioningTransaction,
      context: ProvisioningRequestContext,
      input: T,
    ) => Promise<void>,
  ): Promise<ProvisioningResult> {
    try {
      const context = parse(requestContextSchema, contextValue);
      const input = parse(schema, inputValue);
      await store.runTransaction((transaction) =>
        operation(transaction, context, input),
      );
      return { ok: true };
    } catch (error) {
      return mapFailure(error);
    }
  }

  function appendAudit(
    transaction: ProvisioningTransaction,
    context: ProvisioningRequestContext,
    input: Parameters<typeof createAuditEvent>[1],
  ): void {
    const event = createAuditEvent(context, input, now);
    transaction.create(paths.audit(event.eventId), event);
  }

  return {
    createTenant: (context, input) =>
      execute(
        context,
        input,
        createTenantSchema,
        async (transaction, ctx, value) => {
          if (
            !canAdministratorPerform(ctx.actor, "create_tenant", {
              tenantId: value.tenantId,
              platformId: value.platformId,
            })
          ) {
            reject("forbidden");
          }
          if (await transaction.get(paths.tenant(value.tenantId))) {
            reject("conflict");
          }
          const directory = parseTrustedTenantDirectory({
            ...value,
            status: "active",
          });
          transaction.create(paths.tenant(value.tenantId), directory);
          appendAudit(transaction, ctx, {
            action: "create_tenant",
            targetType: "tenant",
            targetId: value.tenantId,
            tenantId: value.tenantId,
            metadata: { platformId: value.platformId },
          });
        },
      ),

    upsertFacility: (context, input) =>
      execute(
        context,
        input,
        upsertFacilitySchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "upsert_facility", value.tenantId);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);
          if (
            ctx.actor.kind === "tenant_admin" &&
            !ctx.actor.organizationIds.includes(value.facility.organizationId)
          ) {
            reject("forbidden");
          }
          if (
            !directory.organizations.some(
              (organization) =>
                organization.id === value.facility.organizationId,
            )
          ) {
            reject("invalid_request");
          }
          const facilities = [...directory.facilities];
          const index = facilities.findIndex(
            (facility) => facility.id === value.facility.id,
          );
          if (
            index >= 0 &&
            ctx.actor.kind === "tenant_admin" &&
            !ctx.actor.organizationIds.includes(
              facilities[index].organizationId,
            )
          ) {
            reject("forbidden");
          }
          if (
            index >= 0 &&
            facilities[index].organizationId !== value.facility.organizationId
          ) {
            reject("conflict");
          }
          if (index >= 0) facilities[index] = value.facility;
          else facilities.push(value.facility);
          const updated = parseTrustedTenantDirectory({
            ...directory,
            facilities,
          });
          transaction.set(paths.tenant(value.tenantId), updated);
          appendAudit(transaction, ctx, {
            action: "upsert_facility",
            targetType: "facility",
            targetId: value.facility.id,
            tenantId: value.tenantId,
            metadata: { organizationId: value.facility.organizationId },
          });
        },
      ),

    upsertUserProfile: (context, input) =>
      execute(
        context,
        input,
        upsertUserProfileSchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "upsert_user_profile", value.tenantId);
          ensureNoSelfAdministration(ctx.actor, value.uid);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);

          const existingDocument = await transaction.get(
            paths.profile(value.uid),
          );
          if (existingDocument) {
            const existing = parseTrustedUserProfile(existingDocument);
            if (
              existing.uid !== value.uid ||
              existing.tenantId !== value.tenantId
            ) {
              reject("conflict");
            }
            authorizeProfileMembership(ctx.actor, existing);
          }

          if (
            value.organizationId !== null &&
            !directory.organizations.some(
              (organization) => organization.id === value.organizationId,
            )
          ) {
            reject("invalid_request");
          }
          if (
            value.facilityIds.some((facilityId) => {
              const facility = directory.facilities.find(
                (candidate) => candidate.id === facilityId,
              );
              return (
                !facility ||
                (value.organizationId !== null &&
                  facility.organizationId !== value.organizationId)
              );
            })
          ) {
            reject("invalid_request");
          }
          if (
            value.activeFacilityId !== null &&
            !value.facilityIds.includes(value.activeFacilityId)
          ) {
            reject("invalid_request");
          }
          if (ctx.actor.kind === "tenant_admin") {
            const tenantAdministrator = ctx.actor;
            if (
              value.organizationId === null ||
              !tenantAdministrator.organizationIds.includes(
                value.organizationId,
              ) ||
              value.facilityIds.some(
                (facilityId) =>
                  !tenantAdministrator.facilityIds.includes(facilityId),
              )
            ) {
              reject("forbidden");
            }
          }
          for (const override of value.explicitPermissionOverrides) {
            authorizeScope(ctx.actor, override.scope);
            validateScopeInTenant(override.scope, directory);
          }

          const profile = parseTrustedUserProfile(value);
          if (existingDocument)
            transaction.set(paths.profile(value.uid), profile);
          else transaction.create(paths.profile(value.uid), profile);
          appendAudit(transaction, ctx, {
            action: "upsert_user_profile",
            targetType: "user_profile",
            targetId: value.uid,
            tenantId: value.tenantId,
            metadata: { accountStatus: value.accountStatus },
          });
        },
      ),

    setAccountStatus: (context, input) =>
      execute(
        context,
        input,
        setAccountStatusSchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "set_account_status", value.tenantId);
          ensureNoSelfAdministration(ctx.actor, value.uid);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);
          const profile = await requireProfile(
            transaction,
            value.uid,
            value.tenantId,
          );
          authorizeProfileMembership(ctx.actor, profile);
          transaction.set(paths.profile(value.uid), {
            ...profile,
            accountStatus: value.accountStatus,
          });
          appendAudit(transaction, ctx, {
            action: "set_account_status",
            targetType: "account",
            targetId: value.uid,
            tenantId: value.tenantId,
            metadata: { accountStatus: value.accountStatus },
          });
        },
      ),

    assignRole: (context, input) =>
      execute(
        context,
        input,
        assignRoleSchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "assign_role", value.tenantId);
          ensureNoSelfAdministration(ctx.actor, value.uid);
          authorizeScope(ctx.actor, value.scope);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);
          validateScopeInTenant(value.scope, directory);
          const profile = await requireProfile(
            transaction,
            value.uid,
            value.tenantId,
          );
          authorizeProfileMembership(ctx.actor, profile);
          validateScopeForProfile(value.scope, profile);

          const assignmentPath = paths.assignment(
            value.uid,
            value.assignmentId,
          );
          const existing = await transaction.get(assignmentPath);
          if (existing) {
            const current = parseTrustedRoleAssignment(existing);
            if (
              current.uid !== value.uid ||
              current.tenantId !== value.tenantId
            ) {
              reject("conflict");
            }
            authorizeScope(ctx.actor, current.scope);
            validateScopeInTenant(current.scope, directory);
          } else {
            const assignments = await transaction.query(
              paths.assignments(value.uid),
              [
                { field: "uid", value: value.uid },
                { field: "tenantId", value: value.tenantId },
              ],
              trustedSessionLimits.roleAssignments,
            );
            if (assignments.length >= trustedSessionLimits.roleAssignments) {
              reject("conflict");
            }
          }
          const assignment = parseTrustedRoleAssignment({
            uid: value.uid,
            tenantId: value.tenantId,
            roleId: value.roleId,
            scope: value.scope,
          });
          if (existing) transaction.set(assignmentPath, assignment);
          else transaction.create(assignmentPath, assignment);
          appendAudit(transaction, ctx, {
            action: "assign_role",
            targetType: "role_assignment",
            targetId: value.assignmentId,
            tenantId: value.tenantId,
            metadata: { uid: value.uid, roleId: value.roleId },
          });
        },
      ),

    revokeRoleAssignment: (context, input) =>
      execute(
        context,
        input,
        revokeRoleAssignmentSchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "revoke_role_assignment", value.tenantId);
          ensureNoSelfAdministration(ctx.actor, value.uid);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);
          const assignmentPath = paths.assignment(
            value.uid,
            value.assignmentId,
          );
          const document = await transaction.get(assignmentPath);
          if (!document) reject("not_found");
          const assignment = parseTrustedRoleAssignment(document);
          if (
            assignment.uid !== value.uid ||
            assignment.tenantId !== value.tenantId
          ) {
            reject("conflict");
          }
          const profile = await requireProfile(
            transaction,
            value.uid,
            value.tenantId,
          );
          authorizeProfileMembership(ctx.actor, profile);
          authorizeScope(ctx.actor, assignment.scope);
          validateScopeInTenant(assignment.scope, directory);
          transaction.delete(assignmentPath);
          appendAudit(transaction, ctx, {
            action: "revoke_role_assignment",
            targetType: "role_assignment",
            targetId: value.assignmentId,
            tenantId: value.tenantId,
            metadata: { uid: value.uid, roleId: assignment.roleId },
          });
        },
      ),

    replaceFeatureFlags: (context, input) =>
      execute(
        context,
        input,
        replaceFeatureFlagsSchema,
        async (transaction, ctx, value) => {
          authorizeTenant(ctx.actor, "replace_feature_flags", value.tenantId);
          const directory = await requireTenant(transaction, value.tenantId);
          requireActorPlatform(ctx.actor, directory.platformId);
          transaction.set(paths.tenant(value.tenantId), {
            ...directory,
            featureFlags: value.featureFlags,
          });
          appendAudit(transaction, ctx, {
            action: "replace_feature_flags",
            targetType: "feature_flags",
            targetId: value.tenantId,
            tenantId: value.tenantId,
          });
        },
      ),
  };
}
