import "server-only";

import {
  getFirestore,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";

import type {
  FloorStockRequestStore,
  FloorStockRequestTransaction,
} from "@/domain/requests/store";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";
import { inventoryPaths } from "@/server/inventory/paths";
import { revalidateInventoryActorPermission } from "@/server/inventory/firestore-store";

import { requestActionByOperation } from "./context";
import { floorStockRequestPaths } from "./paths";

const path = (segments: readonly string[]) => segments.join("/");

async function raw(
  transaction: Transaction,
  firestore: Firestore,
  segments: readonly string[],
) {
  const snapshot = await transaction.get(firestore.doc(path(segments)));
  return snapshot.exists ? snapshot.data() : null;
}

function adapter(
  firestore: Firestore,
  transaction: Transaction,
): FloorStockRequestTransaction {
  return {
    revalidateActor: (context, operation) =>
      revalidateInventoryActorPermission(
        transaction,
        firestore,
        context,
        "new_request",
        requestActionByOperation[operation],
      ),
    getRequest: (requestId) =>
      raw(transaction, firestore, floorStockRequestPaths.request(requestId)),
    getConfiguration: (configurationId) =>
      raw(
        transaction,
        firestore,
        inventoryPaths.configuration(configurationId),
      ),
    getItem: (itemId) =>
      raw(transaction, firestore, inventoryPaths.item(itemId)),
    getLocation: (locationId) =>
      raw(transaction, firestore, inventoryPaths.location(locationId)),
    getIdempotency: (namespaceId) =>
      raw(
        transaction,
        firestore,
        floorStockRequestPaths.idempotency(namespaceId),
      ),
    listLines: async (requestId, maximum) => {
      const snapshot = await transaction.get(
        firestore
          .collection(path(floorStockRequestPaths.lines(requestId)))
          .orderBy("lineNumber")
          .limit(maximum),
      );
      return snapshot.docs.map((document) => document.data());
    },
    createRequest: (record) =>
      transaction.create(
        firestore.doc(
          path(floorStockRequestPaths.request(record.floorStockRequestId)),
        ),
        record,
      ),
    setRequest: (record) =>
      transaction.set(
        firestore.doc(
          path(floorStockRequestPaths.request(record.floorStockRequestId)),
        ),
        record,
      ),
    createLine: (record) =>
      transaction.create(
        firestore.doc(
          path(
            floorStockRequestPaths.line(
              record.floorStockRequestId,
              record.lineId,
            ),
          ),
        ),
        record,
      ),
    setLine: (record) =>
      transaction.set(
        firestore.doc(
          path(
            floorStockRequestPaths.line(
              record.floorStockRequestId,
              record.lineId,
            ),
          ),
        ),
        record,
      ),
    createAudit: (record) =>
      transaction.create(
        firestore.doc(path(floorStockRequestPaths.audit(record.eventId))),
        record,
      ),
    createIdempotency: (record) =>
      transaction.create(
        firestore.doc(
          path(floorStockRequestPaths.idempotency(record.namespaceId)),
        ),
        record,
      ),
  };
}

export function createFirestoreFloorStockRequestStore(
  firestore: Firestore,
): FloorStockRequestStore {
  return {
    runTransaction: (operation) =>
      firestore.runTransaction((transaction) =>
        operation(adapter(firestore, transaction)),
      ),
  };
}

let singleton: FloorStockRequestStore | undefined;
export function getFirestoreFloorStockRequestStore() {
  singleton ??= createFirestoreFloorStockRequestStore(
    getFirestore(getFirebaseAdminApp()),
  );
  return singleton;
}
