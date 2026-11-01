"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, PackageMinus, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loadCustomerMaterial } from "@/actions/inventory";
import { formatDate, formatQty } from "@/lib/inventory/format";
import { MOVEMENT_TYPE_LABELS } from "@/lib/inventory/types";
import type { CustomerMaterial } from "@/lib/inventory/movements";
import { cn } from "@/lib/utils";
import { useLeadModal } from "@/components/leads/lead-modal-context";

export interface InventoryModalAccess {
  view: boolean;
  dispatch: boolean;
  return: boolean;
}

export function MaterialTab({ leadId, access }: { leadId: string; access: InventoryModalAccess }) {
  const { closeLead } = useLeadModal();
  const [state, setState] = useState<{ leadId: string; material?: CustomerMaterial; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCustomerMaterial(leadId).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { leadId, material: res.material } : { leadId, error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const current = state?.leadId === leadId ? state : null;
  const material = current?.material;
  const serialsByItem = new Map<string, string[]>();
  for (const s of material?.serials ?? []) {
    serialsByItem.set(s.item_id, [...(serialsByItem.get(s.item_id) ?? []), s.serial_no]);
  }
  const hasMaterial = (material?.items.length ?? 0) > 0;

  return (
    <div
      className="space-y-4"
      data-testid="material-tab"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a[href]")) closeLead();
      }}
    >
      {(access.dispatch || (access.return && hasMaterial)) && (
        <div className="flex flex-wrap gap-2">
          {access.dispatch && (
            <Link
              href={`/inventory/dispatch/new?lead=${leadId}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              <Truck className="h-4 w-4" /> Dispatch material
            </Link>
          )}
          {access.return && hasMaterial && (
            <Link
              href={`/inventory/returns/new?lead=${leadId}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <PackageMinus className="h-4 w-4" /> Record return
            </Link>
          )}
        </div>
      )}

      {!current && (
        <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {current?.error && <p className="text-sm text-[var(--error)]">{current.error}</p>}

      {material && !hasMaterial && (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">No material has been dispatched to this customer yet.</p>
      )}

      {material && hasMaterial && (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">Material used</h3>
            <div className="divide-y divide-[var(--border-light)] rounded-xl border border-[var(--border)]">
              <div className="hidden grid-cols-[1fr_repeat(3,5.5rem)] gap-2 px-3 py-2 text-xs font-semibold text-[var(--text-muted)] sm:grid">
                <span>Item</span>
                <span className="text-right">Dispatched</span>
                <span className="text-right">Returned</span>
                <span className="text-right">Used</span>
              </div>
              {material.items.map((i) => (
                <div key={i.item_id} className="px-3 py-2.5" data-testid="material-row">
                  <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_repeat(3,5.5rem)]">
                    <Link href={`/inventory/items/${i.item_id}`} className="min-w-0 truncate font-medium text-[var(--text-dark)] hover:underline">
                      {i.name}
                    </Link>
                    <span className="hidden text-right tabular-nums sm:block">{formatQty(i.dispatched, i.unit_type)}</span>
                    <span className="hidden text-right tabular-nums sm:block">{formatQty(i.returned, i.unit_type)}</span>
                    <span className="text-right font-semibold tabular-nums" data-testid="material-used">
                      {formatQty(i.used, i.unit_type)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] sm:hidden">
                    Sent {formatQty(i.dispatched, i.unit_type)} · Returned {formatQty(i.returned, i.unit_type)}
                  </p>
                  {(serialsByItem.get(i.item_id)?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {serialsByItem.get(i.item_id)?.map((s) => (
                        <Link
                          key={s}
                          href={`/inventory/serials?q=${encodeURIComponent(s)}`}
                          className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px] hover:underline"
                        >
                          {s}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">Timeline</h3>
            <ol className="space-y-2.5 border-l-2 border-[var(--border)] pl-4">
              {material.timeline.map((m) => (
                <li key={m.id} className={cn(m.reversed && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={m.movement_type === "return" ? "received" : m.movement_type === "dispatch" ? "contacted" : undefined}>
                      {MOVEMENT_TYPE_LABELS[m.movement_type]}
                    </Badge>
                    <Link href={`/inventory/movements/${m.id}`} className="font-mono text-xs font-semibold text-[var(--primary)] hover:underline">
                      {m.movement_no}
                    </Link>
                    {m.defective && <Badge variant="warn">Defective</Badge>}
                    {m.reversed && <Badge variant="lost">Reversed</Badge>}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDate(m.movement_date)} · {m.line_count} item{m.line_count === 1 ? "" : "s"}
                    {m.serial_count > 0 && ` · ${m.serial_count} SN`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
