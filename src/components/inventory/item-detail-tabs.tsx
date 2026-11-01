"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate, formatQty } from "@/lib/inventory/format";
import { MOVEMENT_TYPE_LABELS, SERIAL_STATUS_LABELS, type InventoryUnit, type SerialStatus } from "@/lib/inventory/types";
import type { ItemHistoryRow, ItemSerialRow } from "@/lib/inventory/queries";

const STATUS_VARIANT: Record<SerialStatus, string> = {
  in_stock: "received",
  dispatched: "contacted",
  defective: "warn",
  scrapped: "lost",
};

function Party({ row }: { row: ItemHistoryRow }) {
  if (row.lead_id && row.lead_name) {
    return (
      <Link href={`/leads/${row.lead_id}`} className="font-medium text-[var(--primary)] hover:underline">
        {row.lead_name}
      </Link>
    );
  }
  if (row.is_opening_stock) return <span>Opening stock</span>;
  return <span>{row.supplier_name ?? "—"}</span>;
}

export function ItemDetailTabs({
  history,
  serials,
  trackSerials,
  unit,
}: {
  history: ItemHistoryRow[];
  serials: ItemSerialRow[];
  trackSerials: boolean;
  unit: InventoryUnit;
}) {
  const [tab, setTab] = useState("history");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SerialStatus | "all">("all");

  const shownSerials = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return serials.filter(
      (s) => (status === "all" || s.status === status) && (!needle || s.serial_no.includes(needle) || s.lead_name?.toUpperCase().includes(needle))
    );
  }, [serials, q, status]);

  const tabs = [{ id: "history", label: `History (${history.length})` }];
  if (trackSerials) tabs.push({ id: "serials", label: `Serials (${serials.length})` });

  return (
    <div className="space-y-3">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "history" &&
        (history.length === 0 ? (
          <Card className="py-8 text-center text-sm text-[var(--text-muted)]">No stock movement yet.</Card>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.line_id} className={cn("space-y-1", h.reversed && "opacity-60")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={h.quantity_delta > 0 ? "received" : "contacted"}>{MOVEMENT_TYPE_LABELS[h.movement_type]}</Badge>
                    <Link href={`/inventory/movements/${h.movement_id}`} className="font-mono text-xs font-semibold text-[var(--primary)] hover:underline">
                      {h.movement_no}
                    </Link>
                    {h.reversed && <Badge variant="lost">Reversed</Badge>}
                    {h.return_condition === "defective" && <Badge variant="warn">Defective</Badge>}
                  </div>
                  <span className={cn("font-bold tabular-nums", h.quantity_delta > 0 ? "text-[var(--success)]" : "text-[var(--text-dark)]")}>
                    {h.quantity_delta > 0 ? "+" : "−"}
                    {formatQty(Math.abs(h.quantity_delta), unit)}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-body)]">
                  <Party row={h} />
                  <span className="text-[var(--text-muted)]">
                    {" · "}
                    {formatDate(h.movement_date)}
                    {h.by_name ? ` · by ${h.by_name}` : ""}
                  </span>
                </p>
                {h.serials.length > 0 && (
                  <p className="break-words font-mono text-xs text-[var(--text-muted)]">{h.serials.join(", ")}</p>
                )}
              </Card>
            ))}
          </div>
        ))}

      {tab === "serials" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Search serial or customer" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-[44px] font-mono" />
            <div className="flex gap-1 overflow-x-auto">
              {(["all", "in_stock", "dispatched", "defective", "scrapped"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "min-h-[40px] shrink-0 rounded-full border px-3 text-xs font-semibold",
                    status === s ? "border-[var(--primary)] bg-[var(--primary-faint)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"
                  )}
                >
                  {s === "all" ? "All" : SERIAL_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <Card className="divide-y divide-[var(--border-light)] p-0">
            {shownSerials.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">No serials.</p>}
            {shownSerials.slice(0, 500).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <Link href={`/inventory/serials?q=${encodeURIComponent(s.serial_no)}`} className="font-mono text-sm font-semibold hover:text-[var(--primary)]">
                  {s.serial_no}
                </Link>
                <div className="flex items-center gap-2 text-sm">
                  {s.current_lead_id && s.lead_name && (
                    <Link href={`/leads/${s.current_lead_id}`} className="text-[var(--primary)] hover:underline">
                      {s.lead_name}
                    </Link>
                  )}
                  <Badge variant={STATUS_VARIANT[s.status]}>{SERIAL_STATUS_LABELS[s.status]}</Badge>
                </div>
              </div>
            ))}
            {shownSerials.length > 500 && (
              <p className="p-3 text-center text-xs text-[var(--text-muted)]">Showing 500 of {shownSerials.length}. Search to narrow down.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
