import { describe, expect, it, vi } from "vitest";

import {
  createFirestoreServerSessionStore,
  serverSessionCollection,
  sessionTokenExchangeCollection,
} from "./firestore-store";
import { resolveSession } from "@/domain/auth/session-resolver";

import { fingerprintTrustedAuthorization } from "./trusted-authorization";
import type {
  ServerSessionRecord,
  ServerSessionRotationAuthorization,
} from "./types";

const record: ServerSessionRecord = {
  schemaVersion: 2,
  sessionId: "a".repeat(43),
  uid: "user-1",
  activeFacilityId: "facility-1",
  credentialHash: "b".repeat(64),
  firebaseAuthTimeSeconds: 1_800_000_000,
  createdAtMilliseconds: 1_800_000_000_000,
  expiresAtMilliseconds: 1_800_028_800_000,
  revokedAtMilliseconds: null,
};

function firestore() {
  const documents = new Map<string, unknown>();
  const reference = (path: string) => ({
    path,
    get: vi.fn(async () => ({
      exists: documents.has(path),
      data: () => documents.get(path),
    })),
  });
  interface QueryReference {
    kind: "query";
    path: string;
    filters: { field: string; value: unknown }[];
    maximum: number;
    where(field: string, operation: string, value: unknown): QueryReference;
    limit(maximum: number): QueryReference;
  }
  const query = (
    path: string,
    filters: QueryReference["filters"] = [],
    maximum = Number.POSITIVE_INFINITY,
  ): QueryReference => ({
    kind: "query",
    path,
    filters,
    maximum,
    where: (field, operation, value) => {
      if (operation !== "==") throw new Error("Unexpected query operation.");
      return query(path, [...filters, { field, value }], maximum);
    },
    limit: (nextMaximum) => query(path, filters, nextMaximum),
  });
  const transaction = {
    get: vi.fn(async (target: { path: string; kind?: "query" }) => {
      if (target.kind === "query") {
        const targetQuery = target as QueryReference;
        const matching = [...documents.entries()]
          .filter(([path, value]) => {
            if (!path.startsWith(`${targetQuery.path}/`)) return false;
            const remainder = path.slice(targetQuery.path.length + 1);
            if (remainder.includes("/")) return false;
            return targetQuery.filters.every(
              (filter) =>
                (value as Record<string, unknown>)[filter.field] ===
                filter.value,
            );
          })
          .slice(0, targetQuery.maximum);
        return {
          size: matching.length,
          docs: matching.map(([, value]) => ({ data: () => value })),
        };
      }
      return {
        exists: documents.has(target.path),
        data: () => documents.get(target.path),
      };
    }),
    create: vi.fn((document: { path: string }, value: unknown) => {
      if (documents.has(document.path)) throw new Error("already exists");
      documents.set(document.path, value);
    }),
    update: vi.fn((document: { path: string }, value: object) => {
      documents.set(document.path, {
        ...(documents.get(document.path) as object),
        ...value,
      });
    }),
  };
  return {
    documents,
    transaction,
    sdk: {
      doc: vi.fn((path: string) => reference(path)),
      collection: vi.fn((collection: string) => ({
        ...query(collection),
        doc: (id: string) => reference(`${collection}/${id}`),
      })),
      runTransaction: vi.fn(
        async (operation: (value: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    },
  };
}

const trustedProfile = {
  uid: "user-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1", "facility-2"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
} as const;
const trustedAssignment = {
  uid: "user-1",
  tenantId: "tenant-1",
  roleId: "pharmacy_manager",
  scope: {
    kind: "organization",
    platformId: "platform-1",
    organizationId: "organization-1",
  },
} as const;
const trustedDirectory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [
    { id: "facility-1", organizationId: "organization-1" },
    { id: "facility-2", organizationId: "organization-1" },
  ],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
  },
} as const;

function seedTrustedAuthorization(value: ReturnType<typeof firestore>) {
  value.documents.set("userProfiles/user-1", trustedProfile);
  value.documents.set(
    "userRoleAssignments/user-1/assignments/assignment-1",
    trustedAssignment,
  );
  value.documents.set("tenantDirectories/tenant-1", trustedDirectory);
}

function rotationAuthorization(): ServerSessionRotationAuthorization {
  const identity = {
    uid: "user-1",
    email: "user@example.com",
    displayName: "User",
  };
  const trusted = resolveSession({
    identity,
    profile: trustedProfile,
    roleAssignments: [trustedAssignment],
    tenantDirectory: trustedDirectory,
    requestedActiveFacilityId: "facility-2",
  });
  if (!trusted.ok) throw new Error("Expected valid trusted fixture.");
  return {
    identity,
    tenantId: "tenant-1",
    activeFacilityId: "facility-2",
    trustedStateFingerprint: fingerprintTrustedAuthorization(trusted),
  };
}

describe("Firestore server-session store", () => {
  it("atomically creates one replay marker without storing the raw token", async () => {
    const value = firestore();
    const store = createFirestoreServerSessionStore(value.sdk as never);
    const fingerprint = "c".repeat(64);
    await expect(
      store.create(record, fingerprint, null, record.createdAtMilliseconds),
    ).resolves.toBe("created");
    await expect(
      store.create(
        { ...record, sessionId: "d".repeat(43) },
        fingerprint,
        null,
        record.createdAtMilliseconds,
      ),
    ).resolves.toBe("replayed");
    expect(
      value.documents.get(`${serverSessionCollection}/${record.sessionId}`),
    ).toEqual(record);
    expect(
      value.documents.get(`${sessionTokenExchangeCollection}/${fingerprint}`),
    ).toEqual({
      sessionId: record.sessionId,
      expiresAtMilliseconds: record.expiresAtMilliseconds,
    });
    expect(JSON.stringify([...value.documents])).not.toContain(
      "firebase-id-token",
    );
  });

  it("creates the replacement, replay marker, and old-session revocation in one transaction", async () => {
    const value = firestore();
    const store = createFirestoreServerSessionStore(value.sdk as never);
    const oldRecord = { ...record, sessionId: "e".repeat(43) };
    const newRecord = { ...record, sessionId: "f".repeat(43) };
    value.documents.set(
      `${serverSessionCollection}/${oldRecord.sessionId}`,
      oldRecord,
    );

    await expect(
      store.create(
        newRecord,
        "c".repeat(64),
        {
          sessionId: oldRecord.sessionId,
          uid: oldRecord.uid,
          credentialHash: oldRecord.credentialHash,
        },
        record.createdAtMilliseconds + 1,
      ),
    ).resolves.toBe("created");
    expect(
      value.documents.get(`${serverSessionCollection}/${oldRecord.sessionId}`),
    ).toMatchObject({
      revokedAtMilliseconds: record.createdAtMilliseconds + 1,
    });
    expect(
      value.documents.get(`${serverSessionCollection}/${newRecord.sessionId}`),
    ).toEqual(newRecord);
    expect(value.transaction.get).toHaveBeenCalledTimes(2);
    expect(value.transaction.get.mock.invocationCallOrder.at(-1)).toBeLessThan(
      value.transaction.create.mock.invocationCallOrder.at(0)!,
    );
  });

  it("atomically rotates a facility session without extending its absolute expiry", async () => {
    const value = firestore();
    seedTrustedAuthorization(value);
    const store = createFirestoreServerSessionStore(value.sdk as never);
    const oldRecord = { ...record, sessionId: "e".repeat(43) };
    const rotatedAt = record.createdAtMilliseconds + 60_000;
    const replacement = {
      ...record,
      sessionId: "f".repeat(43),
      activeFacilityId: "facility-2",
      createdAtMilliseconds: rotatedAt,
    };
    value.documents.set(
      `${serverSessionCollection}/${oldRecord.sessionId}`,
      oldRecord,
    );

    await expect(
      store.rotate(
        replacement,
        {
          sessionId: oldRecord.sessionId,
          uid: oldRecord.uid,
          credentialHash: oldRecord.credentialHash,
        },
        rotationAuthorization(),
        rotatedAt,
      ),
    ).resolves.toBe("created");
    expect(
      value.documents.get(`${serverSessionCollection}/${oldRecord.sessionId}`),
    ).toMatchObject({ revokedAtMilliseconds: rotatedAt });
    expect(
      value.documents.get(
        `${serverSessionCollection}/${replacement.sessionId}`,
      ),
    ).toEqual(replacement);
    expect(
      [...value.documents.keys()].some((path) =>
        path.startsWith(`${sessionTokenExchangeCollection}/`),
      ),
    ).toBe(false);
    expect(value.transaction.get.mock.invocationCallOrder.at(-1)).toBeLessThan(
      value.transaction.create.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("rejects facility rotation when the old proof or absolute expiry does not match", async () => {
    const value = firestore();
    seedTrustedAuthorization(value);
    const store = createFirestoreServerSessionStore(value.sdk as never);
    const oldRecord = { ...record, sessionId: "e".repeat(43) };
    const rotatedAt = record.createdAtMilliseconds + 1;
    value.documents.set(
      `${serverSessionCollection}/${oldRecord.sessionId}`,
      oldRecord,
    );
    const before = new Map(value.documents);

    await expect(
      store.rotate(
        {
          ...record,
          sessionId: "f".repeat(43),
          activeFacilityId: "facility-2",
          createdAtMilliseconds: rotatedAt,
          expiresAtMilliseconds: record.expiresAtMilliseconds + 1,
        },
        {
          sessionId: oldRecord.sessionId,
          uid: oldRecord.uid,
          credentialHash: oldRecord.credentialHash,
        },
        rotationAuthorization(),
        rotatedAt,
      ),
    ).resolves.toBe("rotation_conflict");
    expect(value.documents).toEqual(before);
  });

  it("re-checks absolute expiry inside each transaction callback attempt", async () => {
    const value = firestore();
    seedTrustedAuthorization(value);
    const store = createFirestoreServerSessionStore(
      value.sdk as never,
      () => record.expiresAtMilliseconds,
    );
    const oldRecord = { ...record, sessionId: "e".repeat(43) };
    const rotatedAt = record.expiresAtMilliseconds - 1;
    value.documents.set(
      `${serverSessionCollection}/${oldRecord.sessionId}`,
      oldRecord,
    );

    await expect(
      store.rotate(
        {
          ...record,
          sessionId: "f".repeat(43),
          activeFacilityId: "facility-2",
          createdAtMilliseconds: rotatedAt,
        },
        {
          sessionId: oldRecord.sessionId,
          uid: oldRecord.uid,
          credentialHash: oldRecord.credentialHash,
        },
        rotationAuthorization(),
        rotatedAt,
      ),
    ).resolves.toBe("rotation_conflict");
    expect(
      value.documents.get(`${serverSessionCollection}/${oldRecord.sessionId}`),
    ).toEqual(oldRecord);
    expect(
      value.documents.has(`${serverSessionCollection}/${"f".repeat(43)}`),
    ).toBe(false);
  });

  it.each([
    [
      "disabled profile",
      () => ({ ...trustedProfile, accountStatus: "disabled" }),
      "userProfiles/user-1",
    ],
    [
      "inactive tenant",
      () => ({ ...trustedDirectory, status: "inactive" }),
      "tenantDirectories/tenant-1",
    ],
    [
      "removed facility membership",
      () => ({ ...trustedProfile, facilityIds: ["facility-1"] }),
      "userProfiles/user-1",
    ],
    [
      "new explicit dashboard deny",
      () => ({
        ...trustedProfile,
        explicitPermissionOverrides: [
          {
            effect: "deny",
            resource: "dashboard",
            action: "read",
            scope: {
              kind: "facility",
              platformId: "platform-1",
              organizationId: "organization-1",
              facilityId: "facility-2",
            },
          },
        ],
      }),
      "userProfiles/user-1",
    ],
  ] as const)(
    "aborts rotation atomically when trusted state changes to %s before commit",
    async (_name, changedRecord, path) => {
      const value = firestore();
      seedTrustedAuthorization(value);
      const store = createFirestoreServerSessionStore(value.sdk as never);
      const oldRecord = { ...record, sessionId: "e".repeat(43) };
      const rotatedAt = record.createdAtMilliseconds + 1;
      value.documents.set(
        `${serverSessionCollection}/${oldRecord.sessionId}`,
        oldRecord,
      );
      const authorization = rotationAuthorization();
      value.documents.set(path, changedRecord());

      await expect(
        store.rotate(
          {
            ...record,
            sessionId: "f".repeat(43),
            activeFacilityId: "facility-2",
            createdAtMilliseconds: rotatedAt,
          },
          {
            sessionId: oldRecord.sessionId,
            uid: oldRecord.uid,
            credentialHash: oldRecord.credentialHash,
          },
          authorization,
          rotatedAt,
        ),
      ).resolves.toBe("authorization_conflict");
      expect(
        value.documents.get(
          `${serverSessionCollection}/${oldRecord.sessionId}`,
        ),
      ).toEqual(oldRecord);
      expect(
        value.documents.has(`${serverSessionCollection}/${"f".repeat(43)}`),
      ).toBe(false);
    },
  );

  it("fails closed before writes on rotation mismatch or malformed identifiers", async () => {
    const value = firestore();
    const store = createFirestoreServerSessionStore(value.sdk as never);
    const oldRecord = { ...record, sessionId: "e".repeat(43) };
    value.documents.set(
      `${serverSessionCollection}/${oldRecord.sessionId}`,
      oldRecord,
    );
    const before = new Map(value.documents);
    await expect(
      store.create(
        { ...record, sessionId: "f".repeat(43) },
        "c".repeat(64),
        {
          sessionId: oldRecord.sessionId,
          uid: oldRecord.uid,
          credentialHash: "0".repeat(64),
        },
        record.createdAtMilliseconds + 1,
      ),
    ).resolves.toBe("rotation_conflict");
    expect(value.documents).toEqual(before);
    await expect(
      store.create(record, "not-a-digest", null, record.createdAtMilliseconds),
    ).rejects.toThrow();
    await expect(store.get("../escape")).rejects.toThrow();
  });

  it("validates stored records and revokes an active session", async () => {
    const value = firestore();
    const store = createFirestoreServerSessionStore(value.sdk as never);
    value.documents.set(
      `${serverSessionCollection}/${record.sessionId}`,
      record,
    );
    await expect(store.get(record.sessionId)).resolves.toEqual(record);
    await store.revoke(record.sessionId, record.createdAtMilliseconds + 1);
    await expect(store.get(record.sessionId)).resolves.toMatchObject({
      revokedAtMilliseconds: record.createdAtMilliseconds + 1,
    });

    value.documents.set(`${serverSessionCollection}/${record.sessionId}`, {
      ...record,
      expiresAtMilliseconds: record.createdAtMilliseconds + 99_999_999,
    });
    await expect(store.get(record.sessionId)).rejects.toThrow();
  });

  it("treats a legacy schema-v1 session as an unauthenticated miss", async () => {
    const value = firestore();
    const store = createFirestoreServerSessionStore(value.sdk as never);
    value.documents.set(`${serverSessionCollection}/${record.sessionId}`, {
      ...record,
      schemaVersion: 1,
      activeFacilityId: undefined,
    });
    await expect(store.get(record.sessionId)).resolves.toBeNull();
  });
});
