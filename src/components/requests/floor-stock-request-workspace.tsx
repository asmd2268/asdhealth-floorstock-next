"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  FloorStockRequestConfigurationSummary,
  FloorStockRequestOperation,
  FloorStockRequestSummary,
} from "@/domain/requests/types";
import type { Dictionary } from "@/i18n/dictionaries";

type Labels = Dictionary["requests"];
type VisibleRequest = FloorStockRequestSummary & {
  maySubmit: boolean;
  mayCancel: boolean;
};

function endpoint(operation: FloorStockRequestOperation, requestId: string) {
  if (operation === "create") return "/api/floor-stock-requests";
  const suffix: Record<
    Exclude<FloorStockRequestOperation, "create">,
    string
  > = {
    submit: "submit",
    approve: "approve",
    reject: "reject",
    start_fulfillment: "start-fulfillment",
    complete_fulfillment: "complete-fulfillment",
    deliver: "deliver",
    cancel: "cancel",
  };
  return `/api/floor-stock-requests/${encodeURIComponent(requestId)}/${suffix[operation]}`;
}

async function mutate(
  operation: FloorStockRequestOperation,
  requestId: string,
  body: unknown,
) {
  const response = await fetch(endpoint(operation, requestId), {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-asdhealth-floor-stock-request-action": operation,
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  return response.ok;
}

export function FloorStockRequestWorkspace({
  configurations,
  requests,
  mayCreate,
  mayApprove,
  mayManage,
  labels,
}: {
  configurations: readonly FloorStockRequestConfigurationSummary[];
  requests: readonly VisibleRequest[];
  mayCreate: boolean;
  mayApprove: boolean;
  mayManage: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<"success" | "error" | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const ids = data.getAll("configurationId").map(String);
    const lines = ids.map((configurationId) => ({
      configurationId,
      quantity: Number(data.get(`quantity:${configurationId}`)),
    }));
    if (
      lines.length === 0 ||
      lines.some((line) => !Number.isSafeInteger(line.quantity))
    ) {
      setMessage("error");
      return;
    }
    const note = String(data.get("note") ?? "").trim();
    setPending("create");
    setMessage(null);
    try {
      const ok = await mutate("create", "", {
        ...(note ? { note } : {}),
        lines,
      });
      setMessage(ok ? "success" : "error");
      if (ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage("error");
    } finally {
      setPending(null);
    }
  }

  async function transition(
    operation: Exclude<FloorStockRequestOperation, "create">,
    requestId: string,
  ) {
    if (pending) return;
    setPending(`${requestId}:${operation}`);
    setMessage(null);
    try {
      const ok = await mutate(operation, requestId, {});
      setMessage(ok ? "success" : "error");
      if (ok) router.refresh();
    } catch {
      setMessage("error");
    } finally {
      setPending(null);
    }
  }

  function actionsFor(request: VisibleRequest) {
    const actions: Array<{
      operation: Exclude<FloorStockRequestOperation, "create">;
      label: string;
    }> = [];
    if (request.maySubmit && request.status === "draft")
      actions.push({ operation: "submit", label: labels.submit });
    if (request.mayCancel)
      actions.push({ operation: "cancel", label: labels.cancel });
    if (mayApprove && request.status === "submitted") {
      actions.push({ operation: "approve", label: labels.approve });
      actions.push({ operation: "reject", label: labels.reject });
    }
    if (mayManage && request.status === "approved")
      actions.push({
        operation: "start_fulfillment",
        label: labels.startFulfillment,
      });
    if (mayManage && request.status === "fulfilling")
      actions.push({
        operation: "complete_fulfillment",
        label: labels.completeFulfillment,
      });
    if (mayManage && request.status === "ready")
      actions.push({ operation: "deliver", label: labels.deliver });
    return actions;
  }

  return (
    <>
      {mayCreate && configurations.length > 0 ? (
        <section className="request-create">
          <h2>{labels.createTitle}</h2>
          <p>{labels.createDescription}</p>
          <form onSubmit={(event) => void create(event)}>
            <label className="request-note">
              {labels.note}
              <input maxLength={500} name="note" />
            </label>
            <div className="request-configurations">
              {configurations.map((configuration) => (
                <div key={configuration.configurationId}>
                  <label>
                    <input
                      name="configurationId"
                      type="checkbox"
                      value={configuration.configurationId}
                    />
                    <span>
                      {configuration.itemCode} — {configuration.genericName}{" "}
                      {configuration.strength} · {configuration.locationName}
                    </span>
                  </label>
                  <label>
                    {labels.quantity}
                    <input
                      max={configuration.maximumQuantity}
                      min="1"
                      name={`quantity:${configuration.configurationId}`}
                      step="1"
                      type="number"
                      defaultValue="1"
                    />
                    <span>{configuration.unit}</span>
                  </label>
                </div>
              ))}
            </div>
            <button disabled={pending !== null} type="submit">
              {pending === "create" ? labels.creating : labels.create}
            </button>
          </form>
        </section>
      ) : null}

      <section>
        <h2>{labels.title}</h2>
        {requests.length ? (
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{labels.requestId}</th>
                  <th>{labels.department}</th>
                  <th>{labels.requester}</th>
                  <th>{labels.lines}</th>
                  <th>{labels.status}</th>
                  <th>{labels.updated}</th>
                  <th>{labels.actions}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.floorStockRequestId}>
                    <td>{request.floorStockRequestId}</td>
                    <td>{request.departmentId}</td>
                    <td>{request.requestedByUid}</td>
                    <td>{request.lineCount}</td>
                    <td>
                      <span
                        className={`request-status request-status-${request.status}`}
                      >
                        {labels.statuses[request.status]}
                      </span>
                    </td>
                    <td>
                      <time dateTime={request.updatedAt}>
                        {request.updatedAt}
                      </time>
                    </td>
                    <td>
                      <div className="request-actions">
                        {actionsFor(request).map((action) => (
                          <button
                            disabled={pending !== null}
                            key={action.operation}
                            onClick={() =>
                              void transition(
                                action.operation,
                                request.floorStockRequestId,
                              )
                            }
                            type="button"
                          >
                            {pending ===
                            `${request.floorStockRequestId}:${action.operation}`
                              ? labels.working
                              : action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{labels.empty}</p>
        )}
        <p aria-live="polite">
          {message === "success"
            ? labels.success
            : message === "error"
              ? labels.error
              : ""}
        </p>
      </section>
    </>
  );
}
