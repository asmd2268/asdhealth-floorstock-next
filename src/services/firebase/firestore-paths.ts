const collections = {
  userProfiles: "userProfiles",
  userRoleAssignments: "userRoleAssignments",
  assignments: "assignments",
  tenantDirectories: "tenantDirectories",
} as const;

function documentId(value: string): string {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.trim() !== value
  ) {
    throw new Error("Invalid trusted-session document identifier.");
  }
  return value;
}

export const trustedSessionPaths = {
  userProfile(uid: string) {
    return [collections.userProfiles, documentId(uid)] as const;
  },
  roleAssignments(uid: string) {
    return [
      collections.userRoleAssignments,
      documentId(uid),
      collections.assignments,
    ] as const;
  },
  tenantDirectory(tenantId: string) {
    return [collections.tenantDirectories, documentId(tenantId)] as const;
  },
};

export { collections as trustedSessionCollections };
