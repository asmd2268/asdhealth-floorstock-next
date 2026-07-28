"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { roleIds, type RoleId } from "@/domain/access/types";
import type { AssignmentScopeRecord } from "@/domain/auth/types";
import {
  sendAdministrationMutation,
  type MutationState,
} from "./mutation-client";

interface RoleLabels {
  role: string;
  scope: string;
  assign: string;
  revoke: string;
  saving: string;
  success: string;
  error: string;
  roleNames: Record<RoleId, string>;
}

export function AssignRoleForm({
  uid,
  scopes,
  labels,
}: {
  uid: string;
  scopes: readonly {
    id: string;
    label: string;
    scope: AssignmentScopeRecord;
  }[];
  labels: RoleLabels;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<MutationState>("idle");
  const [roleId, setRoleId] = useState<RoleId>(roleIds[0]);
  const [scopeId, setScopeId] = useState(scopes[0]?.id ?? "");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const scope = scopes.find((item) => item.id === scopeId)?.scope;
    if (!scope || inFlight.current) return;
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        `/api/admin/users/${encodeURIComponent(uid)}/roles`,
        "POST",
        { roleId, scope },
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
    <form className="admin-form admin-inline-form" onSubmit={submit}>
      <label>
        <span>{labels.role}</span>
        <select
          value={roleId}
          onChange={(event) => setRoleId(event.target.value as RoleId)}
        >
          {roleIds.map((role) => (
            <option key={role} value={role}>
              {labels.roleNames[role]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{labels.scope}</span>
        <select
          value={scopeId}
          onChange={(event) => setScopeId(event.target.value)}
        >
          {scopes.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.label}
            </option>
          ))}
        </select>
      </label>
      <button disabled={state === "pending" || !scopeId} type="submit">
        {state === "pending" ? labels.saving : labels.assign}
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

export function RevokeRoleButton({
  uid,
  assignmentId,
  labels,
}: {
  uid: string;
  assignmentId: string;
  labels: Pick<RoleLabels, "revoke" | "saving" | "success" | "error">;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<MutationState>("idle");
  async function revoke() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        `/api/admin/users/${encodeURIComponent(uid)}/roles/${encodeURIComponent(assignmentId)}`,
        "DELETE",
        {},
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
    <span className="admin-action-stack">
      <button type="button" disabled={state === "pending"} onClick={revoke}>
        {state === "pending" ? labels.saving : labels.revoke}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "success"
          ? labels.success
          : state === "error"
            ? labels.error
            : ""}
      </span>
    </span>
  );
}
