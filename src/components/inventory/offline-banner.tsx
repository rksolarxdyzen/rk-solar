"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Stock is validated live, so nothing can be saved while offline. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg,#fff7e6)] px-3 py-2 text-sm font-medium text-[var(--text-dark)]">
      <WifiOff className="h-4 w-4 shrink-0" />
      You are offline. Stock entries can&apos;t be saved until the connection is back.
    </div>
  );
}
