"use client";

import { useMemo, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import type { ReceivableRow } from "@/actions/accounts-receivables";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import type { ReceivablesBucket } from "@/lib/accounts/receivables-buckets";

type Bucket = ReceivablesBucket;

export function ReceivablesBoard({
  rows,
  initialBucket = "all",
}: {
  rows: ReceivableRow[];
  initialBucket?: Bucket;
}) {
  const { openCustomer } = useLeadModal();
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  const [salespersonId, setSalespersonId] = useState("all");

  const salespeople = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.salespersonId && r.salespersonName) {
        map.set(r.salespersonId, r.salespersonName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "en"));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (salespersonId !== "all" && r.salespersonId !== salespersonId) return false;
      if (bucket === "pending" && r.totalPending <= 0) return false;
      if (bucket === "paid" && r.totalPending > 0) return false;
      if (bucket === "token" && r.tokenRemaining <= 0) return false;
      if (bucket === "pre" && r.preDispatchRemaining <= 0) return false;
      if (bucket === "final" && r.finalRemaining <= 0) return false;
      if (bucket === "subsidy" && r.subsidyPending <= 0) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.phone.includes(needle) ||
        (r.city ?? "").toLowerCase().includes(needle) ||
        (r.portalCode ?? "").toLowerCase().includes(needle) ||
        (r.consumerNumber ?? "").toLowerCase().includes(needle) ||
        (r.salespersonName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, bucket, salespersonId]);

  const totals = useMemo(() => {
    return visible.reduce(
      (acc, r) => {
        acc.received += r.totalReceived;
        acc.pending += r.totalPending;
        acc.token += r.tokenRemaining;
        acc.pre += r.preDispatchRemaining;
        acc.final += r.finalRemaining;
        acc.subsidy += r.subsidyPending;
        return acc;
      },
      { received: 0, pending: 0, token: 0, pre: 0, final: 0, subsidy: 0 }
    );
  }, [visible]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={String(visible.length)} />
        <Stat label="Total received" value={formatCurrency(totals.received)} />
        <Stat label="Total pending" value={formatCurrency(totals.pending)} />
        <Stat label="Token pending" value={formatCurrency(totals.token)} />
        <Stat label="Pre-dispatch pending" value={formatCurrency(totals.pre)} />
        <Stat label="Final pending" value={formatCurrency(totals.final)} />
        <Stat label="Company subsidy pending" value={formatCurrency(totals.subsidy)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="recv-search">Search</Label>
          <Input
            id="recv-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, salesperson, portal…"
          />
        </div>
        <div>
          <Label htmlFor="recv-owner">Assigned salesperson</Label>
          <select
            id="recv-owner"
            className="w-full min-w-[180px] rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={salespersonId}
            onChange={(e) => setSalespersonId(e.target.value)}
          >
            <option value="all">All salespeople</option>
            {salespeople.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="recv-bucket">Bucket</Label>
          <select
            id="recv-bucket"
            className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as Bucket)}
          >
            <option value="all">All customers</option>
            <option value="pending">Any pending</option>
            <option value="paid">Paid in full</option>
            <option value="token">Token pending</option>
            <option value="pre">Pre-dispatch pending</option>
            <option value="final">Final pending</option>
            <option value="subsidy">Company subsidy pending</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No customers match these filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.leadId}>
              <button
                type="button"
                onClick={() => openCustomer(r.leadId)}
                className="w-full rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--primary)]/40 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text-dark)]">{r.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatPhone(r.phone)}
                      {r.city ? ` · ${r.city}` : ""}
                      {r.portalCode ? ` · ${r.portalCode}` : ""}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[var(--text-body)]">
                      Assigned: {r.salespersonName ?? "—"}
                      {r.surveyorName ? ` · Surveyor ${r.surveyorName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {r.salesStageLabel}
                      {r.consumerNumber ? ` · Consumer ${r.consumerNumber}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--text-muted)]">Received</p>
                    <p className="text-sm font-bold text-[var(--success)]">
                      {formatCurrency(r.totalReceived)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Pending</p>
                    <p
                      className={`text-sm font-bold ${
                        r.totalPending > 0 ? "text-[var(--warn)]" : "text-[var(--text-dark)]"
                      }`}
                    >
                      {formatCurrency(r.totalPending)}
                    </p>
                    {r.discountAmount > 0 ? (
                      <p
                        className="mt-1 text-xs text-[var(--text-muted)]"
                        title={r.discountReason ?? undefined}
                      >
                        Discount {formatCurrency(r.discountAmount)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Part
                    label="Token"
                    received={r.tokenReceived}
                    pending={r.tokenRemaining}
                  />
                  <Part
                    label="Pre-dispatch"
                    received={r.preDispatchReceived}
                    pending={r.preDispatchRemaining}
                  />
                  <Part
                    label="Final"
                    received={r.finalReceived}
                    pending={r.finalRemaining}
                  />
                  <Part
                    label="Subsidy"
                    received={r.subsidyReceived}
                    pending={r.subsidyPending}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--text-dark)]">{value}</p>
    </div>
  );
}

function Part({
  label,
  received,
  pending,
}: {
  label: string;
  received: number;
  pending: number;
}) {
  return (
    <div className="rounded-lg bg-[var(--bg)] px-2.5 py-2">
      <p className="text-[var(--text-muted)]">{label}</p>
      <p className="font-semibold text-[var(--text-dark)]">
        Rec. {formatCurrency(received)}
      </p>
      <p className={pending > 0 ? "font-semibold text-[var(--warn)]" : "text-[var(--text-muted)]"}>
        Pend. {formatCurrency(pending)}
      </p>
    </div>
  );
}
