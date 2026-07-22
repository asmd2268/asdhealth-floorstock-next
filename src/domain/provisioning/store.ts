export type ProvisioningDocumentPath = readonly string[];

export interface ProvisioningTransaction {
  get(path: ProvisioningDocumentPath): Promise<unknown | null>;
  query(
    path: ProvisioningDocumentPath,
    filters: readonly { field: string; value: string }[],
    maxResults: number,
  ): Promise<readonly unknown[]>;
  create(path: ProvisioningDocumentPath, data: unknown): void;
  set(path: ProvisioningDocumentPath, data: unknown): void;
  delete(path: ProvisioningDocumentPath): void;
}

export interface ProvisioningStore {
  runTransaction<T>(
    operation: (transaction: ProvisioningTransaction) => Promise<T>,
  ): Promise<T>;
}
