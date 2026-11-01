"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { searchInventoryCustomers } from "@/actions/inventory";
import type { InventoryCustomer } from "@/lib/inventory/movements";

const STAGE_LABEL: Record<string, string> = {
  quote_accepted: "Won",
  token_pending_verification: "Token pending",
  token_verified_and_feasibility_ok: "Token verified",
  pre_dispatch_pending_verification: "Pre-dispatch pending",
  pre_dispatch_verified: "Pre-dispatch verified",
  installation_assigned: "Install assigned",
  installation_in_progress: "Install in progress",
  installation_completed: "Install done",
  final_pending_verification: "Final pending",
  final_verified: "Final verified",
  liaison_in_progress: "Liaison",
  meter_installed: "Meter installed",
  subsidy_pending: "Subsidy pending",
  subsidy_received_pending_accounts: "Subsidy received",
  completed: "Completed",
};

export function CustomerPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (customer: InventoryCustomer) => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<InventoryCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchInventoryCustomers(q);
      if (id !== reqId.current) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setList([]);
      } else {
        setError(null);
        setList(res.customers);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Modal open={open} onClose={onClose} title="Choose customer" subtitle="Won and later customers">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-h-[44px] pl-9"
            placeholder="Name, phone or city…"
            aria-label="Search customers"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />}
        </div>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <ul className="max-h-[55vh] divide-y divide-[var(--border-light)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {!loading && list.length === 0 && (
            <li className="p-4 text-center text-sm text-[var(--text-muted)]">No customers found.</li>
          )}
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(c);
                  setQ("");
                  onClose();
                }}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-dark)]">{c.name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {[c.phone, c.city].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <Badge>{STAGE_LABEL[c.sales_stage] ?? c.sales_stage}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
