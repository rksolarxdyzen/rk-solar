"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  QueryClientProvider,
  useIsFetching,
  type QueryClient,
} from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import type { Persister } from "@tanstack/react-query-persist-client";
import {
  createAppQueryClient,
  createIdbPersister,
  QUERY_GC_MS,
  cacheScopeKey,
} from "@/lib/local-first/query-client";
import {
  flushOfflineQueue,
  loadOfflineQueue,
} from "@/lib/local-first/offline-queue";
import {
  markSynced,
  setOnlineStatus,
  setSyncing,
} from "@/lib/local-first/sync-status";

function SyncBridge({
  client,
  userId,
}: {
  client: QueryClient;
  userId: string;
}) {
  const fetching = useIsFetching();
  useEffect(() => {
    void loadOfflineQueue(userId);
    setOnlineStatus(navigator.onLine);
    function goOnline() {
      setOnlineStatus(true);
      void flushOfflineQueue(userId, () => {
        markSynced();
        void client.invalidateQueries({ queryKey: ["rk"] });
      });
      void client.invalidateQueries({ queryKey: ["rk"] });
    }
    function goOffline() {
      setOnlineStatus(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine) {
      void flushOfflineQueue(userId, () => {
        markSynced();
        void client.invalidateQueries({ queryKey: ["rk"] });
      });
    }
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [client, userId]);

  useEffect(() => {
    if (fetching > 0) {
      setSyncing(true);
      return;
    }
    setSyncing(false);
    markSynced();
  }, [fetching]);

  return null;
}

/**
 * Keep a single QueryClientProvider for the whole session.
 * Do NOT swap to PersistQueryClientProvider after mount — that remounted the
 * dashboard tree ~1s after paint and, with IdlePrefetch + RSC seeding, produced
 * Next "This page couldn't load" (Flight #412 / action POSTs).
 *
 * IDB restore runs in an effect via persistQueryClient; SoftLink hover still
 * warms individual route queries.
 */
export function QueryProvider({
  companyId,
  userId,
  children,
}: {
  companyId: string;
  userId: string;
  children: ReactNode;
}) {
  const [client] = useState(() => createAppQueryClient());
  const buster = cacheScopeKey(companyId, userId);

  useEffect(() => {
    let persister: Persister;
    try {
      persister = createIdbPersister(companyId, userId);
    } catch {
      return;
    }
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: QUERY_GC_MS,
      buster,
    });
    void restorePromise.catch(() => undefined);
    return () => {
      unsubscribe();
    };
  }, [client, companyId, userId, buster]);

  return (
    <QueryClientProvider client={client}>
      <SyncBridge client={client} userId={userId} />
      {children}
    </QueryClientProvider>
  );
}
