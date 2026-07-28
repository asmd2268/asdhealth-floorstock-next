import "server-only";

import { requireCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

const id = requireCanonicalTrustedIdentifier;

export const inventoryCollections = {
  items: "inventoryItems",
  locations: "inventoryLocations",
  lots: "inventoryLots",
  configurations: "floorStockConfigurations",
  balances: "inventoryBalances",
  transactions: "inventoryTransactions",
  lines: "lines",
  requests: "inventoryRequestKeys",
  audit: "inventoryAuditEvents",
} as const;

export const inventoryPaths = {
  item: (itemId: string) => [inventoryCollections.items, id(itemId)] as const,
  location: (locationId: string) =>
    [inventoryCollections.locations, id(locationId)] as const,
  lot: (lotId: string) => [inventoryCollections.lots, id(lotId)] as const,
  configuration: (configurationId: string) =>
    [inventoryCollections.configurations, id(configurationId)] as const,
  balance: (balanceId: string) =>
    [inventoryCollections.balances, id(balanceId)] as const,
  transaction: (transactionId: string) =>
    [inventoryCollections.transactions, id(transactionId)] as const,
  line: (transactionId: string, lineId: string) =>
    [
      inventoryCollections.transactions,
      id(transactionId),
      inventoryCollections.lines,
      id(lineId),
    ] as const,
  request: (namespaceId: string) =>
    [inventoryCollections.requests, id(namespaceId)] as const,
  audit: (eventId: string) =>
    [inventoryCollections.audit, id(eventId)] as const,
};
