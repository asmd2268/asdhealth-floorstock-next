import "server-only";

import {
  getFirestore,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import type {
  RoleAssignmentRepository,
  TenantDirectoryRepository,
  UserProfileRepository,
} from "@/services/contracts/auth";
import { trustedSessionPaths } from "@/services/firebase/firestore-paths";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "@/services/firebase/trusted-session-records";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

import { getFirebaseAdminApp } from "../firebase-admin/app";

export interface ServerTrustedRepositoryAdapters {
  userProfiles: UserProfileRepository;
  roleAssignments: RoleAssignmentRepository;
  tenantDirectories: TenantDirectoryRepository;
}

export function createServerTrustedRepositoryAdapters(
  firestore: Firestore,
): ServerTrustedRepositoryAdapters {
  return {
    userProfiles: {
      async getByUid(uid) {
        const path = trustedSessionPaths.userProfile(uid).join("/");
        const snapshot = await firestore.doc(path).get();
        if (!snapshot.exists) return null;
        const profile = parseTrustedUserProfile(snapshot.data());
        if (profile.uid !== uid) throw new Error("Trusted identity mismatch.");
        return profile;
      },
    },
    roleAssignments: {
      async listByUid(uid, tenantId) {
        const path = trustedSessionPaths.roleAssignments(uid).join("/");
        let query: Query = firestore.collection(path);
        query = query.where("uid", "==", uid).where("tenantId", "==", tenantId);
        const snapshot = await query
          .limit(trustedSessionLimits.roleAssignments + 1)
          .get();
        if (snapshot.size > trustedSessionLimits.roleAssignments) {
          throw new Error("Trusted role assignment limit exceeded.");
        }
        return snapshot.docs.map((document) => {
          const assignment = parseTrustedRoleAssignment(document.data());
          if (assignment.uid !== uid || assignment.tenantId !== tenantId) {
            throw new Error("Trusted role assignment boundary mismatch.");
          }
          return assignment;
        });
      },
    },
    tenantDirectories: {
      async getByTenantId(tenantId) {
        const path = trustedSessionPaths.tenantDirectory(tenantId).join("/");
        const snapshot = await firestore.doc(path).get();
        if (!snapshot.exists) return null;
        const directory = parseTrustedTenantDirectory(snapshot.data());
        if (directory.tenantId !== tenantId) {
          throw new Error("Trusted tenant boundary mismatch.");
        }
        return directory;
      },
    },
  };
}

let repositories: ServerTrustedRepositoryAdapters | undefined;

export function getServerTrustedRepositoryAdapters(): ServerTrustedRepositoryAdapters {
  repositories ??= createServerTrustedRepositoryAdapters(
    getFirestore(getFirebaseAdminApp()),
  );
  return repositories;
}
