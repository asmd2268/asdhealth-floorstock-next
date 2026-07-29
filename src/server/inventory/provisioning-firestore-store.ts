import "server-only";

import {
  getFirestore,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";

import type {
  InventoryProvisioningStore,
  InventoryProvisioningTransaction,
} from "@/domain/inventory/provisioning-store";
import {
  inventoryProvisioningResource,
  type InventoryProvisioningOperation,
} from "@/domain/inventory/provisioning-types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";

import { revalidateInventoryActorPermission } from "./firestore-store";
import { inventoryCollections, inventoryPaths } from "./paths";

const path = (segments: readonly string[]) => segments.join("/");

async function raw(
  transaction: Transaction,
  firestore: Firestore,
  segments: readonly string[],
) {
  const snapshot = await transaction.get(firestore.doc(path(segments)));
  return snapshot.exists ? snapshot.data() : null;
}

async function query(
  transaction: Transaction,
  firestore: Firestore,
  collection: string,
  filters: readonly [string, string][],
  maximum: number,
): Promise<readonly unknown[]> {
  let value: Query = firestore.collection(collection);
  for (const [field, expected] of filters)
    value = value.where(field, "==", expected);
  const snapshot = await transaction.get(value.limit(maximum));
  return snapshot.docs.map((document) => document.data());
}

function revalidate(
  transaction: Transaction,
  firestore: Firestore,
  context: Parameters<InventoryProvisioningTransaction["revalidateActor"]>[0],
  operation: InventoryProvisioningOperation,
) {
  return revalidateInventoryActorPermission(
    transaction,
    firestore,
    context,
    inventoryProvisioningResource[operation],
    "manage",
    operation === "upsert_item" ? "organization" : "facility",
  );
}

function adapter(
  firestore: Firestore,
  transaction: Transaction,
): InventoryProvisioningTransaction {
  return {
    revalidateActor: (context, operation) =>
      revalidate(transaction, firestore, context, operation),
    getItem: (itemId) =>
      raw(transaction, firestore, inventoryPaths.item(itemId)),
    getLocation: (locationId) =>
      raw(transaction, firestore, inventoryPaths.location(locationId)),
    getLot: (lotId) => raw(transaction, firestore, inventoryPaths.lot(lotId)),
    getConfiguration: (configurationId) =>
      raw(
        transaction,
        firestore,
        inventoryPaths.configuration(configurationId),
      ),
    getRequest: (namespaceId) =>
      raw(transaction, firestore, inventoryPaths.request(namespaceId)),
    listItemsByCode: (tenantId, itemCode, maximum) =>
      query(
        transaction,
        firestore,
        inventoryCollections.items,
        [
          ["tenantId", tenantId],
          ["itemCode", itemCode],
        ],
        maximum,
      ),
    listLotsByIdentity: (tenantId, facilityId, itemId, lotNumber, maximum) =>
      query(
        transaction,
        firestore,
        inventoryCollections.lots,
        [
          ["tenantId", tenantId],
          ["facilityId", facilityId],
          ["itemId", itemId],
          ["lotNumber", lotNumber],
        ],
        maximum,
      ),
    listConfigurationsByIdentity: (
      tenantId,
      facilityId,
      departmentId,
      locationId,
      itemId,
      maximum,
    ) =>
      query(
        transaction,
        firestore,
        inventoryCollections.configurations,
        [
          ["tenantId", tenantId],
          ["facilityId", facilityId],
          ["departmentId", departmentId],
          ["locationId", locationId],
          ["itemId", itemId],
        ],
        maximum,
      ),
    hasItemActivity: async (tenantId, itemId) =>
      (
        await query(
          transaction,
          firestore,
          inventoryCollections.balances,
          [
            ["tenantId", tenantId],
            ["itemId", itemId],
          ],
          1,
        )
      ).length > 0,
    hasLocationActivity: async (tenantId, facilityId, locationId) =>
      (
        await query(
          transaction,
          firestore,
          inventoryCollections.balances,
          [
            ["tenantId", tenantId],
            ["facilityId", facilityId],
            ["locationId", locationId],
          ],
          1,
        )
      ).length > 0,
    hasLotActivity: async (tenantId, facilityId, lotId) =>
      (
        await query(
          transaction,
          firestore,
          inventoryCollections.balances,
          [
            ["tenantId", tenantId],
            ["facilityId", facilityId],
            ["lotId", lotId],
          ],
          1,
        )
      ).length > 0,
    setItem: (record) =>
      transaction.set(
        firestore.doc(path(inventoryPaths.item(record.itemId))),
        record,
      ),
    setLocation: (record) =>
      transaction.set(
        firestore.doc(path(inventoryPaths.location(record.locationId))),
        record,
      ),
    setLot: (record) =>
      transaction.set(
        firestore.doc(path(inventoryPaths.lot(record.lotId))),
        record,
      ),
    setConfiguration: (record) =>
      transaction.set(
        firestore.doc(
          path(inventoryPaths.configuration(record.configurationId)),
        ),
        record,
      ),
    createAudit: (record) =>
      transaction.create(
        firestore.doc(path(inventoryPaths.audit(record.eventId))),
        record,
      ),
    createRequest: (record) =>
      transaction.create(
        firestore.doc(path(inventoryPaths.request(record.namespaceId))),
        record,
      ),
  };
}

export function createFirestoreInventoryProvisioningStore(
  firestore: Firestore,
): InventoryProvisioningStore {
  return {
    runTransaction: (operation) =>
      firestore.runTransaction((transaction) =>
        operation(adapter(firestore, transaction)),
      ),
  };
}

let singleton: InventoryProvisioningStore | undefined;

export function getFirestoreInventoryProvisioningStore() {
  singleton ??= createFirestoreInventoryProvisioningStore(
    getFirestore(getFirebaseAdminApp()),
  );
  return singleton;
}
