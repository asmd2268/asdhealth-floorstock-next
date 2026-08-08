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
  inventoryTransactionLineSchema,
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
import { reconcileInventorySnapshot } from "@/domain/inventory/reconciliation";
import type {
  InventoryDirectoryFilters,
  InventoryTransactionLineRecord,
} from "@/domain/inventory/types";
import type { InventoryReconciliationReport } from "@/domain/inventory/reconciliation";
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

export const INVENTORY_RECONCILIATION_READ_LIMIT = 201;

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
      filters: InventoryDirectoryFilters = {},
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
                ...(filters.locationId
                  ? [["locationId", filters.locationId] as [string, string]]
                  : filters.itemId
                    ? [["itemId", filters.itemId] as [string, string]]
                    : []),
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
                ...(filters.transactionType
                  ? [["type", filters.transactionType] as [string, string]]
                  : []),
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
    async reconcile(
      context: InventoryActorContext,
      filters: InventoryDirectoryFilters = {},
    ): Promise<InventoryReconciliationReport> {
      const base = firestore
        .collection(inventoryCollections.balances)
        .where("tenantId", "==", context.tenantId)
        .where("facilityId", "==", context.activeFacilityId)
        .orderBy(FieldPath.documentId());
      const balanceQuery = filters.locationId
        ? base.where("locationId", "==", filters.locationId)
        : filters.itemId
          ? base.where("itemId", "==", filters.itemId)
          : base;
      const transactionBase = firestore
        .collection(inventoryCollections.transactions)
        .where("tenantId", "==", context.tenantId)
        .where("facilityId", "==", context.activeFacilityId)
        .orderBy(FieldPath.documentId());
      const transactionQuery = filters.transactionType
        ? transactionBase.where("type", "==", filters.transactionType)
        : transactionBase;
      const [balanceSnapshot, transactionSnapshot] = await Promise.all([
        balanceQuery.limit(INVENTORY_RECONCILIATION_READ_LIMIT).get(),
        transactionQuery.limit(INVENTORY_RECONCILIATION_READ_LIMIT).get(),
      ]);
      if (
        balanceSnapshot.size >= INVENTORY_RECONCILIATION_READ_LIMIT ||
        transactionSnapshot.size >= INVENTORY_RECONCILIATION_READ_LIMIT
      )
        throw new Error("Inventory reconciliation read limit exceeded");
      const balances = balanceSnapshot.docs.map((document) => {
        const value = inventoryBalanceSchema.parse(document.data());
        if (
          value.balanceId !== document.id ||
          value.tenantId !== context.tenantId ||
          value.facilityId !== context.activeFacilityId
        )
          throw new Error("Balance scope mismatch");
        return value;
      });
      const transactions = transactionSnapshot.docs.map((document) => {
        const value = inventoryTransactionSchema.parse(document.data());
        if (
          value.transactionId !== document.id ||
          value.tenantId !== context.tenantId ||
          value.facilityId !== context.activeFacilityId
        )
          throw new Error("Transaction scope mismatch");
        return value;
      });
      const lineEntries = await Promise.all(
        transactions.map(async (transaction) => {
          const snapshot = await firestore
            .collection(
              [
                inventoryCollections.transactions,
                transaction.transactionId,
                inventoryCollections.lines,
              ].join("/"),
            )
            .orderBy("lineNumber")
            .limit(transaction.lineCount + 1)
            .get();
          const lines = snapshot.docs.map((document) => {
            const value = inventoryTransactionLineSchema.parse(document.data());
            if (
              value.lineId !== document.id ||
              value.transactionId !== transaction.transactionId
            )
              throw new Error("Transaction line scope mismatch");
            return value;
          });
          return [transaction.transactionId, lines] as const;
        }),
      );
      return reconcileInventorySnapshot(
        balances,
        transactions,
        new Map<string, readonly InventoryTransactionLineRecord[]>(lineEntries),
      );
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
