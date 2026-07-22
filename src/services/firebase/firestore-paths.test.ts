import { describe, expect, it } from "vitest";

import { trustedSessionPaths } from "./firestore-paths";

describe("trusted session Firestore paths", () => {
  it("builds the three canonical repository paths", () => {
    expect(trustedSessionPaths.userProfile("user-1")).toEqual([
      "userProfiles",
      "user-1",
    ]);
    expect(trustedSessionPaths.roleAssignments("user-1")).toEqual([
      "userRoleAssignments",
      "user-1",
      "assignments",
    ]);
    expect(trustedSessionPaths.tenantDirectory("tenant-1")).toEqual([
      "tenantDirectories",
      "tenant-1",
    ]);
  });

  it.each([
    "",
    "../tenant-2",
    "tenant\\path",
    " tenant-1",
    "tenant-1 ",
    ".",
    "..",
    "tenant\u0000one",
    "tenant\none",
    "tenant\u200Bone",
    "tenant／one",
    "مستأجر-1",
  ])("rejects unsafe document identifier %j", (identifier) => {
    expect(() => trustedSessionPaths.userProfile(identifier)).toThrow(
      "Invalid trusted-session document identifier",
    );
  });
});
