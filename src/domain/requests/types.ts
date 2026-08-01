import type {
  PermissionOverride,
  ScopedRoleAssignment,
} from "@/domain/access/types";
import type { InventoryUnit } from "@/domain/inventory/types";
import type { FeatureFlagSet, UserScope } from "@/domain/platform/types";

export const floorStockRequestStatuses = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "fulfilling",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type FloorStockRequestStatus =
  (typeof floorStockRequestStatuses)[number];

export const floorStockRequestOperations = [
  "create",
  "submit",
  "approve",
  "reject",
  "start_fulfillment",
  "complete_fulfillment",
  "deliver",
  "cancel",
] as const;
export type FloorStockRequestOperation =
  (typeof floorStockRequestOperations)[number];

export interface FloorStockRequestRecord {
  schemaVersion: 1;
  floorStockRequestId: string;
  tenantId: string;
  platformId: string;
  organizationId: string;
  facilityId: string;
  departmentId: string;
  status: FloorStockRequestStatus;
  requestedByUid: string;
  lastActorUid: string;
  lineCount: number;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  fulfillmentStartedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

export interface FloorStockRequestLineRecord {
  schemaVersion: 1;
  lineId: string;
  floorStockRequestId: string;
  lineNumber: number;
  configurationId: string;
  itemId: string;
  locationId: string;
  unit: InventoryUnit;
  requestedQuantity: number;
  approvedQuantity: number | null;
  fulfilledQuantity: number | null;
}

export interface FloorStockRequestAuditRecord {
  schemaVersion: 1;
  eventId: string;
  actorUid: string;
  action: FloorStockRequestOperation;
  targetType: "floor_stock_request";
  targetId: string;
  requestId: string;
  tenantId: string;
  facilityId: string;
  departmentId: string;
  timestamp: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface FloorStockRequestIdempotencyRecord {
  schemaVersion: 1;
  namespaceId: string;
  actorUid: string;
  tenantId: string;
  operation: FloorStockRequestOperation;
  requestId: string;
  payloadHash: string;
  floorStockRequestId: string;
  createdAt: string;
}

export interface CreateFloorStockRequestLineInput {
  configurationId: string;
  quantity: number;
}

export interface CreateFloorStockRequestInput {
  note?: string;
  lines: readonly CreateFloorStockRequestLineInput[];
}

export interface FloorStockRequestActorContext {
  uid: string;
  tenantId: string;
  platformId: string;
  organizationId: string;
  activeFacilityId: string;
  activeDepartmentId: string | null;
  activeScope: Extract<UserScope, { kind: "facility" }>;
  roleAssignments: readonly ScopedRoleAssignment[];
  explicitPermissionOverrides: readonly PermissionOverride[];
  featureFlags: FeatureFlagSet;
  trustedStateFingerprint: string;
}

export type FloorStockRequestFailureCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "inactive_configuration"
  | "inactive_item"
  | "provider_unavailable";

export type FloorStockRequestResult<T> =
  { ok: true; value: T } | { ok: false; code: FloorStockRequestFailureCode };

export interface MutatedFloorStockRequestResult {
  floorStockRequestId: string;
  status: FloorStockRequestStatus;
  duplicate: boolean;
}

export interface FloorStockRequestSummary {
  floorStockRequestId: string;
  departmentId: string;
  status: FloorStockRequestStatus;
  requestedByUid: string;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FloorStockRequestConfigurationSummary {
  configurationId: string;
  itemId: string;
  itemCode: string;
  genericName: string;
  strength: string;
  locationId: string;
  locationName: string;
  unit: InventoryUnit;
  maximumQuantity: number;
}

export interface FloorStockRequestPage {
  items: readonly FloorStockRequestSummary[];
  nextCursor: string | null;
}
