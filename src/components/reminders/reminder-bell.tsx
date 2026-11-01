"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, X } from "lucide-react";
import { getMyReminders, resolveReminder } from "@/actions/reminders";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { queueableResolveReminder } from "@/lib/local-first/queueable-crm";
import { getReminderDisplayLabel, type ReminderItem } from "@/lib/domain/reminders";
import { formatDateTime, cn } from "@/lib/utils";

const SEEN_PAYMENT_ALERTS_KEY = "rk-seen-payment-alerts";

function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Desktop pop-up for payment requests not seen before on this device. */
function announceNewPaymentAlerts(items: ReminderItem[]) {
  const paymentItems = items.filter((i) => i.kind === "payment");
  let seen: string[] | null = null;
  try {
    const raw = window.localStorage.getItem(SEEN_PAYMENT_ALERTS_KEY);
    seen = raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    seen = null;
  }
  window.localStorage.setItem(
    SEEN_PAYMENT_ALERTS_KEY,
    JSON.stringify(paymentItems.map((i) => i.id))
  );
  // First run on this device: record current queue without a burst of pop-ups.
  if (seen == null) return;
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const seenSet = new Set(seen);
  for (const item of paymentItems.filter((i) => !seenSet.has(i.id)).slice(0, 5)) {
    try {
      new Notification(`Payment verification · ${item.leadName}`, {
        body: item.message,
        tag: item.id,
      });
    } catch {
      // Mobile Chrome requires a service worker for notifications.
    }
  }
}

/**
 * Header Alerts control — replaces the standalone Reminders nav tab (Phase 3a).
 * Drawer lists urgent reminders; full list lives at /alerts.
 */
export function AlertsDrawer() {
  const session = useOptionalLocalFirstSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [dueToday, setDueToday] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { openLead } = useLeadModal();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [paymentAlerts, setPaymentAlerts] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | null>(null);
  const router = useRouter();

  async function load() {
    try {
      const summary = await getMyReminders();
      setPaymentAlerts(Boolean(summary.paymentAlerts));
      if (summary.paymentAlerts) {
        announceNewPaymentAlerts(summary.items);
        if (notificationsSupported()) setNotifyPermission(Notification.permission);
      }
      setItems(summary.items.slice(0, 12));
      setOverdue(summary.overdue + summary.dueNow);
      setDueToday(summary.dueToday);
      setError(null);
    } catch {
      setItems([]);
      setOverdue(0);
      setDueToday(0);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function markDone(item: ReminderItem) {
    setError(null);
    setPendingId(item.id);
    setItems((prev) => prev.filter((r) => r.id !== item.id));
    setOverdue((n) =>
      item.urgency === "overdue" || item.urgency === "due_now" ? Math.max(0, n - 1) : n
    );

    startTransition(async () => {
      try {
        if (session?.userId) {
          const result = await queueableResolveReminder(
            session.userId,
            item.id,
            item.leadId
          );
          if (!result.ok) throw new Error(result.error);
          if (result.queued) {
            setPendingId(null);
            return;
          }
        } else {
          await resolveReminder(item.id, item.leadId);
        }
        await load();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark reminder done");
        await load();
      } finally {
        setPendingId(null);
      }
    });
  }

  const badgeCount = overdue + dueToday;

  return (
    <div className="relative overflow-visible">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) void load();
            return next;
          });
        }}
        className="relative flex h-10 w-10 items-center justify-center overflow-visible rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text-dark)]"
        aria-label={open ? "Close alerts" : "Open alerts"}
        title="Alerts"
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span className="absolute right-0 top-0 z-10 flex h-[18px] min-w-[18px] translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-[var(--error)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[180] bg-[var(--text-dark)]/20 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <aside
              className="fixed inset-y-0 right-0 z-[190] flex w-full max-w-md flex-col border-l border-[var(--border)] bg-white shadow-[var(--shadow-lg)]"
              role="dialog"
              aria-modal="true"
              aria-label="Alerts"
            >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-dark)]">Alerts</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {overdue > 0
                    ? `${overdue} need attention`
                    : dueToday > 0
                      ? `${dueToday} due today`
                      : "You're caught up"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
                aria-label="Close alerts"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <p className="border-b border-red-100 bg-[var(--error-light)] px-5 py-2 text-xs text-[var(--error)]">
                {error}
              </p>
            )}

            {paymentAlerts && notifyPermission === "default" && (
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-[var(--primary-faint)] px-5 py-2.5">
                <p className="text-xs text-[var(--text-body)]">
                  Get a desktop pop-up when a new payment request comes in.
                </p>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-[var(--primary)]"
                  onClick={() => {
                    void Notification.requestPermission().then(setNotifyPermission);
                  }}
                >
                  Enable
                </button>
              </div>
            )}

            <ul className="flex-1 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">
                  No open alerts
                </li>
              )}
              {items.map((item) => (
                <li
                  key={item.id}
                  className="border-b border-[var(--border-light)] px-5 py-3.5"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (item.kind === "payment") {
                        router.push("/payments");
                        setOpen(false);
                        return;
                      }
                      openLead(item.leadId);
                      setOpen(false);
                    }}
                  >
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {getReminderDisplayLabel(item)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--text-dark)]">
                      {item.leadName}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-body)] break-words">
                      {item.message}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-[0.65rem]",
                        item.urgency === "overdue" || item.urgency === "due_now"
                          ? "font-semibold text-[var(--error)]"
                          : "text-[var(--text-muted)]"
                      )}
                    >
                      {formatDateTime(item.dueAt)}
                    </p>
                  </button>
                  {item.resolvable !== false && (
                    <button
                      type="button"
                      disabled={pending && pendingId === item.id}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] disabled:opacity-50"
                      onClick={() => markDone(item)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {pending && pendingId === item.id ? "Saving…" : "Mark done"}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="border-t border-[var(--border)] p-4">
              <Link
                href="/alerts"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
              >
                View all reminders
              </Link>
            </div>
          </aside>
          </>,
          document.body
        )}
    </div>
  );
}

/** @deprecated Use AlertsDrawer — kept as alias for any lingering imports */
export const ReminderBell = AlertsDrawer;
