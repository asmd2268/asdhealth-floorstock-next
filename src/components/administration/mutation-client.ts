"use client";

export type MutationState = "idle" | "pending" | "success" | "error";

export async function sendAdministrationMutation(
  endpoint: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: unknown,
): Promise<boolean> {
  const text = JSON.stringify(body);
  const response = await fetch(endpoint, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-asdhealth-admin-action": "1",
      "x-request-id": crypto.randomUUID(),
    },
    body: text,
  });
  return response.ok;
}
