"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveReminder } from "@/actions/reminders";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { queueableResolveReminder } from "@/lib/local-first/queueable-crm";
import {
  getReminderDisplayLabel,
  type ReminderItem,
  type ReminderSummary,
} from "@/lib/domain/reminders";
import { formatDateTime, cn } from "@/lib/utils";

const URGENCY_STYLES: Record<string, string> = {
  overdue: "border-[var(--error)] bg-[var(--error-light)]",
  due_now: "border-[var(--warn)] bg-[var(--warn-light)]",
  due_today: "border-[var(--primary)] bg-[var(--primary-faint)]",
  upcoming: "border-[var(--border)] bg-white",
};

export function RemindersWidget({ summary }: { summary: ReminderSummary }) {
  const session = useOptionalLocalFirstSession();
  const { openLead } = useLeadModal();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visibleItems = summary.items.filter((item) => !hiddenIds.has(item.id));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Overdue", value: summary.overdue, tone: "text-[var(--error)]" },
          { label: "Due now", value: summary.dueNow, tone: "text-[var(--warn)]" },
          { label: "Today", value: summary.dueToday, tone: "text-[var(--primary)]" },
          { label: "Upcoming", value: summary.upcoming, tone: "text-[var(--text-muted)]" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {s.label}
            </p>
            <p className={cn("mt-1 text-2xl font-semibold", s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-white/70 px-6 py-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">No open reminders</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleItems.map((item) => (
            <ReminderRow
              key={item.id}
              item={item}
              pending={pending}
              onOpen={() => openLead(item.leadId)}
              onResolve={() => {
                setError(null);
                setHiddenIds((prev) => new Set(prev).add(item.id));
                startTransition(async () => {
                  try {
                    if (session?.userId) {
                      const result = await queueableResolveReminder(
                        session.userId,
                        item.id,
                        item.leadId
                      );
                      if (!result.ok) throw new Error(result.error);
                      if (result.queued) return;
                    } else {
                      await resolveReminder(item.id, item.leadId);
                    }
                    router.refresh();
                  } catch (err) {
                    setHiddenIds((prev) => {
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                    setError(err instanceof Error ? err.message : "Could not mark reminder done");
                  }
                });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReminderRow({
  item,
  pending,
  onOpen,
  onResolve,
}: {
  item: ReminderItem;
  pending: boolean;
  onOpen: () => void;
  onResolve: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4",
        URGENCY_STYLES[item.urgency] ?? URGENCY_STYLES.upcoming
      )}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {getReminderDisplayLabel(item)}
        </p>
        <p className="mt-0.5 font-semibold text-[var(--text-dark)]">{item.leadName}</p>
        <p className="mt-1 text-sm text-[var(--text-body)]">{item.message}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDateTime(item.dueAt)}</p>
      </button>
      {item.resolvable !== false && (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onResolve}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Done
        </Button>
      )}
    </li>
  );
}
