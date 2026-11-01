"use client";

import { useCallback, useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { invalidateRkLists } from "@/lib/local-first/invalidate";

type Scope = NonNullable<Parameters<typeof invalidateRkLists>[1]>[number];

/** Invalidate TanStack/IDB lists and refresh RSC shells after a mutation. */
export function useRkRefresh() {
  const queryClient = useContext(QueryClientContext);
  const router = useRouter();

  return useCallback(
    (scopes: Scope[] = ["all"]) => {
      if (queryClient) invalidateRkLists(queryClient, scopes);
      router.refresh();
    },
    [queryClient, router]
  );
}
