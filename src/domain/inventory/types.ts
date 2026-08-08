import type { FeatureFlagSet, UserScope } from "@/domain/platform/types";
import type {
  PermissionOverride,
  ScopedRoleAssignment,
} from "@/domain/access/types";

export const inventoryUnits = [
  "each",
  "tablet",
  "capsule",
  "vial",
  "ampoule",
  "bottle",
  "box",
  "pack",
  "ml",
  "mg",
  "g",
] as const;
export type InventoryUnit = (typeof inventoryUnits)[number];

export const inventoryLocationKinds = [
  "central_store",
  "pharmacy",
  "floor_stock",
  "ward",
  "clinic",
  "emergency_unit",
  "virtual_adjustment",
] as const;
export type InventoryLocationKind = (typeof inventoryLocationKinds)[number];

export const inventoryTransactionTypes = [
  "receipt",
  "issue",
  "adjustment_increase",
  "adjustment_decrease",
  "transfer",
  "request_fulfillment",
] as const;
export type InventoryTransactionType =
  (typeof inventoryTransactionTypes)[number];

export const inventoryOperations = [
  "receive",
  "issue",
  "adjust_increase",
  "adjust_decrease",
  "transfer",
] as const;
export type InventoryOperation = (typeof inventoryOperations)[number];

export interface InventoryUnitConversion {
  fromUnit: InventoryUnit;
  toBaseUnitMultiplier: number;
}

export interface MedicationItemRecord {
  schemaVersion: 1;
  itemId: string;
  tenantId: string;
  itemCode: string;
  genericName: string;
  brandName?: string;
  dosageForm: string;
  strength: string;
  baseUnit: InventoryUnit;
  dispensingUnit: InventoryUnit;
  unitConversions: readonly InventoryUnitConversion[];
  status: "active" | "inactive";
  lotControlled: boolean;
  expiryControlled: boolean;
  negativeStockAllowed: boolean;
  barcodeIds: readonly string[];
  externalReference?: string;
}

export interface InventoryLocationRecord {
  schemaVersion: 1;
  locationId: string;
  tenantId: string;
  platformId: string;
  organizationId: string;
  facilityId: string;
  departmentId: string | null;
  parentLocationId: string | null;
  kind: InventoryLocationKind;
  displayName: string;
  status: "active" | "inactive";
}

export interface InventoryLotRecord {
  schemaVersion: 1;
  lotId: string;
  tenantId: string;
  facilityId: string;
  itemId: string;
  lotNumber: string;
  expiryDate: string;
  status: "active" | "inactive";
}

export interface FloorStockConfigurationRecord {
  schemaVersion: 1;
  configurationId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  departmentId: string;
  locationId: string;
  itemId: string;
  unit: InventoryUnit;
  minimumQuantity: number;
  maximumQuantity: number;
  reorderThreshold: number;
  status: "active" | "inactive";
}

export interface InventoryBalanceIdentity {
  tenantId: string;
  facilityId: string;
  departmentId: string | null;
  locationId: string;
  itemId: string;
  lotId: string | null;
  expiryDate: string | null;
  unit: InventoryUnit;
}

export interface InventoryBalanceRecord extends InventoryBalanceIdentity {
  schemaVersion: 1;
  balanceId: string;
  quantity: number;
  version: number;
  updatedAt: string;
  lastTransactionId: string;
}

export interface InventoryTransactionRecord {
  schemaVersion: 1;
  transactionId: string;
  type: InventoryTransactionType;
  status: "posted";
  actorUid: string;
  requestId: string;
  tenantId: string;
  platformId: string;
  organizationId: string;
  facilityId: string;
  sourceDepartmentId: string | null;
  destinationDepartmentId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  reasonCode: string | null;
  lineCount: number;
  postedAt: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface InventoryTransactionLineRecord {
  schemaVersion: 1;
  lineId: string;
  transactionId: string;
  lineNumber: number;
  itemId: string;
  lotId: string | null;
  expiryDate: string | null;
  enteredUnit: InventoryUnit;
  enteredQuantity: number;
  baseUnit: InventoryUnit;
  baseQuantity: number;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  floorStockRequestId: string | null;
  floorStockRequestLineId: string | null;
}

export interface InventoryAuditEventRecord {
  schemaVersion: 1;
  eventId: string;
  actorUid: string;
  action: InventoryOperation | "request_fulfillment";
  targetType: "inventory_transaction";
  targetId: string;
  requestId: string;
  tenantId: string;
  facilityId: string;
  sourceDepartmentId: string | null;
  destinationDepartmentId: string | null;
  timestamp: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface InventoryIdempotencyRecord {
  schemaVersion: 1;
  namespaceId: string;
  actorUid: string;
  tenantId: string;
  operation: InventoryOperation;
  requestId: string;
  payloadHash: string;
  transactionId: string;
  createdAt: string;
}

export interface InventoryPostingLineInput {
  itemId: string;
  lotId?: string;
  expiryDate?: string;
  unit: InventoryUnit;
  quantity: number;
}

export interface InventoryPostingInput {
  sourceLocationId?: string;
  destinationLocationId?: string;
  locationId?: string;
  reasonCode?: string;
  lines: readonly InventoryPostingLineInput[];
}

export interface InventoryActorContext {
  uid: string;
  tenantId: string;
  platformId: string;
  organizationId: string;
  activeFacilityId: string;
  activeScope: Extract<UserScope, { kind: "facility" }>;
  roleAssignments: readonly ScopedRoleAssignment[];
  explicitPermissionOverrides: readonly PermissionOverride[];
  featureFlags: FeatureFlagSet;
  trustedStateFingerprint: string;
}

export type InventoryFailureCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "insufficient_stock"
  | "inactive_item"
  | "expired_lot"
  | "provider_unavailable";

export type InventoryResult<T> =
  { ok: true; value: T } | { ok: false; code: InventoryFailureCode };

export interface PostedInventoryResult {
  transactionId: string;
  duplicate: boolean;
}

export interface InventoryPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface InventoryItemSummary {
  itemId: string;
  itemCode: string;
  genericName: string;
  strength: string;
  baseUnit: InventoryUnit;
  lotControlled: boolean;
  expiryControlled: boolean;
}

export interface InventoryLocationSummary {
  locationId: string;
  displayName: string;
  kind: InventoryLocationKind;
  departmentId: string | null;
}

export interface InventoryBalanceSummary {
  balanceId: string;
  locationId: string;
  itemId: string;
  lotId: string | null;
  expiryDate: string | null;
  unit: InventoryUnit;
  quantity: number;
}

export interface InventoryTransactionSummary {
  transactionId: string;
  type: InventoryTransactionType;
  actorUid: string;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  lineCount: number;
  postedAt: string;
}

export interface InventoryDirectoryFilters {
  itemId?: string;
  locationId?: string;
  transactionType?: InventoryTransactionType;
}
