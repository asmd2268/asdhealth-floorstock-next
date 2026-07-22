import { describe, expect, it } from "vitest";

import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

import type {
  ProvisioningDocumentPath,
  ProvisioningStore,
  ProvisioningTransaction,
} from "./store";
import { createTrustedProvisioningService } from "./service";
import type {
  AdministratorPrincipal,
  AssignRoleInput,
  ProvisioningRequestContext,
} from "./types";
import { sanitizeAuditMetadata } from "./audit";

const featureFlags = {
  announcements: true,
  zebra_labels: true,
  new_request: false,
  controlled_medicines: false,
} as const;

const tenantDirectory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [{ id: "facility-1", organizationId: "organization-1" }],
  featureFlags,
} as const;

const userProfile = {
  uid: "user-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
} as const;

const roleAssignment = {
  assignmentId: "assignment-1",
  uid: "user-1",
  tenantId: "tenant-1",
  roleId: "pharmacy_manager",
  scope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
} as const;

const platformOwner: AdministratorPrincipal = {
  kind: "platform_owner",
  uid: "owner-1",
  platformId: "platform-1",
};

const tenantAdministrator: AdministratorPrincipal = {
  kind: "tenant_admin",
  scope: "restricted",
  uid: "tenant-admin-1",
  platformId: "platform-1",
  tenantId: "tenant-1",
  organizationIds: ["organization-1"],
  facilityIds: ["facility-1"],
};

const unrestrictedTenantAdministrator: AdministratorPrincipal = {
  kind: "tenant_admin",
  scope: "unrestricted",
  uid: "tenant-admin-unrestricted",
  platformId: "platform-1",
  tenantId: "tenant-1",
};

function key(path: ProvisioningDocumentPath) {
  return path.join("/");
}

class MemoryProvisioningStore implements ProvisioningStore {
  documents = new Map<string, unknown>();
  transactions = 0;
  failAudit = false;

  constructor(entries: readonly [string, unknown][] = []) {
    this.documents = new Map(entries);
  }

  async runTransaction<T>(
    operation: (transaction: ProvisioningTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    const pending = new Map(this.documents);
    const transaction: ProvisioningTransaction = {
      get: async (path) => pending.get(key(path)) ?? null,
      query: async (path, filters, maxResults) => {
        const prefix = key(path) + "/";
        return [...pending.entries()]
          .filter(([documentPath]) => documentPath.startsWith(prefix))
          .map(([, document]) => document)
          .filter((document) =>
            filters.every(
              (filter) =>
                (document as Record<string, unknown>)[filter.field] ===
                filter.value,
            ),
          )
          .slice(0, maxResults);
      },
      create: (path, data) => {
        const documentPath = key(path);
        if (
          pending.has(documentPath) ||
          (this.failAudit &&
            documentPath.startsWith("provisioningAuditEvents/"))
        ) {
          throw new Error("create failed");
        }
        pending.set(documentPath, data);
      },
      set: (path, data) => pending.set(key(path), data),
      delete: (path) => pending.delete(key(path)),
    };
    const result = await operation(transaction);
    this.documents = pending;
    return result;
  }
}

function context(
  actor: AdministratorPrincipal = platformOwner,
  requestId = "request-1",
): ProvisioningRequestContext {
  return { actor, requestId };
}

function seededStore() {
  return new MemoryProvisioningStore([
    ["tenantDirectories/tenant-1", tenantDirectory],
    ["userProfiles/user-1", userProfile],
  ]);
}

function createService(
  store: ProvisioningStore,
  now: () => Date = () => new Date("2026-07-22T00:00:00.000Z"),
  auditIdGenerator?: () => string,
) {
  let auditSequence = 0;
  return createTrustedProvisioningService(
    store,
    now,
    auditIdGenerator ?? (() => `audit-${++auditSequence}`),
  );
}

describe("trusted provisioning service", () => {
  it("allows a platform owner to create a tenant and atomically audits it", async () => {
    const store = new MemoryProvisioningStore();
    const service = createService(store);

    await expect(
      service.createTenant(context(), {
        tenantId: "tenant-new",
        platformId: "platform-1",
        organizations: [{ id: "organization-new" }],
        facilities: [
          { id: "facility-new", organizationId: "organization-new" },
        ],
        featureFlags,
      }),
    ).resolves.toEqual({ ok: true });

    expect(store.documents.get("tenantDirectories/tenant-new")).toMatchObject({
      tenantId: "tenant-new",
      status: "active",
    });
    expect(
      store.documents.get("provisioningAuditEvents/audit-1"),
    ).toMatchObject({
      eventId: "audit-1",
      requestId: "request-1",
      actor: platformOwner,
      action: "create_tenant",
      targetId: "tenant-new",
      timestamp: "2026-07-22T00:00:00.000Z",
    });
  });

  it("allows a tenant administrator to update the same tenant", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);

    await expect(
      service.upsertFacility(context(tenantAdministrator), {
        tenantId: "tenant-1",
        facility: {
          id: "facility-2",
          organizationId: "organization-1",
        },
      }),
    ).resolves.toEqual({ ok: true });

    expect(
      (
        store.documents.get("tenantDirectories/tenant-1") as {
          facilities: { id: string }[];
        }
      ).facilities.map((facility) => facility.id),
    ).toEqual(["facility-1", "facility-2"]);

    await expect(
      service.upsertFacility(context(tenantAdministrator, "update-existing"), {
        tenantId: "tenant-1",
        facility: tenantDirectory.facilities[0],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("returns a safe denial for missing or malformed tenant-admin directories", async () => {
    for (const tenantDocument of [
      null,
      { tenantId: "tenant-1", status: "active" },
    ]) {
      const store = seededStore();
      if (tenantDocument === null) {
        store.documents.delete("tenantDirectories/tenant-1");
      } else {
        store.documents.set("tenantDirectories/tenant-1", tenantDocument);
      }
      const before = new Map(store.documents);

      await expect(
        createService(store).upsertFacility(context(tenantAdministrator), {
          tenantId: "tenant-1",
          facility: tenantDirectory.facilities[0],
        }),
      ).resolves.toEqual({ ok: false, code: "forbidden" });
      expect(store.documents).toEqual(before);
    }
  });

  it("denies tenant creation by a tenant administrator", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);
    const before = new Map(store.documents);

    const result = await service.createTenant(context(tenantAdministrator), {
      tenantId: "tenant-new",
      platformId: "platform-1",
      organizations: [{ id: "organization-new" }],
      facilities: [{ id: "facility-new", organizationId: "organization-new" }],
      featureFlags,
    });

    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(store.documents).toEqual(before);
  });

  it("denies cross-tenant mutations without partial writes", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);
    const before = new Map(store.documents);

    const result = await service.replaceFeatureFlags(
      context(tenantAdministrator),
      {
        tenantId: "tenant-other",
        featureFlags,
      },
    );

    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(store.documents).toEqual(before);
  });

  it("denies self-activation and self-role assignment", async () => {
    const actor = { ...tenantAdministrator, uid: "user-1" } as const;
    const store = seededStore();
    const service = createTrustedProvisioningService(store);

    await expect(
      service.setAccountStatus(context(actor, "request-account"), {
        uid: "user-1",
        tenantId: "tenant-1",
        accountStatus: "active",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    await expect(
      service.assignRole(context(actor, "request-role"), roleAssignment),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(
      [...store.documents.keys()].some((path) =>
        path.startsWith("provisioningAuditEvents/"),
      ),
    ).toBe(false);
  });

  it("rejects unknown roles and invalid facility scopes before writing", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);
    const unknownRole = {
      ...roleAssignment,
      roleId: "administrator",
    } as unknown as AssignRoleInput;
    const invalidScope = {
      ...roleAssignment,
      assignmentId: "assignment-2",
      scope: { ...roleAssignment.scope, facilityId: "facility-missing" },
    };

    await expect(
      service.assignRole(
        context(platformOwner, "request-unknown"),
        unknownRole,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(store.transactions).toBe(0);
    await expect(
      service.assignRole(context(platformOwner, "request-scope"), invalidScope),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(
      [...store.documents.keys()].some((path) =>
        path.startsWith("provisioningAuditEvents/"),
      ),
    ).toBe(false);
  });

  it("does not silently create a missing parent tenant or profile", async () => {
    const store = new MemoryProvisioningStore();
    const service = createTrustedProvisioningService(store);

    await expect(
      service.upsertFacility(context(), {
        tenantId: "tenant-missing",
        facility: {
          id: "facility-1",
          organizationId: "organization-1",
        },
      }),
    ).resolves.toEqual({ ok: false, code: "not_found" });
    store.documents.set("tenantDirectories/tenant-1", tenantDirectory);
    await expect(
      service.assignRole(context(), roleAssignment),
    ).resolves.toEqual({ ok: false, code: "not_found" });
    expect(
      [...store.documents.keys()].filter((path) =>
        path.startsWith("provisioningAuditEvents/"),
      ),
    ).toEqual([]);
  });

  it("prevents tenant administrators from assigning platform-wide roles", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);

    const result = await service.assignRole(context(tenantAdministrator), {
      ...roleAssignment,
      scope: { kind: "platform", platformId: "platform-1" },
    });

    expect(result).toEqual({ ok: false, code: "forbidden" });
  });

  it("prevents tenant administrators from replacing an existing out-of-scope role", async () => {
    const store = seededStore();
    store.documents.set("userRoleAssignments/user-1/assignments/assignment-1", {
      uid: "user-1",
      tenantId: "tenant-1",
      roleId: "master",
      scope: { kind: "platform", platformId: "platform-1" },
    });
    const service = createTrustedProvisioningService(store);

    const result = await service.assignRole(
      context(tenantAdministrator),
      roleAssignment,
    );

    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(
      store.documents.get(
        "userRoleAssignments/user-1/assignments/assignment-1",
      ),
    ).toMatchObject({ roleId: "master" });
  });

  it("enforces the trusted-session role assignment limit", async () => {
    const store = seededStore();
    for (
      let index = 0;
      index < trustedSessionLimits.roleAssignments;
      index += 1
    ) {
      store.documents.set(
        "userRoleAssignments/user-1/assignments/assignment-" + index,
        {
          uid: "user-1",
          tenantId: "tenant-1",
          roleId: "pharmacy_staff",
          scope: roleAssignment.scope,
        },
      );
    }
    const service = createTrustedProvisioningService(store);

    const result = await service.assignRole(context(), {
      ...roleAssignment,
      assignmentId: "assignment-overflow",
    });

    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(
      store.documents.has(
        "userRoleAssignments/user-1/assignments/assignment-overflow",
      ),
    ).toBe(false);
  });

  it("preserves immutable profile identity fields", async () => {
    const store = seededStore();
    store.documents.set("tenantDirectories/tenant-2", {
      ...tenantDirectory,
      tenantId: "tenant-2",
    });
    const service = createTrustedProvisioningService(store);

    const result = await service.upsertUserProfile(context(), {
      ...userProfile,
      tenantId: "tenant-2",
    });

    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(store.documents.get("userProfiles/user-1")).toEqual(userProfile);
  });

  it("supports profile, account, role, revoke, and feature-flag operations", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);

    expect(
      await service.upsertUserProfile(
        context(platformOwner, "request-profile"),
        {
          ...userProfile,
          uid: "user-2",
        },
      ),
    ).toEqual({ ok: true });
    expect(
      await service.setAccountStatus(context(platformOwner, "request-status"), {
        uid: "user-2",
        tenantId: "tenant-1",
        accountStatus: "disabled",
      }),
    ).toEqual({ ok: true });
    expect(
      await service.assignRole(context(platformOwner, "request-assign"), {
        ...roleAssignment,
        uid: "user-2",
      }),
    ).toEqual({ ok: true });
    expect(
      await service.revokeRoleAssignment(
        context(platformOwner, "request-revoke"),
        {
          assignmentId: "assignment-1",
          uid: "user-2",
          tenantId: "tenant-1",
        },
      ),
    ).toEqual({ ok: true });
    expect(
      await service.replaceFeatureFlags(
        context(platformOwner, "request-flags"),
        {
          tenantId: "tenant-1",
          featureFlags: { ...featureFlags, announcements: false },
        },
      ),
    ).toEqual({ ok: true });

    expect(store.documents.has("userProfiles/user-2")).toBe(true);
    expect(
      store.documents.has(
        "userRoleAssignments/user-2/assignments/assignment-1",
      ),
    ).toBe(false);
    expect(
      (
        store.documents.get(
          "tenantDirectories/tenant-1",
        ) as typeof tenantDirectory
      ).featureFlags.announcements,
    ).toBe(false);
  });

  it("rolls back the entire transaction when audit persistence fails", async () => {
    const store = seededStore();
    store.failAudit = true;
    const before = new Map(store.documents);
    const service = createTrustedProvisioningService(store);

    const result = await service.setAccountStatus(context(), {
      uid: "user-1",
      tenantId: "tenant-1",
      accountStatus: "disabled",
    });

    expect(result).toEqual({ ok: false, code: "provider_unavailable" });
    expect(store.documents).toEqual(before);
  });

  it("handles duplicate requests only inside the same actor and tenant namespace", async () => {
    const store = seededStore();
    const service = createTrustedProvisioningService(store);

    expect(
      await service.setAccountStatus(context(), {
        uid: "user-1",
        tenantId: "tenant-1",
        accountStatus: "disabled",
      }),
    ).toEqual({ ok: true });
    const snapshot = new Map(store.documents);
    expect(
      await service.setAccountStatus(context(), {
        uid: "user-1",
        tenantId: "tenant-1",
        accountStatus: "active",
      }),
    ).toEqual({ ok: false, code: "conflict" });
    expect(store.documents).toEqual(snapshot);
  });

  it("isolates equal request IDs across tenants and actors", async () => {
    const secondTenant = {
      ...tenantDirectory,
      tenantId: "tenant-2",
      organizations: [{ id: "organization-2" }],
      facilities: [{ id: "facility-2", organizationId: "organization-2" }],
    };
    const store = seededStore();
    store.documents.set("tenantDirectories/tenant-2", secondTenant);
    store.documents.set("userProfiles/user-2", {
      ...userProfile,
      uid: "user-2",
    });
    const service = createService(store);

    expect(
      await service.replaceFeatureFlags(context(platformOwner, "shared-id"), {
        tenantId: "tenant-1",
        featureFlags: { ...featureFlags, announcements: false },
      }),
    ).toEqual({ ok: true });
    expect(
      await service.replaceFeatureFlags(context(platformOwner, "shared-id"), {
        tenantId: "tenant-2",
        featureFlags: { ...featureFlags, zebra_labels: false },
      }),
    ).toEqual({ ok: true });
    expect(
      await service.setAccountStatus(
        context(unrestrictedTenantAdministrator, "actor-shared-id"),
        {
          uid: "user-1",
          tenantId: "tenant-1",
          accountStatus: "disabled",
        },
      ),
    ).toEqual({ ok: true });
    expect(
      await service.setAccountStatus(
        context(platformOwner, "actor-shared-id"),
        {
          uid: "user-2",
          tenantId: "tenant-1",
          accountStatus: "disabled",
        },
      ),
    ).toEqual({ ok: true });

    const audits = [...store.documents.entries()].filter(([path]) =>
      path.startsWith("provisioningAuditEvents/"),
    );
    expect(audits).toHaveLength(4);
    expect(audits.map(([path]) => path)).not.toContain(
      "provisioningAuditEvents/shared-id",
    );
    expect(audits.map(([, event]) => event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: "shared-id" }),
        expect.objectContaining({ requestId: "actor-shared-id" }),
      ]),
    );
  });

  it("enforces the explicit restricted and unrestricted tenant-admin scopes", async () => {
    const directoryWithSecondOrganization = {
      ...tenantDirectory,
      organizations: [{ id: "organization-1" }, { id: "organization-2" }],
      facilities: [
        ...tenantDirectory.facilities,
        { id: "facility-other", organizationId: "organization-2" },
      ],
    };
    const store = seededStore();
    store.documents.set(
      "tenantDirectories/tenant-1",
      directoryWithSecondOrganization,
    );
    const service = createService(store);

    expect(
      await service.replaceFeatureFlags(
        context(tenantAdministrator, "restricted-flags"),
        { tenantId: "tenant-1", featureFlags },
      ),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await service.replaceFeatureFlags(
        context(unrestrictedTenantAdministrator, "unrestricted-flags"),
        { tenantId: "tenant-1", featureFlags },
      ),
    ).toEqual({ ok: true });
    expect(
      await service.upsertFacility(
        context(tenantAdministrator, "unauthorized-organization"),
        {
          tenantId: "tenant-1",
          facility: {
            id: "facility-new-other",
            organizationId: "organization-2",
          },
        },
      ),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await service.upsertFacility(
        context(tenantAdministrator, "unauthorized-facility"),
        {
          tenantId: "tenant-1",
          facility: {
            id: "facility-other",
            organizationId: "organization-2",
          },
        },
      ),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await service.upsertFacility(
        context(tenantAdministrator, "create-in-allowed-organization"),
        {
          tenantId: "tenant-1",
          facility: {
            id: "facility-new",
            organizationId: "organization-1",
          },
        },
      ),
    ).toEqual({ ok: true });
    expect(
      await service.upsertFacility(
        context(tenantAdministrator, "new-facility-not-auto-assigned"),
        {
          tenantId: "tenant-1",
          facility: {
            id: "facility-new",
            organizationId: "organization-1",
          },
        },
      ),
    ).toEqual({ ok: false, code: "forbidden" });
  });

  it("denies every tenant-admin operation when the trusted tenant is inactive", async () => {
    type Scenario = {
      name: string;
      run: (
        service: ReturnType<typeof createService>,
        requestId: string,
      ) => Promise<unknown>;
    };
    const scenarios: Scenario[] = [
      {
        name: "facility upsert",
        run: (service, requestId) =>
          service.upsertFacility(
            context(unrestrictedTenantAdministrator, requestId),
            {
              tenantId: "tenant-1",
              facility: tenantDirectory.facilities[0],
            },
          ),
      },
      {
        name: "profile upsert",
        run: (service, requestId) =>
          service.upsertUserProfile(
            context(unrestrictedTenantAdministrator, requestId),
            { ...userProfile, uid: "user-2" },
          ),
      },
      {
        name: "account status",
        run: (service, requestId) =>
          service.setAccountStatus(
            context(unrestrictedTenantAdministrator, requestId),
            {
              uid: "user-1",
              tenantId: "tenant-1",
              accountStatus: "disabled",
            },
          ),
      },
      {
        name: "role assignment",
        run: (service, requestId) =>
          service.assignRole(
            context(unrestrictedTenantAdministrator, requestId),
            roleAssignment,
          ),
      },
      {
        name: "role revocation",
        run: (service, requestId) =>
          service.revokeRoleAssignment(
            context(unrestrictedTenantAdministrator, requestId),
            {
              uid: "user-1",
              tenantId: "tenant-1",
              assignmentId: "assignment-1",
            },
          ),
      },
      {
        name: "feature flag replacement",
        run: (service, requestId) =>
          service.replaceFeatureFlags(
            context(unrestrictedTenantAdministrator, requestId),
            { tenantId: "tenant-1", featureFlags },
          ),
      },
    ];

    for (const scenario of scenarios) {
      const store = seededStore();
      store.documents.set("tenantDirectories/tenant-1", {
        ...tenantDirectory,
        status: "inactive",
      });
      store.documents.set(
        "userRoleAssignments/user-1/assignments/assignment-1",
        roleAssignment,
      );
      const before = new Map(store.documents);
      const result = await scenario.run(
        createService(store),
        `inactive-${scenario.name.replaceAll(" ", "-")}`,
      );

      expect(result, scenario.name).toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(store.documents, scenario.name).toEqual(before);
    }
  });

  it("keeps platform-owner authority over inactive tenants explicit", async () => {
    const store = seededStore();
    store.documents.set("tenantDirectories/tenant-1", {
      ...tenantDirectory,
      status: "inactive",
    });
    const service = createService(store);

    expect(
      await service.replaceFeatureFlags(context(platformOwner), {
        tenantId: "tenant-1",
        featureFlags: { ...featureFlags, announcements: false },
      }),
    ).toEqual({ ok: true });
  });

  it("sanitizes audit metadata and excludes secret-bearing fields", () => {
    expect(
      sanitizeAuditMetadata({
        roleId: "master",
        count: 2,
        enabled: true,
        password: "do-not-record",
        accessToken: "do-not-record",
        privateKey: "do-not-record",
        rawCredential: { secret: "do-not-record" },
      }),
    ).toEqual({
      roleId: "master",
      count: 2,
      enabled: true,
    });
  });

  it("rejects secret-bearing values and keeps audit metadata bounded and deterministic", () => {
    expect(
      sanitizeAuditMetadata({
        ordinary: "ordinary operational note",
        accessValue: "access_token=abcdefghijklmnop",
        refreshValue: "refresh token: abcdefghijklmnop",
        credentialValue: "credentials are abcdefghijklmnop",
      }),
    ).toEqual({ ordinary: "ordinary operational note" });

    const metadata = sanitizeAuditMetadata({
      authText: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      tokenText: "bearer abcdefghijklmnopqrstuvwxyz",
      keyText: "-----BEGIN PRIVATE KEY----- secret -----END PRIVATE KEY-----",
      cookieText: "session_token=abcdefghijklmnop",
      passwordText: "password: do-not-record",
      nested: { safe: "but nested" },
      stack: new Error("provider detail"),
      ...Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `safe${String(index).padStart(2, "0")}`,
          "x".repeat(200),
        ]),
      ),
    });

    expect(metadata).not.toHaveProperty("authText");
    expect(metadata).not.toHaveProperty("tokenText");
    expect(metadata).not.toHaveProperty("keyText");
    expect(metadata).not.toHaveProperty("cookieText");
    expect(metadata).not.toHaveProperty("passwordText");
    expect(metadata).not.toHaveProperty("nested");
    expect(metadata).not.toHaveProperty("stack");
    expect(Object.keys(metadata)).toEqual([...Object.keys(metadata)].sort());
    expect(Object.keys(metadata)).toHaveLength(20);
    expect(
      Object.values(metadata).every(
        (value) => typeof value !== "string" || value.length <= 128,
      ),
    ).toBe(true);
  });
});
