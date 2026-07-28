import Link from "next/link";
import { loadAdministrationPageContext } from "@/server/administration/page-context";
import { getAdministrationQueryService } from "@/server/administration/composition";

export default async function AdministrationUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { result: context, dictionary } = await loadAdministrationPageContext();
  if (!context.ok) return null;
  const { cursor } = await searchParams;
  const result = await getAdministrationQueryService().users(
    context.value,
    cursor,
  );
  const labels = dictionary.administration;
  if (!result.ok)
    return (
      <main>
        <h2>{labels.users}</h2>
        <p role="alert">
          {result.code === "forbidden"
            ? labels.accessDenied
            : labels.unavailable}
        </p>
      </main>
    );
  const status = (value: string) =>
    labels[value as "active" | "disabled" | "pending" | "suspended"];
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.users}</h2>
        <p>{labels.usersDescription}</p>
      </div>
      {result.value.items.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{labels.uid}</th>
                <th>{labels.accountStatus}</th>
                <th>{labels.organization}</th>
                <th>{labels.activeFacility}</th>
                <th>
                  <span className="sr-only">{labels.details}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.value.items.map((user) => (
                <tr key={user.uid}>
                  <td>
                    <code>{user.uid}</code>
                  </td>
                  <td>{status(user.accountStatus)}</td>
                  <td>{user.organizationId ?? "—"}</td>
                  <td>{user.activeFacilityId ?? "—"}</td>
                  <td>
                    <Link
                      href={`/app/admin/users/${encodeURIComponent(user.uid)}`}
                    >
                      {labels.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.value.nextCursor && (
        <Link
          className="admin-next"
          href={`/app/admin/users?cursor=${encodeURIComponent(result.value.nextCursor)}`}
        >
          {labels.next}
        </Link>
      )}
    </main>
  );
}
