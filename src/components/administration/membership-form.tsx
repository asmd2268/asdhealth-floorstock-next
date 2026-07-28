"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendAdministrationMutation,
  type MutationState,
} from "./mutation-client";

interface MembershipLabels {
  organization: string;
  facilities: string;
  activeFacility: string;
  save: string;
  saving: string;
  success: string;
  error: string;
}

export function MembershipForm({
  uid,
  organizationId,
  facilityIds,
  activeFacilityId,
  organizations,
  facilities,
  labels,
}: {
  uid: string;
  organizationId: string | null;
  facilityIds: readonly string[];
  activeFacilityId: string | null;
  organizations: readonly { id: string }[];
  facilities: readonly {
    id: string;
    organizationId: string;
    displayName?: string;
  }[];
  labels: MembershipLabels;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<MutationState>("idle");
  const [organization, setOrganization] = useState(
    organizationId ?? organizations[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<string[]>([...facilityIds]);
  const [selectedActive, setSelectedActive] = useState(activeFacilityId ?? "");
  const visibleFacilities = facilities.filter(
    (item) => item.organizationId === organization,
  );
  const active = selected.includes(selectedActive)
    ? selectedActive
    : (selected[0] ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !organization || selected.length === 0 || !active)
      return;
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        `/api/admin/users/${encodeURIComponent(uid)}/membership`,
        "PATCH",
        {
          organizationId: organization,
          facilityIds: selected,
          activeFacilityId: active,
        },
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
    <form onSubmit={submit} className="admin-form">
      <label>
        <span>{labels.organization}</span>
        <select
          value={organization}
          onChange={(event) => {
            setOrganization(event.target.value);
            setSelected([]);
            setSelectedActive("");
          }}
        >
          {organizations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{labels.facilities}</legend>
        {visibleFacilities.map((item) => (
          <label className="check-row" key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id),
                )
              }
            />
            <span>{item.displayName ?? item.id}</span>
          </label>
        ))}
      </fieldset>
      <label>
        <span>{labels.activeFacility}</span>
        <select
          value={active}
          onChange={(event) => setSelectedActive(event.target.value)}
        >
          {selected.map((id) => (
            <option key={id} value={id}>
              {facilities.find((item) => item.id === id)?.displayName ?? id}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={state === "pending" || selected.length === 0}
        type="submit"
      >
        {state === "pending" ? labels.saving : labels.save}
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
