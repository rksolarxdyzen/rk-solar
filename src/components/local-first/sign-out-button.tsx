"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/actions/auth";
import { wipeOfflineQueues } from "@/lib/local-first/offline-queue";
import { wipePersistedCache } from "@/lib/local-first/query-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text-dark)]"
      title="Sign out"
      aria-label="Sign out"
      onClick={() => {
        void (async () => {
          await wipePersistedCache().catch(() => undefined);
          await wipeOfflineQueues().catch(() => undefined);
          await signOut();
        })();
      }}
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
