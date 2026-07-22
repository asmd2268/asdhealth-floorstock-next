import "server-only";

import {
  getFirestore,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";

import type {
  ProvisioningDocumentPath,
  ProvisioningStore,
  ProvisioningTransaction,
} from "@/domain/provisioning/store";

import { getFirebaseAdminApp } from "./app";

function documentReference(
  firestore: Firestore,
  path: ProvisioningDocumentPath,
) {
  return firestore.doc(path.join("/"));
}

function collectionReference(
  firestore: Firestore,
  path: ProvisioningDocumentPath,
) {
  return firestore.collection(path.join("/"));
}

function createTransactionAdapter(
  firestore: Firestore,
  transaction: Transaction,
): ProvisioningTransaction {
  return {
    async get(path) {
      const snapshot = await transaction.get(
        documentReference(firestore, path),
      );
      return snapshot.exists ? snapshot.data() : null;
    },
    async query(path, filters, maxResults) {
      let query: Query = collectionReference(firestore, path);
      for (const filter of filters) {
        query = query.where(filter.field, "==", filter.value);
      }
      const snapshot = await transaction.get(query.limit(maxResults));
      return snapshot.docs.map((document) => document.data());
    },
    create(path, data) {
      transaction.create(documentReference(firestore, path), data);
    },
    set(path, data) {
      transaction.set(documentReference(firestore, path), data);
    },
    delete(path) {
      transaction.delete(documentReference(firestore, path));
    },
  };
}

export function createFirebaseAdminProvisioningStore(
  firestore: Firestore,
): ProvisioningStore {
  return {
    runTransaction: (operation) =>
      firestore.runTransaction((transaction) =>
        operation(createTransactionAdapter(firestore, transaction)),
      ),
  };
}

let provisioningStore: ProvisioningStore | undefined;

export function getFirebaseAdminProvisioningStore(): ProvisioningStore {
  provisioningStore ??= createFirebaseAdminProvisioningStore(
    getFirestore(getFirebaseAdminApp()),
  );
  return provisioningStore;
}
