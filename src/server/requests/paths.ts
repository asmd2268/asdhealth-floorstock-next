import "server-only";

import { requireCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

const id = requireCanonicalTrustedIdentifier;

export const floorStockRequestCollections = {
  requests: "floorStockRequests",
  lines: "lines",
  idempotency: "floorStockRequestKeys",
  audit: "floorStockRequestAuditEvents",
} as const;

export const floorStockRequestPaths = {
  request: (requestId: string) =>
    [floorStockRequestCollections.requests, id(requestId)] as const,
  line: (requestId: string, lineId: string) =>
    [
      floorStockRequestCollections.requests,
      id(requestId),
      floorStockRequestCollections.lines,
      id(lineId),
    ] as const,
  lines: (requestId: string) =>
    [
      floorStockRequestCollections.requests,
      id(requestId),
      floorStockRequestCollections.lines,
    ] as const,
  idempotency: (namespaceId: string) =>
    [floorStockRequestCollections.idempotency, id(namespaceId)] as const,
  audit: (eventId: string) =>
    [floorStockRequestCollections.audit, id(eventId)] as const,
};
