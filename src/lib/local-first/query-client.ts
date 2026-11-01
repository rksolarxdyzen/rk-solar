import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

export const QUERY_STALE_MS = 30_000;
/** Longer SWR window for dashboard so soft-nav paints from IDB. */
export const DASHBOARD_QUERY_STALE_MS = 5 * 60_000;
export const QUERY_GC_MS = 24 * 60 * 60 * 1000;

/** v2: drop caches filled by IdlePrefetch-all (mass server-action POSTs crashed Flight). */
export function cacheScopeKey(companyId: string, userId: string): string {
  return `rks-cache-v2-${companyId}-${userId}`;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        gcTime: QUERY_GC_MS,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

export function createIdbPersister(companyId: string, userId: string) {
  const key = cacheScopeKey(companyId, userId);
  return createAsyncStoragePersister({
    key,
    storage: {
      getItem: async (storageKey) => {
        const value = await get(storageKey);
        return typeof value === "string" ? value : null;
      },
      setItem: (storageKey, value) => set(storageKey, value),
      removeItem: (storageKey) => del(storageKey),
    },
  });
}

export async function wipePersistedCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const { keys, del: remove } = await import("idb-keyval");
  const all = await keys();
  await Promise.all(
    all
      .filter(
        (key) =>
          String(key).startsWith("rks-cache-") ||
          String(key).startsWith("rk-list-state-")
      )
      .map((key) => remove(key))
  );
}
