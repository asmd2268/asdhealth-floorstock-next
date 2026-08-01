import { describe, expect, it, vi } from "vitest";

import type { AdministrationContext } from "@/domain/administration/types";
import type {
  AdministrationRepository,
  RawAdministrationDocument,
} from "./repository";
import { createAdministrationQueryService } from "./service";

const flags = {
  announcements: true,
  zebra_labels: false,
  new_request: true,
  controlled_medicines: false,
};
const directory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "org-1" }, { id: "org-2" }],
  facilities: [
    { id: "fac-1", organizationId: "org-1", displayName: "One" },
    { id: "fac-2", organizationId: "org-2" },
  ],
  departments: [
    {
      id: "dept-1",
      organizationId: "org-1",
      facilityId: "fac-1",
      displayName: "Emergency",
    },
    { id: "dept-2", organizationId: "org-2", facilityId: "fac-2" },
  ],
  featureFlags: flags,
};
const profile = (
  uid: string,
  organizationId = "org-1",
  facilityIds = ["fac-1"],
) => ({
  uid,
  tenantId: "tenant-1",
  organizationId,
  facilityIds,
  activeFacilityId: facilityIds[0],
  accountStatus: "active",
  explicitPermissionOverrides: [],
});
const owner = {
  kind: "platform_owner",
  uid: "owner-1",
  platformId: "platform-1",
} as const;
const restricted = {
  kind: "tenant_admin",
  scope: "restricted",
  uid: "admin-1",
  platformId: "platform-1",
  tenantId: "tenant-1",
  organizationIds: ["org-1"],
  facilityIds: ["fac-1"],
} as const;
const ownerContext: AdministrationContext = {
  principal: owner,
  tenantId: "tenant-1",
  platformId: "platform-1",
  sessionUid: "owner-1",
};
const restrictedContext: AdministrationContext = {
  principal: restricted,
  tenantId: "tenant-1",
  platformId: "platform-1",
  sessionUid: "admin-1",
};

function repository(
  overrides: Partial<AdministrationRepository> = {},
): AdministrationRepository {
  return {
    getTenantDirectory: vi.fn().mockResolvedValue(directory),
    getUserProfile: vi.fn((uid: string) => Promise.resolve(profile(uid))),
    getAdministratorPrincipal: vi.fn().mockResolvedValue(null),
    listUserProfiles: vi
      .fn()
      .mockResolvedValue([{ id: "user-1", data: profile("user-1") }]),
    listRoleAssignments: vi.fn().mockResolvedValue([
      {
        id: "assignment-1",
        data: {
          uid: "user-1",
          tenantId: "tenant-1",
          roleId: "pharmacy_manager",
          scope: {
            kind: "facility",
            platformId: "platform-1",
            organizationId: "org-1",
            facilityId: "fac-1",
          },
        },
      },
    ]),
    listAuditEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("administration query service", () => {
  it("returns a bounded, deterministic user directory without identity provider metadata", async () => {
    const repo = repository();
    const result =
      await createAdministrationQueryService(repo).users(ownerContext);
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            uid: "user-1",
            organizationId: "org-1",
            facilityIds: ["fac-1"],
            activeFacilityId: "fac-1",
            departmentIds: [],
            activeDepartmentId: null,
            accountStatus: "active",
          },
        ],
        nextCursor: null,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /email|token|session|provider/iu,
    );
    expect(repo.listUserProfiles).toHaveBeenCalledWith("tenant-1", null, 51);
  });

  it("filters restricted users, organizations, and facilities without leaking out-of-scope records", async () => {
    const repo = repository({
      listUserProfiles: vi.fn().mockResolvedValue([
        { id: "allowed", data: profile("allowed") },
        { id: "denied", data: profile("denied", "org-2", ["fac-2"]) },
      ]),
    });
    const service = createAdministrationQueryService(repo);
    const users = await service.users(restrictedContext);
    const visibleDirectory = await service.directory(restrictedContext);
    expect(users).toMatchObject({
      ok: true,
      value: { items: [{ uid: "allowed" }] },
    });
    expect(visibleDirectory).toEqual({
      ok: true,
      value: {
        tenantId: "tenant-1",
        organizations: [{ id: "org-1" }],
        facilities: [
          { id: "fac-1", organizationId: "org-1", displayName: "One" },
        ],
        departments: [
          {
            id: "dept-1",
            organizationId: "org-1",
            facilityId: "fac-1",
            displayName: "Emergency",
          },
        ],
      },
    });
  });

  it("does not enumerate administrator targets to tenant administrators", async () => {
    const repo = repository({
      getAdministratorPrincipal: vi.fn((uid: string) =>
        Promise.resolve(
          uid === "admin-target" ? { kind: "platform_owner" } : null,
        ),
      ),
      getUserProfile: vi.fn().mockResolvedValue(profile("admin-target")),
      listUserProfiles: vi
        .fn()
        .mockResolvedValue([
          { id: "admin-target", data: profile("admin-target") },
        ]),
    });
    const service = createAdministrationQueryService(repo);
    await expect(service.users(restrictedContext)).resolves.toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
    await expect(
      service.user(restrictedContext, "admin-target"),
    ).resolves.toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("fails closed for malformed, inactive, mismatched, or missing tenant directories", async () => {
    for (const value of [
      null,
      { ...directory, status: "inactive" },
      { ...directory, tenantId: "tenant-2" },
      { ...directory, platformId: "platform-2" },
      { tenantId: "tenant-1" },
    ]) {
      const result = await createAdministrationQueryService(
        repository({ getTenantDirectory: vi.fn().mockResolvedValue(value) }),
      ).users(ownerContext);
      expect(result.ok).toBe(false);
    }
  });

  it("denies restricted feature reads and rejects malformed or incomplete flags", async () => {
    await expect(
      createAdministrationQueryService(repository()).features(
        restrictedContext,
      ),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    const result = await createAdministrationQueryService(
      repository({
        getTenantDirectory: vi.fn().mockResolvedValue({
          ...directory,
          featureFlags: { announcements: true },
        }),
      }),
    ).features(ownerContext);
    expect(result).toEqual({ ok: false, code: "provider_unavailable" });
  });

  it("rejects malformed cursors, cross-tenant documents, malformed assignments, and excessive reads", async () => {
    const service = createAdministrationQueryService(repository());
    await expect(service.users(ownerContext, " ../bad")).resolves.toEqual({
      ok: false,
      code: "invalid_request",
    });
    const crossTenant = createAdministrationQueryService(
      repository({
        listUserProfiles: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            data: { ...profile("user-1"), tenantId: "tenant-2" },
          },
        ]),
      }),
    );
    await expect(crossTenant.users(ownerContext)).resolves.toEqual({
      ok: false,
      code: "provider_unavailable",
    });
    const malformedRoles = createAdministrationQueryService(
      repository({
        listRoleAssignments: vi.fn().mockResolvedValue([
          {
            id: "assignment-1",
            data: {
              uid: "user-1",
              tenantId: "tenant-1",
              roleId: "unknown",
              scope: { kind: "platform", platformId: "platform-1" },
            },
          },
        ]),
      }),
    );
    await expect(malformedRoles.user(ownerContext, "user-1")).resolves.toEqual({
      ok: false,
      code: "provider_unavailable",
    });
    const excessive: RawAdministrationDocument[] = Array.from(
      { length: 52 },
      (_, index) => ({ id: `user-${index}`, data: profile(`user-${index}`) }),
    );
    await expect(
      createAdministrationQueryService(
        repository({ listUserProfiles: vi.fn().mockResolvedValue(excessive) }),
      ).users(ownerContext),
    ).resolves.toEqual({ ok: false, code: "provider_unavailable" });
  });

  it("uses the last returned record as the bounded continuation cursor", async () => {
    const documents: RawAdministrationDocument[] = Array.from(
      { length: 26 },
      (_, index) => ({
        id: `user-${String(index).padStart(2, "0")}`,
        data: profile(`user-${String(index).padStart(2, "0")}`),
      }),
    );
    const result = await createAdministrationQueryService(
      repository({
        listUserProfiles: vi.fn().mockResolvedValue(documents),
      }),
    ).users(ownerContext);
    expect(result).toMatchObject({
      ok: true,
      value: { items: { length: 25 }, nextCursor: "user-24" },
    });
  });

  it("never returns a hidden administrator or out-of-scope UID as a continuation cursor", async () => {
    const visible = Array.from({ length: 25 }, (_, index) => ({
      id: `allowed-${String(index).padStart(2, "0")}`,
      data: profile(`allowed-${String(index).padStart(2, "0")}`),
    }));
    const hidden = Array.from({ length: 26 }, (_, index) => ({
      id: `hidden-admin-${String(index).padStart(2, "0")}`,
      data: profile(`hidden-admin-${String(index).padStart(2, "0")}`),
    }));
    const repo = repository({
      getAdministratorPrincipal: vi.fn((uid: string) =>
        Promise.resolve(uid.startsWith("hidden-admin-") ? { uid } : null),
      ),
      listUserProfiles: vi.fn().mockResolvedValue([...visible, ...hidden]),
    });
    const result =
      await createAdministrationQueryService(repo).users(restrictedContext);
    expect(result).toMatchObject({
      ok: true,
      value: { items: { length: 25 }, nextCursor: "allowed-24" },
    });
    expect(JSON.stringify(result)).not.toContain("hidden-admin-");

    const onlyHiddenDocuments = Array.from({ length: 51 }, (_, index) => ({
      id: `hidden-admin-${String(index).padStart(2, "0")}`,
      data: profile(`hidden-admin-${String(index).padStart(2, "0")}`),
    }));
    vi.mocked(repo.listUserProfiles)
      .mockResolvedValueOnce(onlyHiddenDocuments)
      .mockResolvedValueOnce([]);
    const onlyHidden =
      await createAdministrationQueryService(repo).users(restrictedContext);
    expect(onlyHidden).toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
  });

  it("treats a canonical cursor only as an ordering boundary inside the trusted tenant", async () => {
    const repo = repository({
      listUserProfiles: vi.fn().mockResolvedValue([]),
    });
    await expect(
      createAdministrationQueryService(repo).users(
        restrictedContext,
        "tenant-other-user-cursor",
      ),
    ).resolves.toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
    expect(repo.listUserProfiles).toHaveBeenCalledWith(
      "tenant-1",
      "tenant-other-user-cursor",
      51,
    );
  });

  it("continues bounded scanning after a fully filtered user batch", async () => {
    const hidden = Array.from({ length: 51 }, (_, index) => ({
      id: `hidden-admin-${String(index).padStart(2, "0")}`,
      data: profile(`hidden-admin-${String(index).padStart(2, "0")}`),
    }));
    const listUserProfiles = vi
      .fn()
      .mockResolvedValueOnce(hidden)
      .mockResolvedValueOnce([
        { id: "visible-after-hidden", data: profile("visible-after-hidden") },
      ]);
    const repo = repository({
      getAdministratorPrincipal: vi.fn((uid: string) =>
        Promise.resolve(uid.startsWith("hidden-admin-") ? { uid } : null),
      ),
      listUserProfiles,
    });

    await expect(
      createAdministrationQueryService(repo).users(restrictedContext),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        items: [{ uid: "visible-after-hidden" }],
        nextCursor: null,
      },
    });
    expect(listUserProfiles).toHaveBeenNthCalledWith(
      2,
      "tenant-1",
      "hidden-admin-50",
      51,
    );
  });

  it("sanitizes audit view models and exposes only immutable in-scope facility targets to restricted readers", async () => {
    const event = (
      eventId: string,
      targetType: string,
      targetId: string,
      metadata = {},
    ) => ({
      id: eventId,
      data: {
        eventId,
        actor: owner,
        action:
          targetType === "feature_flags"
            ? "replace_feature_flags"
            : targetType === "facility"
              ? "upsert_facility"
              : "set_account_status",
        targetType,
        targetId,
        tenantId: "tenant-1",
        timestamp: "2026-07-28T00:00:00.000Z",
        requestId: `request-${eventId}`,
        metadata,
      },
    });
    const repo = repository({
      listAuditEvents: vi
        .fn()
        .mockResolvedValue([
          event("event-1", "account", "inside"),
          event("event-2", "account", "outside"),
          event("event-3", "feature_flags", "tenant-1"),
          event("event-4", "facility", "fac-1"),
          event("event-5", "facility", "fac-2"),
        ]),
    });
    const result =
      await createAdministrationQueryService(repo).audit(restrictedContext);
    expect(result).toMatchObject({
      ok: true,
      value: { items: [{ eventId: "event-4", targetId: "fac-1" }] },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /requestId|principal|cookie|secret/iu,
    );
  });

  it("fails closed for unknown, action-inconsistent, or cross-platform legacy audit records", async () => {
    const baseEvent = {
      eventId: "event-legacy",
      actor: owner,
      action: "set_account_status",
      targetType: "account",
      targetId: "user-1",
      tenantId: "tenant-1",
      timestamp: "2026-07-28T00:00:00.000Z",
      requestId: "request-legacy",
      metadata: {},
    } as const;
    for (const data of [
      { ...baseEvent, targetType: "administrator" },
      { ...baseEvent, targetType: "facility" },
      { ...baseEvent, actor: { ...owner, platformId: "platform-other" } },
      { ...baseEvent, metadata: { " unsafe\n": "value" } },
    ]) {
      const result = await createAdministrationQueryService(
        repository({
          listAuditEvents: vi
            .fn()
            .mockResolvedValue([{ id: "event-legacy", data }]),
        }),
      ).audit(ownerContext);
      expect(result).toEqual({ ok: false, code: "provider_unavailable" });
    }
  });

  it("does not expose filtered historical audit IDs through restricted pagination cursors", async () => {
    const hiddenEvents = Array.from({ length: 51 }, (_, index) => {
      const eventId = `hidden-event-${String(index).padStart(2, "0")}`;
      return {
        id: eventId,
        data: {
          eventId,
          actor: owner,
          action: "set_account_status",
          targetType: "account",
          targetId: `hidden-user-${index}`,
          tenantId: "tenant-1",
          timestamp: "2026-07-28T00:00:00.000Z",
          requestId: `request-${index}`,
          metadata: {},
        },
      };
    });
    const result = await createAdministrationQueryService(
      repository({
        listAuditEvents: vi
          .fn()
          .mockResolvedValueOnce(hiddenEvents)
          .mockResolvedValueOnce([]),
      }),
    ).audit(restrictedContext);
    expect(result).toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
    expect(JSON.stringify(result)).not.toContain("hidden-event-");
  });

  it("continues bounded scanning after a fully filtered audit batch", async () => {
    const hiddenEvents = Array.from({ length: 51 }, (_, index) => {
      const eventId = `hidden-event-${String(index).padStart(2, "0")}`;
      return {
        id: eventId,
        data: {
          eventId,
          actor: owner,
          action: "set_account_status",
          targetType: "account",
          targetId: `hidden-user-${index}`,
          tenantId: "tenant-1",
          timestamp: "2026-07-28T00:00:00.000Z",
          requestId: `request-${index}`,
          metadata: {},
        },
      };
    });
    const listAuditEvents = vi
      .fn()
      .mockResolvedValueOnce(hiddenEvents)
      .mockResolvedValueOnce([
        {
          id: "visible-facility-event",
          data: {
            eventId: "visible-facility-event",
            actor: owner,
            action: "upsert_facility",
            targetType: "facility",
            targetId: "fac-1",
            tenantId: "tenant-1",
            timestamp: "2026-07-28T00:00:00.000Z",
            requestId: "request-visible",
            metadata: {},
          },
        },
      ]);

    await expect(
      createAdministrationQueryService(repository({ listAuditEvents })).audit(
        restrictedContext,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        items: [{ eventId: "visible-facility-event" }],
        nextCursor: null,
      },
    });
    expect(listAuditEvents).toHaveBeenNthCalledWith(
      2,
      "tenant-1",
      "hidden-event-50",
      51,
    );
  });

  it("removes secret-bearing legacy audit metadata before serialization", async () => {
    const result = await createAdministrationQueryService(
      repository({
        listAuditEvents: vi.fn().mockResolvedValue([
          {
            id: "event-secret",
            data: {
              eventId: "event-secret",
              actor: owner,
              action: "upsert_facility",
              targetType: "facility",
              targetId: "fac-1",
              tenantId: "tenant-1",
              timestamp: "2026-07-28T00:00:00.000Z",
              requestId: "request-secret",
              metadata: {
                safe: "organization-1",
                note: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
                privateKey: "-----BEGIN PRIVATE KEY-----",
              },
            },
          },
        ]),
      }),
    ).audit(ownerContext);
    expect(result).toMatchObject({
      ok: true,
      value: { items: [{ metadata: { safe: "organization-1" } }] },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Bearer|PRIVATE KEY|privateKey/u,
    );
  });

  it("returns provider failures rather than raw repository errors", async () => {
    const result = await createAdministrationQueryService(
      repository({
        getTenantDirectory: vi
          .fn()
          .mockRejectedValue(new Error("raw private key detail")),
      }),
    ).directory(ownerContext);
    expect(result).toEqual({ ok: false, code: "provider_unavailable" });
    expect(JSON.stringify(result)).not.toContain("private key");
  });
});
