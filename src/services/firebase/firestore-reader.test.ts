import { describe, expect, it, vi } from "vitest";

import {
  createTrustedFirestoreReader,
  type FirestoreReaderSdk,
} from "./firestore-reader";

describe("trusted Firestore reader", () => {
  it("initializes one Firestore instance and performs one-time reads", async () => {
    const firestore = { id: "firestore-1" };
    const sdk: FirestoreReaderSdk = {
      getFirestore: vi.fn(() => firestore),
      getDocument: vi.fn().mockResolvedValue({ uid: "user-1" }),
      listDocuments: vi.fn().mockResolvedValue([{ roleId: "master" }]),
    };
    const reader = createTrustedFirestoreReader(sdk);

    await reader.getDocument(["userProfiles", "user-1"]);
    await reader.listDocuments(
      ["userRoleAssignments", "user-1", "assignments"],
      [
        { field: "uid", value: "user-1" },
        { field: "tenantId", value: "tenant-1" },
      ],
      51,
    );

    expect(sdk.getFirestore).toHaveBeenCalledOnce();
    expect(sdk.getDocument).toHaveBeenCalledWith(firestore, [
      "userProfiles",
      "user-1",
    ]);
    expect(sdk.listDocuments).toHaveBeenCalledWith(
      firestore,
      ["userRoleAssignments", "user-1", "assignments"],
      [
        { field: "uid", value: "user-1" },
        { field: "tenantId", value: "tenant-1" },
      ],
      51,
    );
  });
});
