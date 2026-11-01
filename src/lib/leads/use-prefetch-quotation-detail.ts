"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { prefetchQuotationDetail } from "@/lib/local-first/queries/quotation-detail";

export function usePrefetchQuotationDetail() {
  const queryClient = useQueryClient();
  const session = useOptionalLocalFirstSession();
  const companyId = session?.companyId;

  return useCallback(
    (quoteId: string) => {
      if (!companyId || !quoteId) return;
      prefetchQuotationDetail(queryClient, companyId, quoteId);
    },
    [queryClient, companyId]
  );
}
