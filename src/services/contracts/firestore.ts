export interface DocumentReference<T> {
  collection: string;
  id: string;
  readonly __documentType?: T;
}

export interface QueryConstraint<T> {
  field: keyof T;
  operator: "==" | "in";
  value: unknown;
}

export interface FirestoreService {
  getDocument<T>(reference: DocumentReference<T>): Promise<T | null>;
  listDocuments<T>(
    collection: string,
    constraints?: readonly QueryConstraint<T>[],
  ): Promise<readonly T[]>;
}
