import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { createTrustedAdministratorPrincipalResolver } from "./principal-resolver";

const principal = {
  kind: "tenant_admin",
  scope: "restricted",
  uid: "admin-1",
  platformId: "platform-1",
  tenantId: "tenant-1",
  organizationIds: ["organization-1"],
  facilityIds: ["facility-1"],
} as const;

const tenantDirectory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [{ id: "facility-1", organizationId: "organization-1" }],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
  },
} as const;

function dependencies(
  document: unknown = principal,
  options: {
    disabled?: boolean;
    fail?: boolean;
    tenantDocument?: unknown;
  } = {},
) {
  const auth = {
    verifyIdToken: options.fail
      ? vi.fn().mockRejectedValue(new Error("raw Firebase error"))
      : vi.fn().mockResolvedValue({
          uid: "admin-1",
          tenantId: "untrusted-claim",
          role: "untrusted-claim",
        }),
    getUser: vi.fn().mockResolvedValue({
      uid: "admin-1",
      disabled: options.disabled ?? false,
    }),
  } as unknown as Pick<Auth, "verifyIdToken" | "getUser">;
  const get = vi.fn((path: string) => {
    const value = path.startsWith("provisioningAdministrators/")
      ? document
      : Object.hasOwn(options, "tenantDocument")
        ? options.tenantDocument
        : tenantDirectory;
    return Promise.resolve({
      exists: value !== null,
      data: () => value,
    });
  });
  const firestore = {
    doc: vi.fn((path: string) => ({ get: () => get(path) })),
  } as unknown as Firestore;
  return { auth, firestore, get };
}

describe("trusted administrator principal resolution", () => {
  it("resolves a server-session UID without accepting a second client credential", async () => {
    const { auth, firestore } = dependencies();
    const resolver = createTrustedAdministratorPrincipalResolver(
      auth,
      firestore,
    );

    await expect(resolver.resolveUid("admin-1")).resolves.toEqual({
      ok: true,
      principal,
    });
    expect(auth.verifyIdToken).not.toHaveBeenCalled();
    expect(auth.getUser).toHaveBeenCalledWith("admin-1");
  });

  it("requires a bearer identity and resolves authority only from the trusted record", async () => {
    const { auth, firestore, get } = dependencies();
    const resolver = createTrustedAdministratorPrincipalResolver(
      auth,
      firestore,
    );

    await expect(resolver.resolve("Bearer token.value")).resolves.toEqual({
      ok: true,
      principal,
    });
    expect(auth.verifyIdToken).toHaveBeenCalledWith("token.value", true);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("fails closed for a missing, malformed, or inactive tenant directory", async () => {
    for (const tenantDocument of [
      null,
      { tenantId: "tenant-1", status: "active" },
      { ...tenantDirectory, status: "inactive" },
      { ...tenantDirectory, tenantId: "tenant-other" },
      { ...tenantDirectory, platformId: "platform-other" },
      {
        ...tenantDirectory,
        organizations: [{ id: "organization-other" }],
        facilities: [
          { id: "facility-other", organizationId: "organization-other" },
        ],
      },
    ]) {
      const { auth, firestore } = dependencies(principal, { tenantDocument });
      await expect(
        createTrustedAdministratorPrincipalResolver(auth, firestore).resolve(
          "Bearer token.value",
        ),
      ).resolves.toEqual({ ok: false, code: "forbidden" });
    }
  });

  it("does not require an active tenant directory for platform owners", async () => {
    const owner = {
      kind: "platform_owner",
      uid: "admin-1",
      platformId: "platform-1",
    } as const;
    const { auth, firestore, get } = dependencies(owner, {
      tenantDocument: null,
    });

    await expect(
      createTrustedAdministratorPrincipalResolver(auth, firestore).resolve(
        "Bearer token.value",
      ),
    ).resolves.toEqual({ ok: true, principal: owner });
    expect(get).toHaveBeenCalledOnce();
  });

  it("denies missing identity, disabled users, missing records, and UID mismatch", async () => {
    const valid = dependencies();
    await expect(
      createTrustedAdministratorPrincipalResolver(
        valid.auth,
        valid.firestore,
      ).resolve(null),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });

    const disabled = dependencies(principal, { disabled: true });
    await expect(
      createTrustedAdministratorPrincipalResolver(
        disabled.auth,
        disabled.firestore,
      ).resolve("Bearer token.value"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    const missing = dependencies(null);
    await expect(
      createTrustedAdministratorPrincipalResolver(
        missing.auth,
        missing.firestore,
      ).resolve("Bearer token.value"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    const mismatch = dependencies({ ...principal, uid: "other-admin" });
    await expect(
      createTrustedAdministratorPrincipalResolver(
        mismatch.auth,
        mismatch.firestore,
      ).resolve("Bearer token.value"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
  });

  it("normalizes Firebase failures without exposing raw details", async () => {
    const { auth, firestore } = dependencies(principal, { fail: true });
    const result = await createTrustedAdministratorPrincipalResolver(
      auth,
      firestore,
    ).resolve("Bearer token.value");

    expect(result).toEqual({ ok: false, code: "provider_unavailable" });
    expect(JSON.stringify(result)).not.toContain("raw Firebase error");
  });

  it("normalizes rejected credentials as unauthenticated", async () => {
    const { auth, firestore } = dependencies();
    vi.mocked(auth.verifyIdToken).mockRejectedValue({
      code: "auth/id-token-expired",
      message: "raw token detail",
    });

    await expect(
      createTrustedAdministratorPrincipalResolver(auth, firestore).resolve(
        "Bearer token.value",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });
});
