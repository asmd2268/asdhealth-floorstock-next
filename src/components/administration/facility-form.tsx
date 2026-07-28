"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendAdministrationMutation,
  type MutationState,
} from "./mutation-client";

export function FacilityForm({
  organizations,
  labels,
}: {
  organizations: readonly { id: string }[];
  labels: {
    facilityId: string;
    organization: string;
    displayName: string;
    submit: string;
    saving: string;
    success: string;
    error: string;
  };
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<MutationState>("idle");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const facilityId = String(form.get("facilityId") ?? "");
    const organizationId = String(form.get("organizationId") ?? "");
    const displayName = String(form.get("displayName") ?? "");
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        `/api/admin/facilities/${encodeURIComponent(facilityId)}`,
        "PUT",
        { organizationId, ...(displayName ? { displayName } : {}) },
      );
      setState(ok ? "success" : "error");
      if (ok) router.refresh();
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <label>
        <span>{labels.facilityId}</span>
        <input required name="facilityId" maxLength={128} autoComplete="off" />
      </label>
      <label>
        <span>{labels.organization}</span>
        <select required name="organizationId">
          {organizations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{labels.displayName}</span>
        <input name="displayName" maxLength={120} autoComplete="off" />
      </label>
      <button disabled={state === "pending"} type="submit">
        {state === "pending" ? labels.saving : labels.submit}
      </button>
      <p aria-live="polite">
        {state === "success"
          ? labels.success
          : state === "error"
            ? labels.error
            : ""}
      </p>
    </form>
  );
}
