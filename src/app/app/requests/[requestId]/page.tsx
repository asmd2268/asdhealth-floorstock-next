import Link from "next/link";

import { FloorStockRequestFulfillment } from "@/components/requests/floor-stock-request-fulfillment";
import { baseBrand } from "@/config/platform";
import { getFloorStockRequestRepository } from "@/server/requests/repository";
import { loadFloorStockRequestPageContext } from "@/server/requests/page-context";

export const dynamic = "force-dynamic";

export default async function FloorStockRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const [result, { requestId }] = await Promise.all([
    loadFloorStockRequestPageContext(),
    params,
  ]);
  const labels = result.dictionary.requests;
  if (
    !result.ok ||
    !result.context.mayManage ||
    result.context.featureFlags.inventory !== true
  )
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.fulfillmentTitle}</h1>
        <p>{labels.accessDenied}</p>
        <Link href="/app/requests">{labels.backToRequests}</Link>
      </main>
    );
  let detail;
  try {
    detail = await getFloorStockRequestRepository().fulfillment(
      result.context,
      requestId,
    );
  } catch {
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.fulfillmentTitle}</h1>
        <p>{labels.unavailable}</p>
        <Link href="/app/requests">{labels.backToRequests}</Link>
      </main>
    );
  }
  return (
    <div
      className="inventory-shell request-shell"
      dir={result.locale === "ar" ? "rtl" : "ltr"}
    >
      <header>
        <div>
          <p>{baseBrand.productName}</p>
          <h1>{labels.fulfillmentTitle}</h1>
          <span>{labels.fulfillmentDescription}</span>
        </div>
        <Link href="/app/requests">{labels.backToRequests}</Link>
      </header>
      <main>
        <FloorStockRequestFulfillment detail={detail} labels={labels} />
      </main>
      <footer>{baseBrand.ownerText}</footer>
    </div>
  );
}
