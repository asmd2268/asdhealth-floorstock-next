"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Dictionary } from "@/i18n/dictionaries";
import {
  inventoryLocationKinds,
  inventoryUnits,
} from "@/domain/inventory/types";
import type { InventoryProvisioningOperation } from "@/domain/inventory/provisioning-types";

type Labels = Dictionary["inventory"]["provisioning"];
type State = "idle" | "saving" | "success" | "error";

const field = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();

const optional = (value: string) => (value.length ? value : undefined);
const nullable = (value: string) => (value.length ? value : null);

function conversions(value: string) {
  if (!value) return [];
  return value.split(",").map((entry) => {
    const [fromUnit, multiplier] = entry.split(":").map((part) => part.trim());
    return {
      fromUnit,
      toBaseUnitMultiplier: Number(multiplier),
    };
  });
}

function body(
  operation: InventoryProvisioningOperation,
  data: FormData,
): Record<string, unknown> {
  if (operation === "upsert_item")
    return {
      itemCode: field(data, "itemCode"),
      genericName: field(data, "genericName"),
      brandName: optional(field(data, "brandName")),
      dosageForm: field(data, "dosageForm"),
      strength: field(data, "strength"),
      baseUnit: field(data, "baseUnit"),
      dispensingUnit: field(data, "dispensingUnit"),
      unitConversions: conversions(field(data, "unitConversions")),
      status: field(data, "status"),
      lotControlled: data.get("lotControlled") === "on",
      expiryControlled: data.get("expiryControlled") === "on",
      negativeStockAllowed: data.get("negativeStockAllowed") === "on",
      barcodeIds: field(data, "barcodeIds")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      externalReference: optional(field(data, "externalReference")),
    };
  if (operation === "upsert_location")
    return {
      departmentId: nullable(field(data, "departmentId")),
      parentLocationId: nullable(field(data, "parentLocationId")),
      kind: field(data, "kind"),
      displayName: field(data, "displayName"),
      status: field(data, "status"),
    };
  if (operation === "upsert_lot")
    return {
      itemId: field(data, "itemId"),
      lotNumber: field(data, "lotNumber"),
      expiryDate: field(data, "expiryDate"),
      status: field(data, "status"),
    };
  return {
    departmentId: field(data, "departmentId"),
    locationId: field(data, "locationId"),
    itemId: field(data, "itemId"),
    unit: field(data, "unit"),
    minimumQuantity: Number(field(data, "minimumQuantity")),
    reorderThreshold: Number(field(data, "reorderThreshold")),
    maximumQuantity: Number(field(data, "maximumQuantity")),
    status: field(data, "status"),
  };
}

function endpoint(operation: InventoryProvisioningOperation, id: string) {
  const encoded = encodeURIComponent(id);
  if (operation === "upsert_item")
    return `/api/inventory/catalog/items/${encoded}`;
  if (operation === "upsert_location")
    return `/api/inventory/locations/${encoded}`;
  if (operation === "upsert_lot") return `/api/inventory/lots/${encoded}`;
  return `/api/inventory/floor-stock-configurations/${encoded}`;
}

function StatusMessage({ state, labels }: { state: State; labels: Labels }) {
  return (
    <p aria-live="polite">
      {state === "success"
        ? labels.success
        : state === "error"
          ? labels.error
          : ""}
    </p>
  );
}

function StatusFields({ labels }: { labels: Labels }) {
  return (
    <label>
      {labels.active}
      <select defaultValue="active" name="status">
        <option value="active">{labels.active}</option>
        <option value="inactive">{labels.inactive}</option>
      </select>
    </label>
  );
}

export function InventoryProvisioningForms({
  operations,
  labels,
}: {
  operations: readonly InventoryProvisioningOperation[];
  labels: Labels;
}) {
  const router = useRouter();
  const [states, setStates] = useState<
    Partial<Record<InventoryProvisioningOperation, State>>
  >({});
  if (operations.length === 0) return null;

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    operation: InventoryProvisioningOperation,
  ) {
    event.preventDefault();
    if (states[operation] === "saving") return;
    const data = new FormData(event.currentTarget);
    const id = field(data, "recordId");
    setStates((current) => ({ ...current, [operation]: "saving" }));
    try {
      const response = await fetch(endpoint(operation, id), {
        method: "PUT",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-asdhealth-inventory-provisioning-action": operation,
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify(body(operation, data)),
      });
      setStates((current) => ({
        ...current,
        [operation]: response.ok ? "success" : "error",
      }));
      if (response.ok) router.refresh();
    } catch {
      setStates((current) => ({ ...current, [operation]: "error" }));
    }
  }

  const button = (operation: InventoryProvisioningOperation) => (
    <>
      <button disabled={states[operation] === "saving"} type="submit">
        {states[operation] === "saving" ? labels.saving : labels.save}
      </button>
      <StatusMessage state={states[operation] ?? "idle"} labels={labels} />
    </>
  );

  return (
    <section className="inventory-provisioning">
      <h2>{labels.title}</h2>
      <p>{labels.description}</p>

      {operations.includes("upsert_item") ? (
        <details>
          <summary>{labels.item}</summary>
          <form
            className="inventory-form"
            onSubmit={(event) => void submit(event, "upsert_item")}
          >
            <label>
              {labels.identifier}
              <input maxLength={128} name="recordId" required />
            </label>
            <label>
              {labels.itemCode}
              <input maxLength={128} name="itemCode" required />
            </label>
            <label>
              {labels.genericName}
              <input maxLength={160} name="genericName" required />
            </label>
            <label>
              {labels.brandName}
              <input maxLength={160} name="brandName" />
            </label>
            <label>
              {labels.dosageForm}
              <input maxLength={80} name="dosageForm" required />
            </label>
            <label>
              {labels.strength}
              <input maxLength={80} name="strength" required />
            </label>
            <label>
              {labels.baseUnit}
              <select name="baseUnit">
                {inventoryUnits.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              {labels.dispensingUnit}
              <select name="dispensingUnit">
                {inventoryUnits.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              {labels.conversions}
              <input maxLength={240} name="unitConversions" />
            </label>
            <label>
              {labels.barcodes}
              <input maxLength={512} name="barcodeIds" />
            </label>
            <label>
              {labels.externalReference}
              <input maxLength={128} name="externalReference" />
            </label>
            <label>
              <input name="lotControlled" type="checkbox" />
              {labels.lotControlled}
            </label>
            <label>
              <input name="expiryControlled" type="checkbox" />
              {labels.expiryControlled}
            </label>
            <label>
              <input name="negativeStockAllowed" type="checkbox" />
              {labels.negativeStockAllowed}
            </label>
            <StatusFields labels={labels} />
            {button("upsert_item")}
          </form>
        </details>
      ) : null}

      {operations.includes("upsert_location") ? (
        <details>
          <summary>{labels.location}</summary>
          <form
            className="inventory-form"
            onSubmit={(event) => void submit(event, "upsert_location")}
          >
            <label>
              {labels.identifier}
              <input maxLength={128} name="recordId" required />
            </label>
            <label>
              {labels.displayName}
              <input maxLength={120} name="displayName" required />
            </label>
            <label>
              {labels.departmentId}
              <input maxLength={128} name="departmentId" />
            </label>
            <label>
              {labels.parentLocationId}
              <input maxLength={128} name="parentLocationId" />
            </label>
            <label>
              {labels.locationKind}
              <select name="kind">
                {inventoryLocationKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <StatusFields labels={labels} />
            {button("upsert_location")}
          </form>
        </details>
      ) : null}

      {operations.includes("upsert_lot") ? (
        <details>
          <summary>{labels.lot}</summary>
          <form
            className="inventory-form"
            onSubmit={(event) => void submit(event, "upsert_lot")}
          >
            <label>
              {labels.identifier}
              <input maxLength={128} name="recordId" required />
            </label>
            <label>
              {labels.itemId}
              <input maxLength={128} name="itemId" required />
            </label>
            <label>
              {labels.lotNumber}
              <input maxLength={128} name="lotNumber" required />
            </label>
            <label>
              {labels.expiryDate}
              <input name="expiryDate" required type="date" />
            </label>
            <StatusFields labels={labels} />
            {button("upsert_lot")}
          </form>
        </details>
      ) : null}

      {operations.includes("upsert_floor_stock_configuration") ? (
        <details>
          <summary>{labels.configuration}</summary>
          <form
            className="inventory-form"
            onSubmit={(event) =>
              void submit(event, "upsert_floor_stock_configuration")
            }
          >
            <label>
              {labels.identifier}
              <input maxLength={128} name="recordId" required />
            </label>
            <label>
              {labels.departmentId}
              <input maxLength={128} name="departmentId" required />
            </label>
            <label>
              {labels.locationId}
              <input maxLength={128} name="locationId" required />
            </label>
            <label>
              {labels.itemId}
              <input maxLength={128} name="itemId" required />
            </label>
            <label>
              {labels.baseUnit}
              <select name="unit">
                {inventoryUnits.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              {labels.minimum}
              <input
                min="0"
                name="minimumQuantity"
                required
                step="1"
                type="number"
              />
            </label>
            <label>
              {labels.reorder}
              <input
                min="0"
                name="reorderThreshold"
                required
                step="1"
                type="number"
              />
            </label>
            <label>
              {labels.maximum}
              <input
                min="1"
                name="maximumQuantity"
                required
                step="1"
                type="number"
              />
            </label>
            <StatusFields labels={labels} />
            {button("upsert_floor_stock_configuration")}
          </form>
        </details>
      ) : null}
    </section>
  );
}
