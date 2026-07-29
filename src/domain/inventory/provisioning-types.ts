import type { ResourceId } from "@/domain/access/types";

import type {
  FloorStockConfigurationRecord,
  InventoryActorContext,
  InventoryLocationKind,
  InventoryUnit,
} from "./types";

export const inventoryProvisioningOperations = [
  "upsert_item",
  "upsert_location",
  "upsert_lot",
  "upsert_floor_stock_configuration",
] as const;

export type InventoryProvisioningOperation =
  (typeof inventoryProvisioningOperations)[number];

export const inventoryProvisioningResource: Readonly<
  Record<InventoryProvisioningOperation, ResourceId>
> = {
  upsert_item: "inventory_item",
  upsert_location: "inventory_location",
  upsert_lot: "inventory_lot",
  upsert_floor_stock_configuration: "floor_stock_configuration",
};

export interface MedicationItemProvisioningInput {
  itemCode: string;
  genericName: string;
  brandName?: string;
  dosageForm: string;
  strength: string;
  baseUnit: InventoryUnit;
  dispensingUnit: InventoryUnit;
  unitConversions: readonly {
    fromUnit: InventoryUnit;
    toBaseUnitMultiplier: number;
  }[];
  status: "active" | "inactive";
  lotControlled: boolean;
  expiryControlled: boolean;
  negativeStockAllowed: boolean;
  barcodeIds: readonly string[];
  externalReference?: string;
}

export interface InventoryLocationProvisioningInput {
  departmentId: string | null;
  parentLocationId: string | null;
  kind: InventoryLocationKind;
  displayName: string;
  status: "active" | "inactive";
}

export interface InventoryLotProvisioningInput {
  itemId: string;
  lotNumber: string;
  expiryDate: string;
  status: "active" | "inactive";
}

export interface FloorStockConfigurationProvisioningInput {
  departmentId: string;
  locationId: string;
  itemId: string;
  unit: InventoryUnit;
  minimumQuantity: number;
  maximumQuantity: number;
  reorderThreshold: number;
  status: FloorStockConfigurationRecord["status"];
}

export type InventoryProvisioningInput =
  | MedicationItemProvisioningInput
  | InventoryLocationProvisioningInput
  | InventoryLotProvisioningInput
  | FloorStockConfigurationProvisioningInput;

export interface InventoryProvisioningRequestRecord {
  schemaVersion: 1;
  namespaceId: string;
  actorUid: string;
  tenantId: string;
  operation: InventoryProvisioningOperation;
  requestId: string;
  targetId: string;
  payloadHash: string;
  createdAt: string;
}

export interface InventoryProvisioningAuditRecord {
  schemaVersion: 1;
  eventId: string;
  actorUid: string;
  action: InventoryProvisioningOperation;
  targetType:
    | "inventory_item"
    | "inventory_location"
    | "inventory_lot"
    | "floor_stock_configuration";
  targetId: string;
  requestId: string;
  tenantId: string;
  facilityId: string;
  timestamp: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface InventoryProvisioningResult {
  targetId: string;
  duplicate: boolean;
}

export type InventoryProvisioningActorContext = InventoryActorContext;
