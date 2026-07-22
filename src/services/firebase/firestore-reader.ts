import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import { getBrowserFirebaseApp } from "./browser";

export interface TrustedFirestoreReader {
  getDocument(path: readonly [string, string]): Promise<unknown | null>;
  listDocuments(
    path: readonly [string, string, string],
    constraints: readonly FirestoreEqualityConstraint[],
    maxResults: number,
  ): Promise<readonly unknown[]>;
}

export interface FirestoreEqualityConstraint {
  field: string;
  value: string;
}

export interface FirestoreReaderSdk {
  getFirestore(): unknown;
  getDocument(
    firestore: unknown,
    path: readonly [string, string],
  ): Promise<unknown | null>;
  listDocuments(
    firestore: unknown,
    path: readonly [string, string, string],
    constraints: readonly FirestoreEqualityConstraint[],
    maxResults: number,
  ): Promise<readonly unknown[]>;
}

const firebaseFirestoreSdk: FirestoreReaderSdk = {
  getFirestore: () => getFirestore(getBrowserFirebaseApp()),
  async getDocument(firestore, path) {
    const snapshot = await getDoc(doc(firestore as Firestore, ...path));
    return snapshot.exists() ? snapshot.data() : null;
  },
  async listDocuments(firestore, path, constraints, maxResults) {
    const reference = collection(firestore as Firestore, ...path);
    const snapshot = await getDocs(
      query(
        reference,
        ...constraints.map((constraint) =>
          where(constraint.field, "==", constraint.value),
        ),
        limit(maxResults),
      ),
    );
    return snapshot.docs.map((document) => document.data());
  },
};

export function createTrustedFirestoreReader(
  sdk: FirestoreReaderSdk = firebaseFirestoreSdk,
): TrustedFirestoreReader {
  let firestore: unknown;
  const resolveFirestore = () => {
    firestore ??= sdk.getFirestore();
    return firestore;
  };

  return {
    getDocument: (path) => sdk.getDocument(resolveFirestore(), path),
    listDocuments: (path, constraints, maxResults) =>
      sdk.listDocuments(resolveFirestore(), path, constraints, maxResults),
  };
}

let trustedFirestoreReader: TrustedFirestoreReader | undefined;

export function getTrustedFirestoreReader(): TrustedFirestoreReader {
  trustedFirestoreReader ??= createTrustedFirestoreReader();
  return trustedFirestoreReader;
}
