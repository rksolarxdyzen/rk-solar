"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { loadCustomerMaterial, loadPartyMaterial, postReturn } from "@/actions/inventory";
import { ItemPicker } from "@/components/inventory/item-picker";
import { CustomerPicker } from "@/components/inventory/customer-picker";
import { PartyPicker } from "@/components/inventory/party-picker";
import { entriesToSerials, type ScanEntry } from "@/components/inventory/serial-scan-input";
import { ReturnSerialPicker } from "@/components/inventory/return-serial-picker";
import { formatQty } from "@/lib/inventory/format";
import {
  INVENTORY_PARTY_KIND_LABELS,
  INVENTORY_UNIT_LABELS,
  type InventoryParty,
  type ReturnCondition,
} from "@/lib/inventory/types";
import type { PickerItem } from "@/lib/inventory/queries";
import type { CustomerMaterial, InventoryCustomer } from "@/lib/inventory/movements";

interface Line {
  key: string;
  item: PickerItem;
  quantity: string;
  entries: ScanEntry[];
  condition: ReturnCondition;
}

type DestMode = "customer" | "party";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const PANEL_OR_INVERTER = /^(panel|inverter)s?$/i;

function isPanelOrInverter(item: { category_name: string | null; master_group_name: string | null; name: string }) {
  const labels = [item.category_name, item.master_group_name, ...item.name.split("›")];
  return labels.some((label) => PANEL_OR_INVERTER.test((label ?? "").trim()));
}

function toPickerItems(material: CustomerMaterial | null): PickerItem[] {
  return (material?.items ?? [])
    .filter((i) => i.used > 0)
    .map((i) => ({
      id: i.item_id,
      name: i.name,
      sku: i.sku,
      unit_type: i.unit_type,
      track_serials: i.track_serials || isPanelOrInverter(i),
      serial_mode: i.serial_mode,
      serial_pattern: i.serial_pattern,
      on_hand: i.used,
      category_name: i.category_name,
    }));
}

export function ReturnForm({
  initialCustomer,
  initialMaterial,
}: {
  initialCustomer: InventoryCustomer | null;
  initialMaterial: CustomerMaterial | null;
}) {
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [destMode, setDestMode] = useState<DestMode>(initialCustomer ? "customer" : "customer");
  const [customer, setCustomer] = useState<InventoryCustomer | null>(initialCustomer);
  const [party, setParty] = useState<InventoryParty | null>(null);
  const [material, setMaterial] = useState<CustomerMaterial | null>(initialMaterial);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; no: string; units: number; label: string } | null>(null);

  const items = useMemo(() => toPickerItems(material), [material]);
  const hasDest = destMode === "customer" ? Boolean(customer) : Boolean(party);
  const destLabel =
    destMode === "customer"
      ? customer?.name
      : party
        ? `${party.name} · ${INVENTORY_PARTY_KIND_LABELS[party.kind]}`
        : null;
  const siteWord = destMode === "party" ? "party" : "customer";

  const problems = useMemo(() => {
    const bulkTotals = new Map<string, number>();
    for (const l of lines) {
      if (!l.item.track_serials) bulkTotals.set(l.item.id, (bulkTotals.get(l.item.id) ?? 0) + (Number(l.quantity) || 0));
    }
    return lines.map((l): string | null => {
      if (l.item.track_serials) {
        if (!l.entries.some((e) => e.status === "ok")) {
          return "Select at least one serial that was sent to this site";
        }
        if (l.entries.some((e) => e.status !== "ok")) return "Fix or remove the flagged serials";
        return null;
      }
      const q = Number(l.quantity);
      if (!l.quantity || !(q > 0)) return "Enter a quantity";
      if (l.item.unit_type === "nos" && !Number.isInteger(q)) return "Nos must be a whole number";
      if ((bulkTotals.get(l.item.id) ?? 0) > l.item.on_hand) {
        return `Only ${formatQty(l.item.on_hand, l.item.unit_type)} is at this ${siteWord}`;
      }
      return null;
    });
  }, [lines, siteWord]);

  const canSave = hasDest && lines.length > 0 && problems.every((p) => p === null) && !pending;
  const serialCount = lines.reduce((n, l) => n + l.entries.filter((e) => e.status === "ok").length, 0);

  function patch(key: string, fields: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...fields } : l)));
  }

  function addItem(item: PickerItem) {
    const key = `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLines((prev) => [...prev, { key, item, quantity: "", entries: [], condition: "good" }]);
    setActiveKey(key);
  }

  function setMode(mode: DestMode) {
    if (mode === destMode) return;
    setDestMode(mode);
    setCustomer(null);
    setParty(null);
    setMaterial(null);
    setLines([]);
    setError(null);
  }

  function chooseCustomer(c: InventoryCustomer) {
    setCustomer(c);
    setParty(null);
    setLines([]);
    setMaterial(null);
    setError(null);
    setLoadingMaterial(true);
    startTransition(async () => {
      const res = await loadCustomerMaterial(c.id);
      setLoadingMaterial(false);
      if (!res.ok) return setError(res.error);
      setMaterial(res.material);
    });
  }

  function chooseParty(p: InventoryParty) {
    setParty(p);
    setCustomer(null);
    setLines([]);
    setMaterial(null);
    setError(null);
    setLoadingMaterial(true);
    startTransition(async () => {
      const res = await loadPartyMaterial(p.id);
      setLoadingMaterial(false);
      if (!res.ok) return setError(res.error);
      setMaterial(res.material);
    });
  }

  function reset() {
    setLines([]);
    setNotes("");
    setDate(today());
    setDone(null);
    if (destMode === "customer" && customer) chooseCustomer(customer);
    else if (destMode === "party" && party) chooseParty(party);
  }

  function save() {
    if (destMode === "customer" && !customer) return;
    if (destMode === "party" && !party) return;
    setError(null);
    const payload = {
      ...(destMode === "customer" ? { lead_id: customer!.id } : { party_id: party!.id }),
      movement_date: date || undefined,
      notes,
      lines: lines.map((l) => ({
        item_id: l.item.id,
        condition: l.condition,
        ...(l.item.track_serials ? { serials: entriesToSerials(l.entries) } : { quantity: Number(l.quantity) }),
      })),
    };
    startTransition(async () => {
      const res = await postReturn(payload);
      if (!res.ok) return setError(res.error);
      setDone({ id: res.movement.id, no: res.movement.movement_no, units: serialCount, label: destLabel ?? "" });
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--success)]" />
        <div>
          <p className="text-lg font-bold">Return saved</p>
          <p className="font-mono text-sm text-[var(--text-muted)]">{done.no}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {done.label}
            {done.units > 0 && ` · ${done.units} serial numbers`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            href={`/inventory/movements/${done.id}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            <FileText className="h-4 w-4" /> View return
          </Link>
          <a
            href={`/api/inventory/challans/${done.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
          >
            View return challan PDF
          </a>
          <Button variant="secondary" onClick={reset} className="min-h-[44px]">
            New return
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:pb-4">
      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">{error}</div>
      )}

      <Card className="space-y-3">
        <div role="tablist" aria-label="Return from" className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {(
            [
              { id: "customer" as const, label: "Customer" },
              { id: "party" as const, label: "Company / Dealer / Vendor" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={destMode === tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                "min-h-[40px] rounded-md px-3 text-sm font-semibold",
                destMode === tab.id ? "bg-[var(--primary)] text-white" : "text-[var(--text-muted)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {destMode === "customer" ? (
            customer ? (
              <div className="flex min-w-0 items-start gap-3">
                <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-dark)]" data-testid="return-customer">
                    {customer.name}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {[customer.phone, customer.address || customer.city].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Choose the customer returning material.</p>
            )
          ) : party ? (
            <div className="flex min-w-0 items-start gap-3">
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-dark)]" data-testid="return-party">
                  {party.name}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {[
                    INVENTORY_PARTY_KIND_LABELS[party.kind],
                    party.phone,
                    party.city,
                    party.gstin ? `GSTIN ${party.gstin}` : null,
                    party.address,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Choose the company, dealer, or vendor returning material.</p>
          )}
          <Button
            type="button"
            variant={hasDest ? "secondary" : "primary"}
            className="min-h-[44px]"
            onClick={() => (destMode === "customer" ? setCustomerOpen(true) : setPartyOpen(true))}
          >
            {destMode === "customer"
              ? customer
                ? "Change customer"
                : "Choose customer"
              : party
                ? "Change party"
                : "Choose party"}
          </Button>
        </div>
        {loadingMaterial && (
          <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading material at this {siteWord}…
          </p>
        )}
        {hasDest && material && items.length === 0 && (
          <p className="text-sm text-[var(--warn)]">Nothing is at this {siteWord}, so there is nothing to return.</p>
        )}
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rt-date">Return date</Label>
          <Input id="rt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px]" />
        </div>
        <div>
          <Label htmlFor="rt-notes">Notes</Label>
          <Textarea id="rt-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[44px]" />
        </div>
      </Card>

      {lines.map((line, idx) => {
        const active = line.key === activeKey;
        const problem = problems[idx];
        return (
          <Card key={line.key} className={cn("space-y-3", active && "border-[var(--primary)]")}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setActiveKey(line.key)}>
                <p className="truncate font-semibold text-[var(--text-dark)]">{line.item.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  At {siteWord} {formatQty(line.item.on_hand, line.item.unit_type)}
                  {line.item.track_serials && (
                    <>
                      {" · "}
                      <Badge>Serial required</Badge>
                    </>
                  )}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                aria-label={`Remove ${line.item.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div role="radiogroup" aria-label={`Condition of ${line.item.name}`} className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
              {(["good", "defective"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={line.condition === c}
                  onClick={() => patch(line.key, { condition: c })}
                  className={cn(
                    "min-h-[40px] rounded-md px-4 text-sm font-semibold",
                    line.condition === c
                      ? c === "good"
                        ? "bg-[var(--success)] text-white"
                        : "bg-[var(--warn)] text-white"
                      : "text-[var(--text-muted)]"
                  )}
                >
                  {c === "good" ? "Good — back to stock" : "Defective"}
                </button>
              ))}
            </div>

            {line.item.track_serials ? (
              active ? (
                <ReturnSerialPicker
                  itemId={line.item.id}
                  siteSerials={material?.serials ?? []}
                  takenByOtherLines={new Set(
                    lines
                      .filter((other) => other.key !== line.key && other.item.id === line.item.id)
                      .flatMap((other) =>
                        other.entries.filter((e) => e.status === "ok" && e.serial).map((e) => e.serial as string)
                      )
                  )}
                  scanMode={line.item.serial_mode}
                  serialPattern={line.item.serial_pattern}
                  leadId={customer?.id ?? null}
                  partyId={party?.id ?? null}
                  entries={line.entries}
                  onChange={(entries) => patch(line.key, { entries })}
                  siteWord={siteWord}
                />
              ) : (
                <button type="button" onClick={() => setActiveKey(line.key)} className="text-sm font-medium text-[var(--primary)]">
                  {line.entries.filter((e) => e.status === "ok").length === 0
                    ? "Select serials that were sent to this site"
                    : `${line.entries.filter((e) => e.status === "ok").length} serials selected — tap to change`}
                </button>
              )
            ) : (
              <div className="max-w-[12rem]">
                <Label htmlFor={`qty-${line.key}`}>Quantity ({INVENTORY_UNIT_LABELS[line.item.unit_type]})</Label>
                <Input
                  id={`qty-${line.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={line.item.unit_type === "nos" ? 1 : "any"}
                  value={line.quantity}
                  onChange={(e) => patch(line.key, { quantity: e.target.value })}
                  className="min-h-[44px] text-base"
                />
              </div>
            )}

            {line.condition === "defective" && (
              <p className="text-xs text-[var(--text-muted)]">Defective units are recorded but not counted as stock.</p>
            )}
            {problem && <p className="text-xs font-medium text-[var(--warn)]">{problem}</p>}
          </Card>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        className="min-h-[48px] w-full"
        onClick={() => setPickerOpen(true)}
        disabled={!hasDest || items.length === 0}
      >
        <Plus className="h-4 w-4" /> Add item
      </Button>

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-white p-3 md:sticky md:bottom-0 md:rounded-lg md:border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            {destLabel ?? "No destination"} · {lines.length} item{lines.length === 1 ? "" : "s"}
            {serialCount > 0 && ` · ${serialCount} serials`}
          </p>
          <Button onClick={save} disabled={!canSave} className="min-h-[48px] px-6">
            {pending && !loadingMaterial ? "Saving…" : "Save return"}
          </Button>
        </div>
      </div>

      <ItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} items={items} onPick={addItem} qtyPrefix="At site" />
      <CustomerPicker open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={chooseCustomer} />
      <PartyPicker open={partyOpen} onClose={() => setPartyOpen(false)} onPick={chooseParty} />
    </div>
  );
}
