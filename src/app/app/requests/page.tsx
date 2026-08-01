import Link from "next/link";

import { FloorStockRequestWorkspace } from "@/components/requests/floor-stock-request-workspace";
import { baseBrand } from "@/config/platform";
import { getFloorStockRequestRepository } from "@/server/requests/repository";
import { loadFloorStockRequestPageContext } from "@/server/requests/page-context";

export const dynamic = "force-dynamic";

export default async function FloorStockRequestsPage() {
  const result = await loadFloorStockRequestPageContext();
  const labels = result.dictionary.requests;
  if (!result.ok)
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.title}</h1>
        <p>{labels.accessDenied}</p>
        <Link href="/app">{labels.backToApp}</Link>
      </main>
    );

  let requests;
  let configurations;
  try {
    const repository = getFloorStockRequestRepository();
    [requests, configurations] = await Promise.all([
      repository.list(result.context),
      result.context.mayCreate
        ? repository.configurations(result.context)
        : Promise.resolve([]),
    ]);
  } catch {
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.title}</h1>
        <p>{labels.unavailable}</p>
        <Link href="/app">{labels.backToApp}</Link>
      </main>
    );
  }
  const visibleRequests = requests.items.map((request) => {
    const ownDepartmentRequest =
      request.requestedByUid === result.context.uid &&
      request.departmentId === result.context.activeDepartmentId;
    return {
      ...request,
      maySubmit: ownDepartmentRequest && request.status === "draft",
      mayCancel:
        ownDepartmentRequest &&
        (request.status === "draft" || request.status === "submitted"),
    };
  });
  return (
    <div
      className="inventory-shell request-shell"
      dir={result.locale === "ar" ? "rtl" : "ltr"}
    >
      <header>
        <div>
          <p>{baseBrand.productName}</p>
          <h1>{labels.title}</h1>
          <span>{labels.subtitle}</span>
        </div>
        <Link href="/app">{labels.backToApp}</Link>
      </header>
      <main>
        <FloorStockRequestWorkspace
          configurations={configurations}
          labels={labels}
          mayApprove={result.context.mayApprove}
          mayCreate={result.context.mayCreate}
          mayManage={result.context.mayManage}
          requests={visibleRequests}
        />
      </main>
      <footer>{baseBrand.ownerText}</footer>
    </div>
  );
}
