import { requireCanonicalTrustedIdentifier } from "./trusted-identifier";

const collections = {
  userProfiles: "userProfiles",
  userRoleAssignments: "userRoleAssignments",
  assignments: "assignments",
  tenantDirectories: "tenantDirectories",
} as const;

export const trustedSessionPaths = {
  userProfile(uid: string) {
    return [
      collections.userProfiles,
      requireCanonicalTrustedIdentifier(uid),
    ] as const;
  },
  roleAssignments(uid: string) {
    return [
      collections.userRoleAssignments,
      requireCanonicalTrustedIdentifier(uid),
      collections.assignments,
    ] as const;
  },
  tenantDirectory(tenantId: string) {
    return [
      collections.tenantDirectories,
      requireCanonicalTrustedIdentifier(tenantId),
    ] as const;
  },
};

export { collections as trustedSessionCollections };
