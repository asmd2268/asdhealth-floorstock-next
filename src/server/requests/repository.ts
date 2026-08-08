import "server-only";

import {
  FieldPath,
  getFirestore,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import {
  floorStockConfigurationSchema,
  inventoryBalanceSchema,
  inventoryLocationSchema,
  inventoryLotSchema,
  isExpiredDateOnly,
  medicationItemSchema,
} from "@/domain/inventory/schemas";
import { inventoryConversionMultiplier } from "@/domain/inventory/balances";
import {
  FLOOR_STOCK_REQUEST_PAGE_SIZE,
  FLOOR_STOCK_REQUEST_READ_LIMIT,
  floorStockRequestRecordSchema,
  floorStockRequestLineRecordSchema,
} from "@/domain/requests/schemas";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestConfigurationSummary,
  FloorStockRequestPage,
  FloorStockRequestFulfillmentDetail,
} from "@/domain/requests/types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";
import { inventoryCollections } from "@/server/inventory/paths";
import { requireCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

import { floorStockRequestCollections, floorStockRequestPaths } from "./paths";

const path = (segments: readonly string[]) => segments.join("/");

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

    async fulfillment(
      context: FloorStockRequestActorContext,
      rawRequestId: string,
    ): Promise<FloorStockRequestFulfillmentDetail> {
      const requestId = requireCanonicalTrustedIdentifier(rawRequestId);
      const requestSnapshot = await firestore
        .collection(floorStockRequestCollections.requests)
        .doc(requestId)
        .get();
      if (!requestSnapshot.exists) throw new Error("Request not found");
      const request = floorStockRequestRecordSchema.parse(
        requestSnapshot.data(),
      );
      if (
        request.floorStockRequestId !== requestId ||
        request.tenantId !== context.tenantId ||
        request.organizationId !== context.organizationId ||
        request.facilityId !== context.activeFacilityId ||
        request.status !== "fulfilling"
      )
        throw new Error("Request unavailable");
      const [lineSnapshot, balanceSnapshot, locationSnapshot] =
        await Promise.all([
          firestore
            .collection(path(floorStockRequestPaths.lines(requestId)))
            .orderBy("lineNumber")
            .limit(request.lineCount + 1)
            .get(),
          firestore
            .collection(inventoryCollections.balances)
            .where("tenantId", "==", context.tenantId)
            .where("facilityId", "==", context.activeFacilityId)
            .orderBy(FieldPath.documentId())
            .limit(201)
            .get(),
          firestore
            .collection(inventoryCollections.locations)
            .where("tenantId", "==", context.tenantId)
            .where("facilityId", "==", context.activeFacilityId)
            .orderBy(FieldPath.documentId())
            .limit(FLOOR_STOCK_REQUEST_READ_LIMIT)
            .get(),
        ]);
      if (
        lineSnapshot.size !== request.lineCount ||
        balanceSnapshot.size >= 201 ||
        locationSnapshot.size >= FLOOR_STOCK_REQUEST_READ_LIMIT
      )
        throw new Error("Fulfillment read limit exceeded");
      const locations = new Map(
        locationSnapshot.docs.map((document) => {
          const location = inventoryLocationSchema.parse(document.data());
          if (
            location.locationId !== document.id ||
            location.tenantId !== context.tenantId ||
            location.facilityId !== context.activeFacilityId
          )
            throw new Error("Location scope mismatch");
          return [location.locationId, location] as const;
        }),
      );
      const balances = balanceSnapshot.docs.map((document) => {
        const balance = inventoryBalanceSchema.parse(document.data());
        if (
          balance.balanceId !== document.id ||
          balance.tenantId !== context.tenantId ||
          balance.facilityId !== context.activeFacilityId
        )
          throw new Error("Balance scope mismatch");
        return balance;
      });
      const lines = await Promise.all(
        lineSnapshot.docs.map(async (document, index) => {
          const line = floorStockRequestLineRecordSchema.parse(document.data());
          if (
            line.lineId !== document.id ||
            line.floorStockRequestId !== requestId ||
            line.lineNumber !== index + 1 ||
            line.approvedQuantity === null ||
            line.fulfilledQuantity !== null
          )
            throw new Error("Request line mismatch");
          const [itemSnapshot, destinationSnapshot] = await Promise.all([
            firestore
              .collection(inventoryCollections.items)
              .doc(line.itemId)
              .get(),
            firestore
              .collection(inventoryCollections.locations)
              .doc(line.locationId)
              .get(),
          ]);
          if (!itemSnapshot.exists || !destinationSnapshot.exists)
            throw new Error("Fulfillment parent missing");
          const item = medicationItemSchema.parse(itemSnapshot.data());
          const destination = inventoryLocationSchema.parse(
            destinationSnapshot.data(),
          );
          const multiplier = inventoryConversionMultiplier(item, line.unit);
          if (
            item.itemId !== line.itemId ||
            item.tenantId !== context.tenantId ||
            item.status !== "active" ||
            destination.locationId !== line.locationId ||
            destination.departmentId !== request.departmentId ||
            destination.status !== "active" ||
            multiplier === null
          )
            throw new Error("Fulfillment parent mismatch");
          const options = await Promise.all(
            balances
              .filter((balance) => {
                const source = locations.get(balance.locationId);
                return (
                  balance.itemId === item.itemId &&
                  balance.departmentId === null &&
                  balance.unit === item.baseUnit &&
                  balance.quantity >= multiplier &&
                  source?.status === "active" &&
                  (source.kind === "pharmacy" ||
                    source.kind === "central_store")
                );
              })
              .map(async (balance) => {
                let lotNumber: string | null = null;
                if (balance.lotId) {
                  const lotSnapshot = await firestore
                    .collection(inventoryCollections.lots)
                    .doc(balance.lotId)
                    .get();
                  if (!lotSnapshot.exists) throw new Error("Lot missing");
                  const lot = inventoryLotSchema.parse(lotSnapshot.data());
                  if (
                    lot.status !== "active" ||
                    lot.tenantId !== context.tenantId ||
                    lot.facilityId !== context.activeFacilityId ||
                    lot.itemId !== item.itemId ||
                    lot.expiryDate !== balance.expiryDate ||
                    (item.expiryControlled &&
                      isExpiredDateOnly(lot.expiryDate, new Date()))
                  )
                    return null;
                  lotNumber = lot.lotNumber;
                } else if (item.lotControlled || item.expiryControlled) {
                  return null;
                }
                return {
                  balanceId: balance.balanceId,
                  sourceLocationId: balance.locationId,
                  sourceLocationName: locations.get(balance.locationId)!
                    .displayName,
                  lotNumber,
                  expiryDate: balance.expiryDate,
                  availableQuantity: Math.floor(balance.quantity / multiplier),
                };
              }),
          );
          return {
            requestLineId: line.lineId,
            itemCode: item.itemCode,
            genericName: item.genericName,
            strength: item.strength,
            destinationLocationName: destination.displayName,
            unit: line.unit,
            approvedQuantity: line.approvedQuantity,
            options: options.filter((option) => option !== null),
          };
        }),
      );
      return {
        floorStockRequestId: request.floorStockRequestId,
        lines,
      };
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
