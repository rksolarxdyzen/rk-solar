"use client";

import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { flushOfflineQueue } from "@/lib/local-first/offline-queue";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import {
  getSyncSnapshot,
  markSynced,
  subscribeSyncStatus,
} from "@/lib/local-first/sync-status";
import { cn } from "@/lib/utils";

export function SyncIndicator() {
  const session = useOptionalLocalFirstSession();
  const snap = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncSnapshot,
    getSyncSnapshot
  );
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const queryClient = useQueryClient();
  const queued = snap.queued.length;
  const busy =
    snap.syncing || fetching > 0 || mutating > 0 || queued > 0;

  let label = "Synced";
  if (!snap.online) {
    label = queued > 0 ? `Offline · ${queued} queued` : "Offline";
  } else if (queued > 0) {
    label = `Syncing · ${queued}`;
  } else if (busy) {
    label = "Syncing";
  }

  return (
    <button
      type="button"
      className={cn(
        "text-[0.65rem] font-medium uppercase tracking-wider md:block",
        !snap.online
          ? "text-[var(--warn)]"
          : busy
            ? "text-[var(--primary)]"
            : "text-[var(--text-muted)]",
        busy && "animate-pulse",
        "rounded-md px-1.5 py-0.5 hover:bg-[var(--bg)]"
      )}
      title={
        queued > 0
          ? `${queued} change(s) waiting — click to sync`
          : snap.lastSyncedAt
            ? `Last synced ${new Date(snap.lastSyncedAt).toLocaleTimeString("en-IN")}`
            : "Waiting for first sync"
      }
      aria-live="polite"
      onClick={() => {
        if (!session?.userId) return;
        void flushOfflineQueue(session.userId, () => {
          markSynced();
          void queryClient.invalidateQueries({ queryKey: ["rk"] });
        });
      }}
    >
      {label}
    </button>
  );
}
