import { describe, expect, it, vi } from "vitest";

import {
  createFirestoreServerSessionStore,
  serverSessionCollection,
  sessionTokenExchangeCollection,
} from "./firestore-store";
import type { ServerSessionRecord } from "./types";

const record: ServerSessionRecord = {
  schemaVersion: 1,
  sessionId: "a".repeat(43),
  uid: "user-1",
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
  const transaction = {
    get: vi.fn(async (document: { path: string }) => ({
      exists: documents.has(document.path),
      data: () => documents.get(document.path),
    })),
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
      collection: vi.fn((collection: string) => ({
        doc: (id: string) => reference(`${collection}/${id}`),
      })),
      runTransaction: vi.fn(
        async (operation: (value: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    },
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
});
