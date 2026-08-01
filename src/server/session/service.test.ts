import { describe, expect, it, vi } from "vitest";

import type { SessionResolutionResult } from "@/domain/auth/types";

import { parseSessionCredential } from "./crypto";
import { createServerSessionService } from "./service";
import type {
  FirebaseServerIdentityVerifier,
  ServerSessionRecord,
  ServerSessionStore,
} from "./types";

const now = 1_800_000_000_000;
const identity = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "User",
};
const facilityScope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;
const secondFacilityScope = {
  ...facilityScope,
  facilityId: "facility-2",
} as const;
const successfulSession: Extract<SessionResolutionResult, { ok: true }> = {
  ok: true,
  user: {
    ...identity,
    tenantId: "tenant-1",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityIds: ["facility-1"],
    activeFacilityId: "facility-1",
    departmentIds: [],
    activeDepartmentId: null,
    activeScope: facilityScope,
    roleAssignments: [{ role: "pharmacy_manager", scope: facilityScope }],
    explicitPermissionOverrides: [],
    accountStatus: "active",
  },
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
  },
};

const secondFacilitySession: Extract<SessionResolutionResult, { ok: true }> = {
  ...successfulSession,
  user: {
    ...successfulSession.user,
    facilityIds: ["facility-1", "facility-2"],
    activeFacilityId: "facility-2",
    activeScope: secondFacilityScope,
    roleAssignments: [
      ...successfulSession.user.roleAssignments,
      { role: "pharmacy_manager", scope: secondFacilityScope },
    ],
  },
};

function harness(trusted: SessionResolutionResult = successfulSession) {
  let currentTime = now;
  const records = new Map<string, ServerSessionRecord>();
  const tokenFingerprints = new Set<string>();
  const store: ServerSessionStore = {
    get: vi.fn(async (id) => records.get(id) ?? null),
    create: vi.fn(
      async (record, tokenFingerprint, rotation, revokedAtMilliseconds) => {
        if (tokenFingerprints.has(tokenFingerprint)) return "replayed" as const;
        if (rotation) {
          const previous = records.get(rotation.sessionId);
          if (
            !previous ||
            previous.uid !== rotation.uid ||
            previous.credentialHash !== rotation.credentialHash ||
            previous.revokedAtMilliseconds !== null
          ) {
            return "rotation_conflict" as const;
          }
        }
        tokenFingerprints.add(tokenFingerprint);
        records.set(record.sessionId, record);
        if (rotation) {
          records.set(rotation.sessionId, {
            ...records.get(rotation.sessionId)!,
            revokedAtMilliseconds,
          });
        }
        return "created" as const;
      },
    ),
    rotate: vi.fn(
      async (record, rotation, _authorization, revokedAtMilliseconds) => {
        const previous = records.get(rotation.sessionId);
        if (
          !previous ||
          previous.uid !== rotation.uid ||
          previous.credentialHash !== rotation.credentialHash ||
          previous.revokedAtMilliseconds !== null ||
          previous.expiresAtMilliseconds <= revokedAtMilliseconds ||
          record.expiresAtMilliseconds !== previous.expiresAtMilliseconds
        ) {
          return "rotation_conflict" as const;
        }
        records.set(record.sessionId, record);
        records.set(rotation.sessionId, {
          ...previous,
          revokedAtMilliseconds,
        });
        return "created" as const;
      },
    ),
    revoke: vi.fn(async (id, revokedAt) => {
      const record = records.get(id);
      if (record)
        records.set(id, { ...record, revokedAtMilliseconds: revokedAt });
    }),
  };
  const verifier: FirebaseServerIdentityVerifier = {
    verifyIdToken: vi.fn().mockResolvedValue({
      ok: true,
      identity: {
        identity,
        authTimeSeconds: Math.floor(now / 1000) - 30,
        issuedAtSeconds: Math.floor(now / 1000) - 10,
      },
    }),
    resolveCurrentIdentity: vi.fn().mockResolvedValue({ ok: true, identity }),
  };
  let trustedResult = trusted;
  const trustedSessions = {
    resolveIdentity: vi.fn(async () => trustedResult),
  };
  const service = createServerSessionService({
    identityVerifier: verifier,
    trustedSessions,
    store,
    now: () => currentTime,
  });
  return {
    records,
    service,
    store,
    trustedSessions,
    verifier,
    advance: (milliseconds: number) => {
      currentTime += milliseconds;
    },
    setTrusted: (value: SessionResolutionResult) => {
      trustedResult = value;
    },
  };
}

async function createCookie(value = harness()) {
  const result = await value.service.create("firebase-id-token");
  if (!result.ok) throw new Error("Expected session creation to succeed.");
  return { ...value, cookie: result.value.cookieValue };
}

describe("server session service", () => {
  it("creates an opaque session and resolves trusted authorization server-side", async () => {
    const value = await createCookie();
    const credential = parseSessionCredential(value.cookie);
    expect(credential).not.toBeNull();
    expect(value.cookie).not.toContain(identity.uid);
    expect(value.cookie).not.toContain("tenant-1");
    expect(value.store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: identity.uid,
        activeFacilityId: "facility-1",
        revokedAtMilliseconds: null,
      }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      null,
      now,
    );
    await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
      ok: true,
      value: { trusted: successfulSession },
    });
  });

  it.each(["invalid", "expired", "revoked"])(
    "rejects an %s Firebase token",
    async () => {
      const value = harness();
      vi.mocked(value.verifier.verifyIdToken).mockResolvedValue({
        ok: false,
        code: "unauthenticated",
      });
      await expect(value.service.create("bad-token")).resolves.toEqual({
        ok: false,
        code: "unauthenticated",
      });
      expect(value.store.create).not.toHaveBeenCalled();
    },
  );

  it("rejects stale identity tokens to limit token replay", async () => {
    const value = harness();
    vi.mocked(value.verifier.verifyIdToken).mockResolvedValue({
      ok: true,
      identity: {
        identity,
        authTimeSeconds: Math.floor(now / 1000) - 1_000,
        issuedAtSeconds: Math.floor(now / 1000) - 301,
      },
    });
    await expect(value.service.create("stale-token")).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("rejects a token whose authentication time is implausibly in the future", async () => {
    const value = harness();
    vi.mocked(value.verifier.verifyIdToken).mockResolvedValue({
      ok: true,
      identity: {
        identity,
        authTimeSeconds: Math.floor(now / 1000) + 120,
        issuedAtSeconds: Math.floor(now / 1000),
      },
    });
    await expect(value.service.create("future-auth-token")).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("atomically rejects a repeated Firebase ID-token exchange", async () => {
    const value = harness();
    await expect(value.service.create("one-time-token")).resolves.toMatchObject(
      {
        ok: true,
      },
    );
    await expect(value.service.create("one-time-token")).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(value.records.size).toBe(1);
  });

  it.each([
    "account_disabled",
    "tenant_inactive",
    "tenant_mismatch",
    "profile_not_found",
    "role_assignment_mismatch",
    "feature_flags_missing",
  ] as const)("fails closed for trusted-session failure %s", async (reason) => {
    const value = harness({
      ok: false,
      failure: { category: "access_denied", reason },
    });
    await expect(value.service.create("valid-token")).resolves.toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("does not establish an application session without current shell access", async () => {
    for (const user of [
      {
        ...successfulSession.user,
        roleAssignments: [
          {
            role: "external_pharmacy_supervisor" as const,
            scope: facilityScope,
          },
        ],
      },
      {
        ...successfulSession.user,
        explicitPermissionOverrides: [
          {
            effect: "deny" as const,
            resource: "dashboard" as const,
            action: "read" as const,
            scope: facilityScope,
          },
        ],
      },
    ]) {
      const value = harness({ ...successfulSession, user });
      await expect(value.service.create("valid-token")).resolves.toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(value.store.create).not.toHaveBeenCalled();
    }
  });

  it("rejects tampered, expired, revoked, and malformed session records", async () => {
    const value = await createCookie();
    const credential = parseSessionCredential(value.cookie)!;
    const record = value.records.get(credential.sessionId)!;

    await expect(value.service.resolve(value.cookie + "x")).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    value.records.set(credential.sessionId, {
      ...record,
      expiresAtMilliseconds: now,
    });
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    value.records.set(credential.sessionId, {
      ...record,
      revokedAtMilliseconds: now - 1,
    });
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("fails closed when the session store is unavailable or returns malformed data", async () => {
    const unavailable = await createCookie();
    vi.mocked(unavailable.store.get).mockRejectedValue(
      new Error("raw Firestore outage"),
    );
    await expect(
      unavailable.service.resolve(unavailable.cookie),
    ).resolves.toEqual({
      ok: false,
      code: "provider_unavailable",
    });
    vi.mocked(unavailable.store.get).mockResolvedValue({
      sessionId: "malformed",
    } as never);
    await expect(
      unavailable.service.resolve(unavailable.cookie),
    ).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("re-resolves role and feature changes before every protected decision", async () => {
    const value = await createCookie();
    await expect(
      value.service.authorize(value.cookie, {
        resource: "announcements",
        action: "read",
      }),
    ).resolves.toMatchObject({ ok: true });

    value.setTrusted({
      ...successfulSession,
      featureFlags: { ...successfulSession.featureFlags, announcements: false },
    });
    await expect(
      value.service.authorize(value.cookie, {
        resource: "announcements",
        action: "read",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    value.setTrusted({
      ...successfulSession,
      user: { ...successfulSession.user, roleAssignments: [] },
    });
    await expect(
      value.service.authorize(value.cookie, {
        resource: "dashboard",
        action: "read",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    value.setTrusted({
      ...successfulSession,
      user: {
        ...successfulSession.user,
        explicitPermissionOverrides: [
          {
            effect: "deny",
            resource: "dashboard",
            action: "read",
            scope: facilityScope,
          },
        ],
      },
    });
    await expect(
      value.service.authorize(value.cookie, {
        resource: "dashboard",
        action: "read",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    for (const reason of [
      "account_disabled",
      "tenant_inactive",
      "facility_mismatch",
    ] as const) {
      value.setTrusted({
        ok: false,
        failure: { category: "access_denied", reason },
      });
      await expect(
        value.service.authorize(value.cookie, {
          resource: "dashboard",
          action: "read",
        }),
      ).resolves.toEqual({ ok: false, code: "forbidden" });
    }
  });

  it("denies cross-platform and cross-facility protected targets", async () => {
    const value = await createCookie();
    for (const targetScope of [
      { ...facilityScope, facilityId: "facility-2" },
      { ...facilityScope, platformId: "platform-2" },
    ]) {
      await expect(
        value.service.authorize(value.cookie, {
          resource: "dashboard",
          action: "read",
          targetScope,
        }),
      ).resolves.toEqual({ ok: false, code: "forbidden" });
    }
  });

  it("rotates a supplied session and rejects its replay after revocation", async () => {
    const value = await createCookie();
    const replacement = await value.service.create("fresh-token", value.cookie);
    expect(replacement.ok).toBe(true);
    expect(value.trustedSessions.resolveIdentity).toHaveBeenLastCalledWith(
      identity,
      "facility-1",
    );
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(value.store.revoke).not.toHaveBeenCalled();
  });

  it("does not revoke a session selected by an attacker-controlled ID without its secret", async () => {
    const value = await createCookie();
    const original = parseSessionCredential(value.cookie)!;
    const forgedPrevious = `${original.sessionId}.${"z".repeat(43)}`;
    await expect(
      value.service.create("different-token", forgedPrevious),
    ).resolves.toMatchObject({ ok: true });
    await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("does not create an unrotated replacement when the prior-session lookup is unavailable", async () => {
    const value = await createCookie();
    vi.mocked(value.store.get).mockRejectedValueOnce(
      new Error("Firestore unavailable"),
    );
    await expect(
      value.service.create("fresh-token", value.cookie),
    ).resolves.toEqual({ ok: false, code: "provider_unavailable" });
    expect(value.store.create).toHaveBeenCalledTimes(1);
  });

  it("leaves the old session valid when atomic rotation conflicts or fails", async () => {
    for (const failure of ["rotation_conflict", "throw"] as const) {
      const value = await createCookie();
      if (failure === "throw") {
        vi.mocked(value.store.create).mockRejectedValueOnce(
          new Error("transaction failed"),
        );
      } else {
        vi.mocked(value.store.create).mockResolvedValueOnce(
          "rotation_conflict",
        );
      }
      await expect(
        value.service.create("replacement-token", value.cookie),
      ).resolves.toMatchObject({ ok: false });
      await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
        ok: true,
      });
    }
  });

  it("lets only one concurrent rotation replace the same prior session", async () => {
    const value = await createCookie();
    const [first, second] = await Promise.all([
      value.service.create("parallel-token-1", value.cookie),
      value.service.create("parallel-token-2", value.cookie),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    const activeRecords = [...value.records.values()].filter(
      (record) => record.revokedAtMilliseconds === null,
    );
    expect(activeRecords).toHaveLength(1);
  });

  it("atomically switches to an authorized facility and invalidates the old credential", async () => {
    const value = await createCookie();
    const previous = parseSessionCredential(value.cookie)!;
    const previousExpiry = value.records.get(
      previous.sessionId,
    )!.expiresAtMilliseconds;
    value.setTrusted(secondFacilitySession);

    const result = await value.service.switchFacility(
      value.cookie,
      "facility-2",
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        activeFacilityId: "facility-2",
        expiresAtMilliseconds: previousExpiry,
      },
    });
    expect(value.trustedSessions.resolveIdentity).toHaveBeenLastCalledWith(
      identity,
      "facility-2",
    );
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
    if (!result.ok) throw new Error("Expected facility switch to succeed.");
    await expect(
      value.service.resolve(result.value.cookieValue),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        record: {
          activeFacilityId: "facility-2",
          expiresAtMilliseconds: previousExpiry,
        },
      },
    });
  });

  it("rotates even when switching to the currently active facility", async () => {
    const value = await createCookie();
    const result = await value.service.switchFacility(
      value.cookie,
      "facility-1",
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("Expected facility switch to succeed.");
    expect(result.value.cookieValue).not.toBe(value.cookie);
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("rejects malformed or currently unauthorized facility targets without rotating", async () => {
    const value = await createCookie();
    await expect(
      value.service.switchFacility(value.cookie, "../facility-2"),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });

    value.setTrusted({
      ok: false,
      failure: { category: "access_denied", reason: "facility_mismatch" },
    });
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(value.store.rotate).not.toHaveBeenCalled();
    value.setTrusted(successfulSession);
    await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("rejects a resolver that returns a different active facility than requested or stored", async () => {
    const value = await createCookie();
    value.setTrusted(successfulSession);
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(value.store.rotate).not.toHaveBeenCalled();

    value.setTrusted(secondFacilitySession);
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it.each([
    "account_disabled",
    "tenant_inactive",
    "profile_not_found",
    "profile_incomplete",
    "role_assignment_missing",
    "role_assignment_mismatch",
    "tenant_not_found",
    "facility_mismatch",
    "active_facility_invalid",
  ] as const)("fails closed during switching for %s", async (reason) => {
    const value = await createCookie();
    value.setTrusted({
      ok: false,
      failure: { category: "access_denied", reason },
    });
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(value.store.rotate).not.toHaveBeenCalled();
  });

  it("rejects a target outside applicable role scope or with an explicit dashboard deny", async () => {
    for (const user of [
      {
        ...secondFacilitySession.user,
        roleAssignments: successfulSession.user.roleAssignments,
      },
      {
        ...secondFacilitySession.user,
        explicitPermissionOverrides: [
          {
            effect: "deny" as const,
            resource: "dashboard" as const,
            action: "read" as const,
            scope: secondFacilityScope,
          },
        ],
      },
    ]) {
      const value = await createCookie();
      value.setTrusted({ ...secondFacilitySession, user });
      await expect(
        value.service.switchFacility(value.cookie, "facility-2"),
      ).resolves.toEqual({ ok: false, code: "forbidden" });
      expect(value.store.rotate).not.toHaveBeenCalled();
    }
  });

  it("allows only one concurrent switch and preserves the original absolute expiry", async () => {
    const value = await createCookie();
    const original = parseSessionCredential(value.cookie)!;
    const absoluteExpiry = value.records.get(
      original.sessionId,
    )!.expiresAtMilliseconds;
    value.setTrusted(secondFacilitySession);
    value.advance(60_000);
    const [first, second] = await Promise.all([
      value.service.switchFacility(value.cookie, "facility-2"),
      value.service.switchFacility(value.cookie, "facility-2"),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const successful = first.ok ? first : second;
    if (!successful.ok) throw new Error("Expected one switch to succeed.");
    expect(successful.value.expiresAtMilliseconds).toBe(absoluteExpiry);

    value.setTrusted(successfulSession);
    value.advance(60_000);
    const switchedBack = await value.service.switchFacility(
      successful.value.cookieValue,
      "facility-1",
    );
    expect(switchedBack).toMatchObject({
      ok: true,
      value: { expiresAtMilliseconds: absoluteExpiry },
    });
  });

  it("preserves one absolute lifetime across repeated and near-expiry switches", async () => {
    const value = await createCookie();
    const originalCredential = parseSessionCredential(value.cookie)!;
    const absoluteExpiry = value.records.get(
      originalCredential.sessionId,
    )!.expiresAtMilliseconds;
    let cookie = value.cookie;

    for (let index = 0; index < 12; index += 1) {
      const toSecond = index % 2 === 0;
      value.setTrusted(toSecond ? secondFacilitySession : successfulSession);
      value.advance(1_000);
      const switched = await value.service.switchFacility(
        cookie,
        toSecond ? "facility-2" : "facility-1",
      );
      if (!switched.ok) throw new Error("Expected repeated switch to succeed.");
      expect(switched.value.expiresAtMilliseconds).toBe(absoluteExpiry);
      cookie = switched.value.cookieValue;
    }

    value.advance(absoluteExpiry - now - 12_000 - 1);
    value.setTrusted(secondFacilitySession);
    const nearBoundary = await value.service.switchFacility(
      cookie,
      "facility-2",
    );
    expect(nearBoundary).toMatchObject({
      ok: true,
      value: { expiresAtMilliseconds: absoluteExpiry },
    });
    if (!nearBoundary.ok) throw new Error("Expected near-boundary switch.");

    value.advance(1);
    await expect(
      value.service.switchFacility(
        nearBoundary.value.cookieValue,
        "facility-1",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });

  it("keeps the old session usable when facility rotation conflicts or throws", async () => {
    for (const failure of ["rotation_conflict", "throw"] as const) {
      const value = await createCookie();
      value.setTrusted(secondFacilitySession);
      if (failure === "throw") {
        vi.mocked(value.store.rotate).mockRejectedValueOnce(
          new Error("transaction failed"),
        );
      } else {
        vi.mocked(value.store.rotate).mockResolvedValueOnce(
          "rotation_conflict",
        );
      }
      await expect(
        value.service.switchFacility(value.cookie, "facility-2"),
      ).resolves.toMatchObject({ ok: false });
      value.setTrusted(successfulSession);
      await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
        ok: true,
      });
    }
  });

  it("reports a transactional trusted-state conflict as forbidden without revoking the predecessor", async () => {
    const value = await createCookie();
    value.setTrusted(secondFacilitySession);
    vi.mocked(value.store.rotate).mockResolvedValueOnce(
      "authorization_conflict",
    );
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    value.setTrusted(successfulSession);
    await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("rejects forged, expired, and revoked switch credentials", async () => {
    const value = await createCookie();
    const credential = parseSessionCredential(value.cookie)!;
    await expect(
      value.service.switchFacility(
        `${credential.sessionId}.${"z".repeat(43)}`,
        "facility-2",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });

    const record = value.records.get(credential.sessionId)!;
    value.records.set(credential.sessionId, {
      ...record,
      expiresAtMilliseconds: now,
    });
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
    value.records.set(credential.sessionId, {
      ...record,
      revokedAtMilliseconds: now,
    });
    await expect(
      value.service.switchFacility(value.cookie, "facility-2"),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });

  it("rejects a switched facility immediately when current trusted scope removes it", async () => {
    const value = await createCookie();
    value.setTrusted(secondFacilitySession);
    const switched = await value.service.switchFacility(
      value.cookie,
      "facility-2",
    );
    if (!switched.ok) throw new Error("Expected facility switch to succeed.");
    value.setTrusted({
      ok: false,
      failure: { category: "access_denied", reason: "active_facility_invalid" },
    });
    await expect(
      value.service.resolve(switched.value.cookieValue),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
  });

  it("applies feature and explicit-deny changes immediately after switching", async () => {
    const value = await createCookie();
    value.setTrusted(secondFacilitySession);
    const switched = await value.service.switchFacility(
      value.cookie,
      "facility-2",
    );
    if (!switched.ok) throw new Error("Expected facility switch to succeed.");

    value.setTrusted({
      ...secondFacilitySession,
      featureFlags: {
        ...secondFacilitySession.featureFlags,
        announcements: false,
      },
    });
    await expect(
      value.service.authorize(switched.value.cookieValue, {
        resource: "announcements",
        action: "read",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });

    value.setTrusted({
      ...secondFacilitySession,
      user: {
        ...secondFacilitySession.user,
        explicitPermissionOverrides: [
          {
            effect: "deny",
            resource: "dashboard",
            action: "read",
            scope: secondFacilityScope,
          },
        ],
      },
    });
    await expect(
      value.service.authorize(switched.value.cookieValue, {
        resource: "dashboard",
        action: "read",
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
  });

  it("revokes the server record so a captured cookie cannot be replayed after sign-out", async () => {
    const value = await createCookie();
    await expect(value.service.revoke(value.cookie)).resolves.toEqual({
      ok: true,
      value: null,
    });
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("does not revoke a record when the cookie secret is forged", async () => {
    const value = await createCookie();
    const credential = parseSessionCredential(value.cookie)!;
    await expect(
      value.service.revoke(`${credential.sessionId}.${"z".repeat(43)}`),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
    expect(value.store.revoke).not.toHaveBeenCalled();
    await expect(value.service.resolve(value.cookie)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("allows a disabled account to revoke its credential without re-authorizing", async () => {
    const value = await createCookie();
    const trustedCalls =
      value.trustedSessions.resolveIdentity.mock.calls.length;
    value.setTrusted({
      ok: false,
      failure: { category: "access_denied", reason: "account_disabled" },
    });
    await expect(value.service.revoke(value.cookie)).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(value.trustedSessions.resolveIdentity).toHaveBeenCalledTimes(
      trustedCalls,
    );
    await expect(value.service.resolve(value.cookie)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });
});
