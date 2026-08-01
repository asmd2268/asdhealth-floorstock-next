import type {
  FloorStockRequestActorContext,
  FloorStockRequestAuditRecord,
  FloorStockRequestIdempotencyRecord,
  FloorStockRequestLineRecord,
  FloorStockRequestOperation,
  FloorStockRequestRecord,
} from "./types";
import type {
  InventoryAuditEventRecord,
  InventoryBalanceRecord,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
} from "@/domain/inventory/types";

export interface FloorStockRequestTransaction {
  revalidateActor(
    context: FloorStockRequestActorContext,
    operation: FloorStockRequestOperation,
  ): Promise<boolean>;
  getRequest(floorStockRequestId: string): Promise<unknown | null>;
  getConfiguration(configurationId: string): Promise<unknown | null>;
  getItem(itemId: string): Promise<unknown | null>;
  getLocation(locationId: string): Promise<unknown | null>;
  getLot(lotId: string): Promise<unknown | null>;
  getBalance(balanceId: string): Promise<unknown | null>;
  getIdempotency(namespaceId: string): Promise<unknown | null>;
  listLines(
    floorStockRequestId: string,
    maximum: number,
  ): Promise<readonly unknown[]>;
  createRequest(record: FloorStockRequestRecord): void;
  setRequest(record: FloorStockRequestRecord): void;
  createLine(record: FloorStockRequestLineRecord): void;
  setLine(record: FloorStockRequestLineRecord): void;
  createAudit(record: FloorStockRequestAuditRecord): void;
  createIdempotency(record: FloorStockRequestIdempotencyRecord): void;
  createInventoryTransaction(record: InventoryTransactionRecord): void;
  createInventoryLine(record: InventoryTransactionLineRecord): void;
  setInventoryBalance(record: InventoryBalanceRecord): void;
  createInventoryAudit(record: InventoryAuditEventRecord): void;
}

export interface FloorStockRequestStore {
  runTransaction<T>(
    operation: (transaction: FloorStockRequestTransaction) => Promise<T>,
  ): Promise<T>;
}
