import "server-only";

import {
  FieldPath,
  getFirestore,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import {
  floorStockConfigurationSchema,
  inventoryLocationSchema,
  medicationItemSchema,
} from "@/domain/inventory/schemas";
import {
  FLOOR_STOCK_REQUEST_PAGE_SIZE,
  FLOOR_STOCK_REQUEST_READ_LIMIT,
  floorStockRequestRecordSchema,
} from "@/domain/requests/schemas";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestConfigurationSummary,
  FloorStockRequestPage,
} from "@/domain/requests/types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";
import { inventoryCollections } from "@/server/inventory/paths";
import { requireCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

import { floorStockRequestCollections } from "./paths";

export interface FloorStockRequestReadContext extends FloorStockRequestActorContext {
  departmentOnly: boolean;
}

export function createFloorStockRequestRepository(firestore: Firestore) {
  return {
    async list(
      context: FloorStockRequestReadContext,
      rawCursor?: string,
    ): Promise<FloorStockRequestPage> {
      const cursor = rawCursor
        ? requireCanonicalTrustedIdentifier(rawCursor)
        : null;
      let query: Query = firestore
        .collection(floorStockRequestCollections.requests)
        .where("tenantId", "==", context.tenantId)
        .where("facilityId", "==", context.activeFacilityId);
      if (context.departmentOnly) {
        if (!context.activeDepartmentId)
          throw new Error("Missing department scope");
        query = query.where("departmentId", "==", context.activeDepartmentId);
      }
      query = query.orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query
        .limit(FLOOR_STOCK_REQUEST_PAGE_SIZE + 1)
        .get();
      const visible = snapshot.docs.slice(0, FLOOR_STOCK_REQUEST_PAGE_SIZE);
      const items = visible.map((document) => {
        const request = floorStockRequestRecordSchema.parse(document.data());
        if (
          request.floorStockRequestId !== document.id ||
          request.tenantId !== context.tenantId ||
          request.facilityId !== context.activeFacilityId ||
          (context.departmentOnly &&
            request.departmentId !== context.activeDepartmentId)
        )
          throw new Error("Request query scope mismatch");
        return {
          floorStockRequestId: request.floorStockRequestId,
          departmentId: request.departmentId,
          status: request.status,
          requestedByUid: request.requestedByUid,
          lineCount: request.lineCount,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        };
      });
      return {
        items,
        nextCursor:
          snapshot.size > FLOOR_STOCK_REQUEST_PAGE_SIZE
            ? (visible.at(-1)?.id ?? null)
            : null,
      };
    },

    async configurations(
      context: FloorStockRequestActorContext,
    ): Promise<readonly FloorStockRequestConfigurationSummary[]> {
      if (!context.activeDepartmentId) return [];
      const snapshot = await firestore
        .collection(inventoryCollections.configurations)
        .where("tenantId", "==", context.tenantId)
        .where("facilityId", "==", context.activeFacilityId)
        .where("departmentId", "==", context.activeDepartmentId)
        .where("status", "==", "active")
        .orderBy(FieldPath.documentId())
        .limit(FLOOR_STOCK_REQUEST_READ_LIMIT)
        .get();
      if (snapshot.size >= FLOOR_STOCK_REQUEST_READ_LIMIT)
        throw new Error("Configuration read limit exceeded");
      return Promise.all(
        snapshot.docs.map(async (document) => {
          const configuration = floorStockConfigurationSchema.parse(
            document.data(),
          );
          if (
            configuration.configurationId !== document.id ||
            configuration.tenantId !== context.tenantId ||
            configuration.organizationId !== context.organizationId ||
            configuration.facilityId !== context.activeFacilityId ||
            configuration.departmentId !== context.activeDepartmentId ||
            configuration.status !== "active"
          )
            throw new Error("Configuration scope mismatch");
          const [itemSnapshot, locationSnapshot] = await Promise.all([
            firestore
              .collection(inventoryCollections.items)
              .doc(configuration.itemId)
              .get(),
            firestore
              .collection(inventoryCollections.locations)
              .doc(configuration.locationId)
              .get(),
          ]);
          if (!itemSnapshot.exists || !locationSnapshot.exists)
            throw new Error("Configuration parent missing");
          const item = medicationItemSchema.parse(itemSnapshot.data());
          const location = inventoryLocationSchema.parse(
            locationSnapshot.data(),
          );
          if (
            item.itemId !== configuration.itemId ||
            item.tenantId !== context.tenantId ||
            item.status !== "active" ||
            location.locationId !== configuration.locationId ||
            location.tenantId !== context.tenantId ||
            location.facilityId !== context.activeFacilityId ||
            location.departmentId !== context.activeDepartmentId ||
            location.status !== "active"
          )
            throw new Error("Configuration parent scope mismatch");
          return {
            configurationId: configuration.configurationId,
            itemId: item.itemId,
            itemCode: item.itemCode,
            genericName: item.genericName,
            strength: item.strength,
            locationId: location.locationId,
            locationName: location.displayName,
            unit: configuration.unit,
            maximumQuantity: configuration.maximumQuantity,
          };
        }),
      );
    },
  };
}

let repository:
  ReturnType<typeof createFloorStockRequestRepository> | undefined;
export function getFloorStockRequestRepository() {
  repository ??= createFloorStockRequestRepository(
    getFirestore(getFirebaseAdminApp()),
  );
  return repository;
}
