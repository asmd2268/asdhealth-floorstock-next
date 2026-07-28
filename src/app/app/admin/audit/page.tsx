import Link from "next/link";
import { loadAdministrationPageContext } from "@/server/administration/page-context";
import { getAdministrationQueryService } from "@/server/administration/composition";

export default async function AdministrationAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const {
    result: context,
    dictionary,
    locale,
  } = await loadAdministrationPageContext();
  if (!context.ok) return null;
  const { cursor } = await searchParams;
  const result = await getAdministrationQueryService().audit(
    context.value,
    cursor,
  );
  const labels = dictionary.administration;
  if (!result.ok)
    return (
      <main>
        <h2>{labels.audit}</h2>
        <p role="alert">
          {result.code === "forbidden"
            ? labels.accessDenied
            : labels.unavailable}
        </p>
      </main>
    );
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.audit}</h2>
        <p>{labels.auditDescription}</p>
      </div>
      {result.value.items.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{labels.event}</th>
                <th>{labels.actor}</th>
                <th>{labels.target}</th>
                <th>{labels.timestamp}</th>
              </tr>
            </thead>
            <tbody>
              {result.value.items.map((event) => (
                <tr key={event.eventId}>
                  <td>{labels.actions[event.action]}</td>
                  <td>
                    <code>{event.actorUid}</code>
                  </td>
                  <td>
                    {labels.targetTypes[event.targetType]}:{" "}
                    <code>{event.targetId}</code>
                  </td>
                  <td>
                    <time dateTime={event.timestamp}>
                      {new Date(event.timestamp).toLocaleString(
                        locale === "ar" ? "ar-SA" : "en-US",
                      )}
                    </time>
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
          href={`/app/admin/audit?cursor=${encodeURIComponent(result.value.nextCursor)}`}
        >
          {labels.next}
        </Link>
      )}
    </main>
  );
}
