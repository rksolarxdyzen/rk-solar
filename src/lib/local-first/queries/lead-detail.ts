import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getLead } from "@/actions/leads";
import { crmFetch } from "@/lib/local-first/crm-fetch";
import { QUERY_GC_MS } from "@/lib/local-first/query-client";
import type { LeadWithRelations } from "@/lib/domain/types";

/** Full lead/customer modal payload — lives in the same IDB persist blob as lists. */
export function leadDetailKey(companyId: string, leadId: string) {
  return ["rk", "lead", companyId, leadId] as const;
}

export function leadDetailOptions(companyId: string, leadId: string) {
  return queryOptions({
    queryKey: leadDetailKey(companyId, leadId),
    queryFn: () => getLead(leadId),
    staleTime: 60_000,
    gcTime: QUERY_GC_MS,
  });
}

export function prefetchLeadDetail(
  queryClient: QueryClient,
  companyId: string,
  leadId: string
) {
  if (!companyId || !leadId) return;
  void queryClient.prefetchQuery(leadDetailOptions(companyId, leadId));
}

/** Batch warm via JSON API (one round-trip for N ids). */
export async function prefetchLeadDetailsBatch(
  queryClient: QueryClient,
  companyId: string,
  leadIds: string[]
) {
  if (!companyId) return;
  const missing = Array.from(new Set(leadIds.filter(Boolean))).filter((id) => {
    const state = queryClient.getQueryState(leadDetailKey(companyId, id));
    return !state?.data;
  });
  if (missing.length === 0) return;

  try {
    const params = new URLSearchParams({ ids: missing.join(",") });
    const rows = await crmFetch<LeadWithRelations[]>(
      `/api/local-first/leads/modal?${params}`
    );
    for (const row of rows ?? []) {
      if (!row?.id) continue;
      queryClient.setQueryData(leadDetailKey(companyId, row.id), row);
    }
  } catch {
    // Best-effort; fall back to per-id server actions.
    for (const id of missing.slice(0, 6)) {
      prefetchLeadDetail(queryClient, companyId, id);
    }
  }
}

export function invalidateLeadDetail(
  queryClient: QueryClient,
  companyId: string,
  leadId?: string
) {
  if (leadId) {
    void queryClient.invalidateQueries({
      queryKey: leadDetailKey(companyId, leadId),
    });
    return;
  }
  void queryClient.invalidateQueries({ queryKey: ["rk", "lead", companyId] });
}
