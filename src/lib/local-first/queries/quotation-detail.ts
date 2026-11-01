import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getQuotation } from "@/actions/quotations";
import { QUERY_GC_MS } from "@/lib/local-first/query-client";
import type { QuotationRow } from "@/lib/quotations/types";

export function quotationDetailKey(companyId: string, quoteId: string) {
  return ["rk", "quotation", companyId, quoteId] as const;
}

export function quotationDetailOptions(companyId: string, quoteId: string) {
  return queryOptions({
    queryKey: quotationDetailKey(companyId, quoteId),
    queryFn: () => getQuotation(quoteId),
    staleTime: 60_000,
    gcTime: QUERY_GC_MS,
  });
}

export function prefetchQuotationDetail(
  queryClient: QueryClient,
  companyId: string,
  quoteId: string
) {
  if (!companyId || !quoteId) return;
  void queryClient.prefetchQuery(quotationDetailOptions(companyId, quoteId));
}

export function invalidateQuotationDetail(
  queryClient: QueryClient,
  companyId: string,
  quoteId?: string
) {
  if (quoteId) {
    void queryClient.invalidateQueries({
      queryKey: quotationDetailKey(companyId, quoteId),
    });
    return;
  }
  void queryClient.invalidateQueries({
    queryKey: ["rk", "quotation", companyId],
  });
}

/** Prefer list-row shell when detail cache is cold. */
export function quotationShellFromListCache(
  queryClient: QueryClient,
  companyId: string,
  quoteId: string
): Partial<QuotationRow> | null {
  const list = queryClient.getQueryData<Array<Record<string, unknown>>>([
    "rk",
    "quotations",
    companyId,
  ]);
  if (!Array.isArray(list)) return null;
  const row = list.find((q) => q?.id === quoteId);
  if (!row) return null;
  return row as Partial<QuotationRow>;
}
