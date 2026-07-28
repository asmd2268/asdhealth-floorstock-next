import type {
  InventoryActorContext,
  InventoryAuditEventRecord,
  InventoryBalanceRecord,
  InventoryIdempotencyRecord,
  InventoryLocationRecord,
  InventoryLotRecord,
  InventoryOperation,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
  MedicationItemRecord,
} from "./types";

export interface InventoryTransactionStore {
  revalidateActor(
    context: InventoryActorContext,
    operation: InventoryOperation,
  ): Promise<boolean>;
  getItem(itemId: string): Promise<unknown | null>;
  getLocation(locationId: string): Promise<unknown | null>;
  getLot(lotId: string): Promise<unknown | null>;
  getBalance(balanceId: string): Promise<unknown | null>;
  getRequest(namespaceId: string): Promise<unknown | null>;
  createTransaction(record: InventoryTransactionRecord): void;
  createLine(record: InventoryTransactionLineRecord): void;
  setBalance(record: InventoryBalanceRecord): void;
  createAudit(record: InventoryAuditEventRecord): void;
  createRequest(record: InventoryIdempotencyRecord): void;
}

export interface InventoryStore {
  runTransaction<T>(
    operation: (transaction: InventoryTransactionStore) => Promise<T>,
  ): Promise<T>;
}

export type InventoryTrustedRecord =
  | MedicationItemRecord
  | InventoryLocationRecord
  | InventoryLotRecord
  | InventoryBalanceRecord;
