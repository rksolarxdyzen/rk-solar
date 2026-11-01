import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { ReverseMovementButton } from "@/components/inventory/reverse-movement-button";
import { ShareChallanButton } from "@/components/inventory/share-challan-button";
import { getInventoryAccess, getInwardLineCosts } from "@/lib/inventory/queries";
import { getMovementDetail } from "@/lib/inventory/movements";
import { formatDate, formatInr, formatQty } from "@/lib/inventory/format";
import { MOVEMENT_TYPE_LABELS } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const m = await getMovementDetail(id);
  if (!m) notFound();
  const costs = ctx.access.canViewCost && m.movement_type === "inward" ? await getInwardLineCosts(m.lines.map((l) => l.id)) : null;
  const inwardValue = costs ? m.lines.reduce((sum, l) => sum + (costs.get(l.id)?.unit_cost ?? 0) * l.quantity_delta, 0) : 0;
  const costLabel = (lineId: string, qty: number) => {
    const c = costs?.get(lineId);
    if (!c) return "No cost entered";
    const gst = c.gst_percent != null ? ` + ${c.gst_percent}% GST` : "";
    return `Unit cost ${formatInr(c.unit_cost)}${gst} · ${formatInr(c.unit_cost * qty)}`;
  };

  const isChallan = m.movement_type === "dispatch";
  const isReturnChallan = m.movement_type === "return";
  const canPrintChallan = isChallan || isReturnChallan;
  const canReverse = ctx.access.canAdjust && m.movement_type !== "reversal" && !m.reversed_by_id;
  const typeLabel = m.is_opening_stock ? "Opening stock" : MOVEMENT_TYPE_LABELS[m.movement_type];
  const totalQty = m.lines.reduce((n, l) => n + Math.abs(l.quantity_delta), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader
        title={
          isChallan
            ? `Delivery challan ${m.movement_no}`
            : isReturnChallan
              ? `Return challan ${m.movement_no}`
              : `${typeLabel} ${m.movement_no}`
        }
        subtitle={formatDate(m.movement_date)}
        backHref="/inventory/movements"
        actions={false}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>{typeLabel}</Badge>
        {m.reversed_by_id && (
          <Link href={`/inventory/movements/${m.reversed_by_id}`}>
            <Badge variant="lost">Reversed by {m.reversed_by_no ?? "reversal"}</Badge>
          </Link>
        )}
        {m.reverses_id && (
          <Link href={`/inventory/movements/${m.reverses_id}`} className="text-sm font-medium text-[var(--primary)] hover:underline">
            Undoes {m.reverses_no ?? "entry"}
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {canPrintChallan && (
            <a
              href={`/api/inventory/challans/${m.id}/pdf`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              <FileDown className="h-4 w-4" /> {isReturnChallan ? "Return challan PDF" : "Challan PDF"}
            </a>
          )}
          {canPrintChallan && (
            <ShareChallanButton
              movementId={m.id}
              movementNo={m.movement_no}
              variant={isReturnChallan ? "return" : "delivery"}
            />
          )}
          {canReverse && <ReverseMovementButton movementId={m.id} movementNo={m.movement_no} />}
        </div>
      </div>

      <Card className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        {m.lead_id && (
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
              {isChallan ? "Deliver to" : isReturnChallan ? "Received from" : "Customer"}
            </p>
            <p className="font-semibold text-[var(--text-dark)]">{m.customer?.name ?? "Customer"}</p>
            {m.customer?.phone && <p>{m.customer.phone}</p>}
            {(m.customer?.address || m.customer?.city) && <p className="text-[var(--text-muted)]">{m.customer.address || m.customer.city}</p>}
            {m.customer?.meter_name && <p className="text-[var(--text-muted)]">Meter: {m.customer.meter_name}</p>}
          </div>
        )}
        {m.party_id && (
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
              {isChallan ? "Deliver to" : isReturnChallan ? "Received from" : "Party"}
            </p>
            <p className="font-semibold text-[var(--text-dark)]">{m.party?.name ?? "Party"}</p>
            {m.party?.kind && <p className="capitalize text-[var(--text-muted)]">{m.party.kind}</p>}
            {m.party?.phone && <p>{m.party.phone}</p>}
            {(m.party?.address || m.party?.city) && (
              <p className="text-[var(--text-muted)]">{m.party.address || m.party.city}</p>
            )}
            {m.party?.gstin && <p className="text-[var(--text-muted)]">GSTIN: {m.party.gstin}</p>}
          </div>
        )}
        {m.movement_type === "inward" && (
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Supplier</p>
            <p className="font-semibold text-[var(--text-dark)]">{m.supplier_name ?? (m.is_opening_stock ? "Opening stock" : "—")}</p>
            {m.supplier_invoice_no && (
              <p>
                Invoice {m.supplier_invoice_no}
                {m.supplier_invoice_date && ` · ${formatDate(m.supplier_invoice_date)}`}
              </p>
            )}
          </div>
        )}
        <div className="space-y-0.5">
          {m.vehicle_no && <p>Vehicle: <span className="font-medium">{m.vehicle_no}</span></p>}
          {m.delivered_by && <p>Delivered by: <span className="font-medium">{m.delivered_by}</span></p>}
          {m.reason && <p>Reason: <span className="font-medium">{m.reason}</span></p>}
          {m.by_name && <p className="text-[var(--text-muted)]">Entered by {m.by_name}</p>}
        </div>
      </Card>

      {m.notes?.trim() && (
        <Card className="mb-4 space-y-1 border-[var(--primary)]/20 bg-[var(--primary-faint)]">
          <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            {isChallan || isReturnChallan ? "Remarks" : "Notes"}
          </p>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-dark)]">{m.notes.trim()}</p>
        </Card>
      )}

      <Card className="divide-y divide-[var(--border-light)] p-0">
        {m.lines.map((l, idx) => (
          <div key={l.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/inventory/items/${l.item_id}`} className="font-semibold text-[var(--text-dark)] hover:underline">
                  {idx + 1}. {l.item_name}
                </Link>
                <p className="text-xs text-[var(--text-muted)]">
                  {[l.sku, l.hsn && `HSN ${l.hsn}`, l.return_condition, l.serial_action].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span className={`shrink-0 font-semibold tabular-nums ${l.quantity_delta < 0 ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
                {l.quantity_delta > 0 ? "+" : "−"}
                {formatQty(Math.abs(l.quantity_delta), l.unit_type)}
              </span>
            </div>
            {l.serials.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="movement-serials">
                {l.serials.map((s) => (
                  <span key={s} className="rounded bg-[var(--bg)] px-2 py-0.5 font-mono text-xs">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {costs && (
              <p className="text-xs text-[var(--text-muted)]" data-testid="inward-line-cost">
                {costLabel(l.id, l.quantity_delta)}
              </p>
            )}
            {l.notes && <p className="text-xs text-[var(--text-muted)]">{l.notes}</p>}
          </div>
        ))}
        <div className="flex justify-between px-4 py-3 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{totalQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</span>
        </div>
        {costs && (
          <div className="flex justify-between px-4 py-3 text-sm font-semibold">
            <span>Purchase value (before GST)</span>
            <span className="tabular-nums">{formatInr(inwardValue)}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
