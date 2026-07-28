import "server-only";

import {
  FieldPath,
  getFirestore,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import { ADMINISTRATION_READ_LIMIT } from "@/domain/administration/types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";

export interface RawAdministrationDocument {
  id: string;
  data: unknown;
}

export interface AdministrationRepository {
  getTenantDirectory(tenantId: string): Promise<unknown | null>;
  getUserProfile(uid: string): Promise<unknown | null>;
  getAdministratorPrincipal(uid: string): Promise<unknown | null>;
  listUserProfiles(
    tenantId: string,
    cursor: string | null,
    limit: number,
  ): Promise<readonly RawAdministrationDocument[]>;
  listRoleAssignments(
    uid: string,
    tenantId: string,
  ): Promise<readonly RawAdministrationDocument[]>;
  listAuditEvents(
    tenantId: string,
    cursor: string | null,
    limit: number,
  ): Promise<readonly RawAdministrationDocument[]>;
}

export function createFirebaseAdminAdministrationRepository(
  firestore: Firestore,
): AdministrationRepository {
  const read = async (path: string): Promise<unknown | null> => {
    const snapshot = await firestore.doc(path).get();
    return snapshot.exists ? snapshot.data() : null;
  };

  return {
    getTenantDirectory: (tenantId) => read(`tenantDirectories/${tenantId}`),
    getUserProfile: (uid) => read(`userProfiles/${uid}`),
    getAdministratorPrincipal: (uid) =>
      read(`provisioningAdministrators/${uid}`),
    async listUserProfiles(tenantId, cursor, limit) {
      let query: Query = firestore
        .collection("userProfiles")
        .where("tenantId", "==", tenantId)
        .orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query
        .limit(Math.min(limit, ADMINISTRATION_READ_LIMIT))
        .get();
      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },
    async listRoleAssignments(uid, tenantId) {
      const snapshot = await firestore
        .collection(`userRoleAssignments/${uid}/assignments`)
        .where("uid", "==", uid)
        .where("tenantId", "==", tenantId)
        .orderBy(FieldPath.documentId())
        .limit(ADMINISTRATION_READ_LIMIT)
        .get();
      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },
    async listAuditEvents(tenantId, cursor, limit) {
      let query: Query = firestore
        .collection("provisioningAuditEvents")
        .where("tenantId", "==", tenantId)
        .orderBy(FieldPath.documentId(), "desc");
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query
        .limit(Math.min(limit, ADMINISTRATION_READ_LIMIT))
        .get();
      return snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
    },
  };
}

let repository: AdministrationRepository | undefined;

export function getAdministrationRepository(): AdministrationRepository {
  repository ??= createFirebaseAdminAdministrationRepository(
    getFirestore(getFirebaseAdminApp()),
  );
  return repository;
}
