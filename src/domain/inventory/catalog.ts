import { medicationItemSchema } from "./schemas";
import type { InventoryResult, MedicationItemRecord } from "./types";

const immutableAfterActivity = [
  "itemId",
  "tenantId",
  "itemCode",
  "baseUnit",
  "lotControlled",
  "expiryControlled",
] as const satisfies readonly (keyof MedicationItemRecord)[];

export function validateMedicationCatalogMutation(input: {
  candidate: unknown;
  existing: MedicationItemRecord | null;
  tenantItems: readonly MedicationItemRecord[];
  hasInventoryActivity: boolean;
}): InventoryResult<MedicationItemRecord> {
  const parsed = medicationItemSchema.safeParse(input.candidate);
  if (!parsed.success) return { ok: false, code: "invalid_request" };
  const candidate = parsed.data;
  if (
    input.tenantItems.some(
      (item) =>
        item.tenantId === candidate.tenantId &&
        item.itemId !== candidate.itemId &&
        item.itemCode === candidate.itemCode,
    )
  )
    return { ok: false, code: "conflict" };
  if (
    input.existing &&
    (input.existing.itemId !== candidate.itemId ||
      input.existing.tenantId !== candidate.tenantId)
  )
    return { ok: false, code: "conflict" };
  if (
    input.existing &&
    input.hasInventoryActivity &&
    immutableAfterActivity.some(
      (field) =>
        JSON.stringify(input.existing?.[field]) !==
        JSON.stringify(candidate[field]),
    )
  )
    return { ok: false, code: "conflict" };
  return { ok: true, value: candidate };
}
