"use client";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import {
  getReminderDisplayLabel,
  type ReminderItem,
  type ReminderSummary,
} from "@/lib/domain/reminders";
import { formatDateTime, cn } from "@/lib/utils";

const URGENCY: Record<
  string,
  { label: string; chip: string; bar: string }
> = {
  overdue: {
    label: "Overdue",
    chip: "bg-[var(--error-light)] text-[var(--error)]",
    bar: "bg-[var(--error)]",
  },
  due_now: {
    label: "Due now",
    chip: "bg-[var(--warn-light)] text-[var(--warn)]",
    bar: "bg-[var(--warn)]",
  },
  due_today: {
    label: "Today",
    chip: "bg-[var(--primary-light)] text-[var(--primary)]",
    bar: "bg-[var(--primary)]",
  },
};

export function DashboardAttentionList({
  summary,
  items,
}: {
  summary: ReminderSummary;
  items: ReminderItem[];
}) {
  const { openLead } = useLeadModal();
  const dueCount = summary.overdue + summary.dueNow + summary.dueToday;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-light)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent-hover)]">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
              Needs attention
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {dueCount === 0
                ? "No follow-ups due right now"
                : `${dueCount} reminder${dueCount === 1 ? "" : "s"} due today or overdue`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-[var(--error-light)] px-2.5 py-1 text-[var(--error)]">
            {summary.overdue} overdue
          </span>
          <span className="rounded-full bg-[var(--warn-light)] px-2.5 py-1 text-[var(--warn)]">
            {summary.dueNow} now
          </span>
          <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 text-[var(--primary)]">
            {summary.dueToday} today
          </span>
          <Link
            href="/alerts"
            className="ml-1 inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
          >
            All reminders <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
          You&apos;re clear — enjoy the quiet inbox.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-light)]">
          {items.map((item) => {
            const tone = URGENCY[item.urgency] ?? URGENCY.due_today;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openLead(item.leadId)}
                  className="group flex w-full items-stretch gap-0 text-left transition hover:bg-[var(--primary-faint)]"
                >
                  <span className={cn("w-1 shrink-0", tone.bar)} aria-hidden />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--text-dark)] group-hover:text-[var(--primary)]">
                        {item.leadName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                        {getReminderDisplayLabel(item)}
                        {item.message ? ` · ${item.message}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          tone.chip
                        )}
                      >
                        {tone.label}
                      </span>
                      <span className="mt-1 block text-[11px] text-[var(--text-light)]">
                        {formatDateTime(item.dueAt)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
