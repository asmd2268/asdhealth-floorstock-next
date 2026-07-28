import { describe, expect, it } from "vitest";

import { parseServerSessionRecord } from "./validation";

const record = {
  schemaVersion: 2,
  sessionId: "a".repeat(43),
  uid: "user-1",
  activeFacilityId: "facility-1",
  credentialHash: "b".repeat(64),
  firebaseAuthTimeSeconds: 1_800_000_000,
  createdAtMilliseconds: 1_800_000_000_000,
  expiresAtMilliseconds: 1_800_028_800_000,
  revokedAtMilliseconds: null,
} as const;

describe("server session record validation", () => {
  it("accepts a bounded canonical record", () => {
    expect(parseServerSessionRecord(record)).toEqual(record);
  });

  it("rejects legacy and unknown schema versions with a controlled validation failure", () => {
    for (const schemaVersion of [1, 3, undefined]) {
      expect(() =>
        parseServerSessionRecord({ ...record, schemaVersion }),
      ).toThrow();
    }
  });

  it.each([" user-1", "user/1", "user\u0000", "user-١"])(
    "rejects unsafe UID %j",
    (uid) => {
      expect(() => parseServerSessionRecord({ ...record, uid })).toThrow();
    },
  );

  it.each([" facility-1", "facility/1", "facility\u0000", "منشأة-1"])(
    "rejects unsafe active facility %j",
    (activeFacilityId) => {
      expect(() =>
        parseServerSessionRecord({ ...record, activeFacilityId }),
      ).toThrow();
    },
  );

  it("rejects future authentication, excessive lifetime, and pre-creation revocation", () => {
    for (const malformed of [
      {
        ...record,
        firebaseAuthTimeSeconds:
          Math.floor(record.createdAtMilliseconds / 1000) + 61,
      },
      {
        ...record,
        expiresAtMilliseconds: record.createdAtMilliseconds + 28_800_001,
      },
      {
        ...record,
        revokedAtMilliseconds: record.createdAtMilliseconds - 1,
      },
    ]) {
      expect(() => parseServerSessionRecord(malformed)).toThrow();
    }
  });
});
