import type {
  FloorStockConfigurationRecord,
  InventoryLocationRecord,
  InventoryLotRecord,
  MedicationItemRecord,
} from "./types";
import type {
  InventoryProvisioningActorContext,
  InventoryProvisioningAuditRecord,
  InventoryProvisioningOperation,
  InventoryProvisioningRequestRecord,
} from "./provisioning-types";

export interface InventoryProvisioningTransaction {
  revalidateActor(
    context: InventoryProvisioningActorContext,
    operation: InventoryProvisioningOperation,
  ): Promise<boolean>;
  getItem(itemId: string): Promise<unknown | null>;
  getLocation(locationId: string): Promise<unknown | null>;
  getLot(lotId: string): Promise<unknown | null>;
  getConfiguration(configurationId: string): Promise<unknown | null>;
  getRequest(namespaceId: string): Promise<unknown | null>;
  listItemsByCode(
    tenantId: string,
    itemCode: string,
    maximum: number,
  ): Promise<readonly unknown[]>;
  listLotsByIdentity(
    tenantId: string,
    facilityId: string,
    itemId: string,
    lotNumber: string,
    maximum: number,
  ): Promise<readonly unknown[]>;
  listConfigurationsByIdentity(
    tenantId: string,
    facilityId: string,
    departmentId: string,
    locationId: string,
    itemId: string,
    maximum: number,
  ): Promise<readonly unknown[]>;
  hasItemActivity(tenantId: string, itemId: string): Promise<boolean>;
  hasLocationActivity(
    tenantId: string,
    facilityId: string,
    locationId: string,
  ): Promise<boolean>;
  hasLotActivity(
    tenantId: string,
    facilityId: string,
    lotId: string,
  ): Promise<boolean>;
  setItem(record: MedicationItemRecord): void;
  setLocation(record: InventoryLocationRecord): void;
  setLot(record: InventoryLotRecord): void;
  setConfiguration(record: FloorStockConfigurationRecord): void;
  createAudit(record: InventoryProvisioningAuditRecord): void;
  createRequest(record: InventoryProvisioningRequestRecord): void;
}

export interface InventoryProvisioningStore {
  runTransaction<T>(
    operation: (transaction: InventoryProvisioningTransaction) => Promise<T>,
  ): Promise<T>;
}
