"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { prefetchLeadDetail } from "@/lib/local-first/queries/lead-detail";

/** Hover/focus warm for a single lead/customer modal. */
export function usePrefetchLeadDetail() {
  const queryClient = useQueryClient();
  const session = useOptionalLocalFirstSession();
  const companyId = session?.companyId;

  return useCallback(
    (leadId: string) => {
      if (!companyId || !leadId) return;
      prefetchLeadDetail(queryClient, companyId, leadId);
    },
    [queryClient, companyId]
  );
}
