import type { QueryClient } from "@tanstack/react-query";
import { matchQuotationDetailId } from "@/lib/local-first/quotation-detail-path";

/** Primary CRM routes warmed for SoftLink (query modules only — no RSC document prefetch). */
export const RK_ROUTE_HREFS = [
  "/",
  "/pipeline",
  "/customers",
  "/quotations",
  "/payments",
  "/installation",
  "/liaison",
  "/dealers",
  "/maintenance",
  "/team",
  "/grievances",
  "/lead-import",
  "/ingest",
  "/catalog",
  "/reports/sales-reps",
  "/reports/dealers",
  "/accounts/receivables",
] as const;

export type RkRouteHref = (typeof RK_ROUTE_HREFS)[number];

export function isRkSoftRoute(href: string): boolean {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if ((RK_ROUTE_HREFS as readonly string[]).includes(normalized)) return true;
  return matchQuotationDetailId(normalized) != null;
}

/**
 * Warm TanStack data for one route. Dynamic-imports query options so hovering
 * Pipeline does not pull payments/catalog server-action stubs into the graph.
 */
export function prefetchRouteQueries(
  queryClient: QueryClient,
  companyId: string,
  href: string
): void {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  const run = (p: Promise<unknown>) => {
    void p.catch(() => undefined);
  };

  if (path === "/" || path === "") {
    run(
      import("@/lib/local-first/queries").then(({ dashboardOptions }) =>
        queryClient.prefetchQuery(dashboardOptions(companyId))
      )
    );
    return;
  }
  if (path === "/pipeline") {
    run(
      import("@/lib/local-first/queries").then(({ pipelineOptions }) =>
        queryClient.prefetchQuery(
          pipelineOptions(companyId, { status: "active", queue: "all" })
        )
      )
    );
    return;
  }
  if (path === "/customers") {
    run(
      import("@/lib/local-first/queries").then(({ customersOptions }) =>
        queryClient.prefetchQuery(customersOptions(companyId))
      )
    );
    return;
  }
  if (path === "/quotations") {
    run(
      import("@/lib/local-first/queries").then(({ quotationsOptions }) =>
        queryClient.prefetchQuery(quotationsOptions(companyId))
      )
    );
    return;
  }
  const quoteId = matchQuotationDetailId(path);
  if (quoteId) {
    run(
      import("@/lib/local-first/queries/quotation-detail").then(
        ({ quotationDetailOptions }) =>
          queryClient.prefetchQuery(quotationDetailOptions(companyId, quoteId))
      )
    );
    return;
  }
  if (path === "/payments") {
    run(
      import("@/lib/local-first/queries").then(({ paymentsOptions }) =>
        queryClient.prefetchQuery(paymentsOptions(companyId))
      )
    );
    return;
  }
  if (path === "/installation") {
    run(
      import("@/lib/local-first/queries").then(({ installationOptions }) =>
        queryClient.prefetchQuery(installationOptions(companyId))
      )
    );
    return;
  }
  if (path === "/liaison") {
    run(
      import("@/lib/local-first/queries").then(({ liaisonOptions }) =>
        queryClient.prefetchQuery(liaisonOptions(companyId))
      )
    );
    return;
  }
  if (path === "/dealers") {
    run(
      import("@/lib/local-first/queries").then(({ dealersOptions }) =>
        queryClient.prefetchQuery(dealersOptions(companyId))
      )
    );
    return;
  }
  if (path === "/accounts/receivables") {
    run(
      import("@/lib/local-first/queries").then(({ receivablesOptions }) =>
        queryClient.prefetchQuery(receivablesOptions(companyId))
      )
    );
  }
}
