import "server-only";

import {
  FieldPath,
  getFirestore,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import {
  inventoryBalanceSchema,
  inventoryLocationSchema,
  inventoryTransactionSchema,
  medicationItemSchema,
  INVENTORY_PAGE_SIZE,
} from "@/domain/inventory/schemas";
import type {
  InventoryActorContext,
  InventoryBalanceSummary,
  InventoryItemSummary,
  InventoryLocationSummary,
  InventoryPage,
  InventoryTransactionSummary,
} from "@/domain/inventory/types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";
import { requireCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

import { inventoryCollections } from "./paths";

export interface InventoryDirectorySnapshot {
  items: InventoryPage<InventoryItemSummary>;
  locations: InventoryPage<InventoryLocationSummary>;
  balances: InventoryPage<InventoryBalanceSummary>;
  transactions: InventoryPage<InventoryTransactionSummary>;
}

export interface InventoryDirectoryCursors {
  items?: string;
  locations?: string;
  balances?: string;
  transactions?: string;
}

async function page(query: Query): Promise<{
  rows: readonly { id: string; data: unknown }[];
  nextCursor: string | null;
}> {
  const snapshot = await query.limit(INVENTORY_PAGE_SIZE + 1).get();
  const visible = snapshot.docs.slice(0, INVENTORY_PAGE_SIZE);
  return {
    rows: visible.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
    nextCursor:
      snapshot.size > INVENTORY_PAGE_SIZE ? (visible.at(-1)?.id ?? null) : null,
  };
}

export function createInventoryQueryRepository(firestore: Firestore) {
  return {
    async load(
      context: InventoryActorContext,
      rawCursors: InventoryDirectoryCursors = {},
    ): Promise<InventoryDirectorySnapshot> {
      const ordered = (
        collection: string,
        filters: readonly [string, string][],
        rawCursor?: string,
      ) => {
        const cursor = rawCursor
          ? requireCanonicalTrustedIdentifier(rawCursor)
          : null;
        let query: Query = firestore.collection(collection);
        for (const [field, value] of filters)
          query = query.where(field, "==", value);
        query = query.orderBy(FieldPath.documentId());
        return cursor ? query.startAfter(cursor) : query;
      };
      const [itemPage, locationPage, balancePage, transactionPage] =
        await Promise.all([
          page(
            ordered(
              inventoryCollections.items,
              [["tenantId", context.tenantId]],
              rawCursors.items,
            ),
          ),
          page(
            ordered(
              inventoryCollections.locations,
              [
                ["tenantId", context.tenantId],
                ["facilityId", context.activeFacilityId],
              ],
              rawCursors.locations,
            ),
          ),
          page(
            ordered(
              inventoryCollections.balances,
              [
                ["tenantId", context.tenantId],
                ["facilityId", context.activeFacilityId],
              ],
              rawCursors.balances,
            ),
          ),
          page(
            ordered(
              inventoryCollections.transactions,
              [
                ["tenantId", context.tenantId],
                ["facilityId", context.activeFacilityId],
              ],
              rawCursors.transactions,
            ),
          ),
        ]);
      const parse = <T>(
        rows: readonly { id: string; data: unknown }[],
        parser: { parse(value: unknown): T },
        idOf: (value: T) => string,
      ) =>
        rows.map(({ id, data }) => {
          const value = parser.parse(data);
          if (idOf(value) !== id)
            throw new Error("Inventory document identity mismatch");
          return value;
        });
      const items = parse(
        itemPage.rows,
        medicationItemSchema,
        (item) => item.itemId,
      );
      const locations = parse(
        locationPage.rows,
        inventoryLocationSchema,
        (location) => location.locationId,
      );
      const balances = parse(
        balancePage.rows,
        inventoryBalanceSchema,
        (balance) => balance.balanceId,
      );
      const transactions = parse(
        transactionPage.rows,
        inventoryTransactionSchema,
        (transaction) => transaction.transactionId,
      );
      if (
        items.some((item) => item.tenantId !== context.tenantId) ||
        locations.some(
          (location) =>
            location.tenantId !== context.tenantId ||
            location.facilityId !== context.activeFacilityId,
        ) ||
        balances.some(
          (balance) =>
            balance.tenantId !== context.tenantId ||
            balance.facilityId !== context.activeFacilityId,
        ) ||
        transactions.some(
          (transaction) =>
            transaction.tenantId !== context.tenantId ||
            transaction.facilityId !== context.activeFacilityId,
        )
      )
        throw new Error("Inventory query scope mismatch");
      return {
        items: {
          items: items.map(
            ({
              itemId,
              itemCode,
              genericName,
              strength,
              baseUnit,
              lotControlled,
              expiryControlled,
            }) => ({
              itemId,
              itemCode,
              genericName,
              strength,
              baseUnit,
              lotControlled,
              expiryControlled,
            }),
          ),
          nextCursor: itemPage.nextCursor,
        },
        locations: {
          items: locations.map(
            ({ locationId, displayName, kind, departmentId }) => ({
              locationId,
              displayName,
              kind,
              departmentId,
            }),
          ),
          nextCursor: locationPage.nextCursor,
        },
        balances: {
          items: balances.map(
            ({
              balanceId,
              locationId,
              itemId,
              lotId,
              expiryDate,
              unit,
              quantity,
            }) => ({
              balanceId,
              locationId,
              itemId,
              lotId,
              expiryDate,
              unit,
              quantity,
            }),
          ),
          nextCursor: balancePage.nextCursor,
        },
        transactions: {
          items: transactions.map(
            ({
              transactionId,
              type,
              actorUid,
              sourceLocationId,
              destinationLocationId,
              lineCount,
              postedAt,
            }) => ({
              transactionId,
              type,
              actorUid,
              sourceLocationId,
              destinationLocationId,
              lineCount,
              postedAt,
            }),
          ),
          nextCursor: transactionPage.nextCursor,
        },
      };
    },
  };
}

let repository: ReturnType<typeof createInventoryQueryRepository> | undefined;
export function getInventoryQueryRepository() {
  repository ??= createInventoryQueryRepository(
    getFirestore(getFirebaseAdminApp()),
  );
  return repository;
}
