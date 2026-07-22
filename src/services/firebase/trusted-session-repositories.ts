import type {
  RoleAssignmentRepository,
  TenantDirectoryRepository,
  UserProfileRepository,
} from "@/services/contracts/auth";

import {
  getTrustedFirestoreReader,
  type TrustedFirestoreReader,
} from "./firestore-reader";
import { trustedSessionPaths } from "./firestore-paths";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "./trusted-session-records";
import { trustedSessionLimits } from "./trusted-session-limits";

export interface TrustedSessionRepositoryAdapters {
  userProfiles: UserProfileRepository;
  roleAssignments: RoleAssignmentRepository;
  tenantDirectories: TenantDirectoryRepository;
}

export function createTrustedSessionRepositoryAdapters(
  reader: TrustedFirestoreReader = getTrustedFirestoreReader(),
): TrustedSessionRepositoryAdapters {
  return {
    userProfiles: {
      async getByUid(uid) {
        const document = await reader.getDocument(
          trustedSessionPaths.userProfile(uid),
        );
        if (document === null) return null;

        const profile = parseTrustedUserProfile(document);
        if (profile.uid !== uid) {
          throw new Error("Trusted user profile identity mismatch.");
        }
        return profile;
      },
    },

    roleAssignments: {
      async listByUid(uid, tenantId) {
        const documents = await reader.listDocuments(
          trustedSessionPaths.roleAssignments(uid),
          [
            { field: "uid", value: uid },
            { field: "tenantId", value: tenantId },
          ],
          trustedSessionLimits.roleAssignments + 1,
        );
        if (documents.length > trustedSessionLimits.roleAssignments) {
          throw new Error("Trusted role assignment limit exceeded.");
        }
        return documents.map((document) => {
          const assignment = parseTrustedRoleAssignment(document);
          if (assignment.uid !== uid) {
            throw new Error("Trusted role assignment identity mismatch.");
          }
          if (assignment.tenantId !== tenantId) {
            throw new Error("Trusted role assignment tenant mismatch.");
          }
          return assignment;
        });
      },
    },

    tenantDirectories: {
      async getByTenantId(tenantId) {
        const document = await reader.getDocument(
          trustedSessionPaths.tenantDirectory(tenantId),
        );
        if (document === null) return null;

        const directory = parseTrustedTenantDirectory(document);
        if (directory.tenantId !== tenantId) {
          throw new Error("Trusted tenant directory identity mismatch.");
        }
        return directory;
      },
    },
  };
}

let trustedSessionRepositories: TrustedSessionRepositoryAdapters | undefined;

export function getTrustedSessionRepositoryAdapters(): TrustedSessionRepositoryAdapters {
  trustedSessionRepositories ??= createTrustedSessionRepositoryAdapters();
  return trustedSessionRepositories;
}
