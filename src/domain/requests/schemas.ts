import { z } from "zod";

import {
  INVENTORY_MAX_LINES,
  inventoryQuantitySchema,
  inventoryTimestampSchema,
  inventoryUnitSchema,
} from "@/domain/inventory/schemas";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  floorStockRequestOperations,
  floorStockRequestStatuses,
} from "./types";

export const FLOOR_STOCK_REQUEST_PAGE_SIZE = 25;
export const FLOOR_STOCK_REQUEST_READ_LIMIT = 101;

const noteSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) => value === value.trim() && !/\p{C}/u.test(value),
    "Expected a trimmed note without control characters.",
  );

export const createFloorStockRequestSchema = z
  .object({
    note: noteSchema.optional(),
    lines: z
      .array(
        z
          .object({
            configurationId: provisioningIdentifierSchema,
            quantity: inventoryQuantitySchema,
          })
          .strict(),
      )
      .min(1)
      .max(INVENTORY_MAX_LINES),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.lines.map((line) => line.configurationId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Configuration lines must be unique.",
      });
  });

export const emptyFloorStockRequestBodySchema = z.object({}).strict();

export const floorStockRequestRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    floorStockRequestId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    platformId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    departmentId: provisioningIdentifierSchema,
    status: z.enum(floorStockRequestStatuses),
    requestedByUid: provisioningIdentifierSchema,
    lastActorUid: provisioningIdentifierSchema,
    lineCount: z.number().int().positive().max(INVENTORY_MAX_LINES),
    note: noteSchema.nullable(),
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: inventoryTimestampSchema,
    updatedAt: inventoryTimestampSchema,
    submittedAt: inventoryTimestampSchema.nullable(),
    approvedAt: inventoryTimestampSchema.nullable(),
    rejectedAt: inventoryTimestampSchema.nullable(),
    fulfillmentStartedAt: inventoryTimestampSchema.nullable(),
    readyAt: inventoryTimestampSchema.nullable(),
    deliveredAt: inventoryTimestampSchema.nullable(),
    cancelledAt: inventoryTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    const requiredByStatus: Record<
      (typeof floorStockRequestStatuses)[number],
      readonly (keyof typeof request)[]
    > = {
      draft: [],
      submitted: ["submittedAt"],
      approved: ["submittedAt", "approvedAt"],
      rejected: ["submittedAt", "rejectedAt"],
      fulfilling: ["submittedAt", "approvedAt", "fulfillmentStartedAt"],
      ready: ["submittedAt", "approvedAt", "fulfillmentStartedAt", "readyAt"],
      delivered: [
        "submittedAt",
        "approvedAt",
        "fulfillmentStartedAt",
        "readyAt",
        "deliveredAt",
      ],
      cancelled: ["cancelledAt"],
    };
    const lifecycleFields = [
      "submittedAt",
      "approvedAt",
      "rejectedAt",
      "fulfillmentStartedAt",
      "readyAt",
      "deliveredAt",
      "cancelledAt",
    ] as const;
    const required = new Set(requiredByStatus[request.status]);
    for (const field of lifecycleFields) {
      const mayRetainSubmittedCancellation =
        request.status === "cancelled" && field === "submittedAt";
      if (required.has(field) && request[field] === null)
        context.addIssue({
          code: "custom",
          path: [field],
          message: `Expected ${field} for ${request.status}.`,
        });
      if (
        !required.has(field) &&
        !mayRetainSubmittedCancellation &&
        request[field] !== null
      )
        context.addIssue({
          code: "custom",
          path: [field],
          message: `Unexpected ${field} for ${request.status}.`,
        });
    }
  });

export const floorStockRequestLineRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    lineId: provisioningIdentifierSchema,
    floorStockRequestId: provisioningIdentifierSchema,
    lineNumber: z.number().int().positive().max(INVENTORY_MAX_LINES),
    configurationId: provisioningIdentifierSchema,
    itemId: provisioningIdentifierSchema,
    locationId: provisioningIdentifierSchema,
    unit: inventoryUnitSchema,
    requestedQuantity: inventoryQuantitySchema,
    approvedQuantity: z.number().int().positive().max(1_000_000_000).nullable(),
    fulfilledQuantity: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000_000)
      .nullable(),
  })
  .strict();

export const floorStockRequestOperationSchema = z.enum(
  floorStockRequestOperations,
);

export const floorStockRequestAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: provisioningIdentifierSchema,
    actorUid: provisioningIdentifierSchema,
    action: floorStockRequestOperationSchema,
    targetType: z.literal("floor_stock_request"),
    targetId: provisioningIdentifierSchema,
    requestId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    departmentId: provisioningIdentifierSchema,
    timestamp: inventoryTimestampSchema,
    metadata: z
      .record(
        z.string().max(64),
        z.union([
          z.string().max(128),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .refine((value) => Object.keys(value).length <= 20),
  })
  .strict();
