"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileDown, FileText, Plus, Trash2, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDispatchSuggestion, postDispatch } from "@/actions/inventory";
import { ItemPicker } from "@/components/inventory/item-picker";
import { CustomerPicker } from "@/components/inventory/customer-picker";
import { PartyPicker } from "@/components/inventory/party-picker";
import { SerialScanInput, entriesToSerials, type ScanEntry } from "@/components/inventory/serial-scan-input";
import { formatQty } from "@/lib/inventory/format";
import { INVENTORY_PARTY_KIND_LABELS, INVENTORY_UNIT_LABELS, type InventoryParty } from "@/lib/inventory/types";
import type { PickerItem } from "@/lib/inventory/queries";
import type { InventoryCustomer } from "@/lib/inventory/movements";

type DestMode = "customer" | "party";

interface Line {
  key: string;
  item: PickerItem;
  quantity: string;
  expected: string;
  entries: ScanEntry[];
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function lineProblem(line: Line): string | null {
  if (line.item.track_serials) {
    const ok = line.entries.filter((e) => e.status === "ok").length;
    if (ok === 0) return "Scan the serial number of every unit";
    if (line.entries.some((e) => e.status !== "ok")) return "Fix or remove the flagged serials";
    if (line.expected && Number(line.expected) !== ok) return `Expected ${line.expected}, scanned ${ok}`;
    return null;
  }
  const q = Number(line.quantity);
  if (!line.quantity || !(q > 0)) return "Enter a quantity";
  if (line.item.unit_type === "nos" && !Number.isInteger(q)) return "Nos must be a whole number";
  if (q > line.item.on_hand) return `Only ${formatQty(line.item.on_hand, line.item.unit_type)} in stock`;
  return null;
}

export function DispatchForm({
  items,
  initialCustomer,
}: {
  items: PickerItem[];
  initialCustomer: InventoryCustomer | null;
}) {
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [destMode, setDestMode] = useState<DestMode>(initialCustomer ? "customer" : "customer");
  const [customer, setCustomer] = useState<InventoryCustomer | null>(initialCustomer);
  const [party, setParty] = useState<InventoryParty | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [done, setDone] = useState<{ id: string; no: string; units: number } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const problems = useMemo(() => lines.map(lineProblem), [lines]);
  const destination = destMode === "customer" ? customer : party;
  const canSave = Boolean(destination) && lines.length > 0 && problems.every((p) => p === null) && !pending;
  const serialCount = lines.reduce((n, l) => n + l.entries.filter((e) => e.status === "ok").length, 0);

  function switchMode(mode: DestMode) {
    setDestMode(mode);
    setInfo(null);
    setError(null);
    if (mode === "customer") setParty(null);
    else setCustomer(null);
  }

  function patch(key: string, fields: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...fields } : l)));
  }

  function newLine(item: PickerItem, qty?: number): Line {
    return {
      key: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item,
      quantity: !item.track_serials && qty ? String(qty) : "",
      expected: item.track_serials && qty ? String(qty) : "",
      entries: [],
    };
  }

  function addItem(item: PickerItem) {
    const line = newLine(item);
    setLines((prev) => [...prev, line]);
    setActiveKey(line.key);
  }

  function prefillFromQuotation() {
    if (!customer) return;
    setError(null);
    setInfo(null);
    setLoadingQuote(true);
    startTransition(async () => {
      const res = await getDispatchSuggestion(customer.id);
      setLoadingQuote(false);
      if (!res.ok) return setError(res.error);
      if (!res.suggestion) return setInfo("No quotation found for this customer.");

      const existing = new Set(lines.map((l) => l.item.id));
      const qtyByItem = new Map<string, number>();
      const unmatched: string[] = [];
      for (const s of res.suggestion.lines) {
        const item = s.item_id ? itemById.get(s.item_id) : undefined;
        if (!item) {
          unmatched.push(s.source_name);
          continue;
        }
        if (existing.has(item.id)) continue;
        qtyByItem.set(item.id, (qtyByItem.get(item.id) ?? 0) + s.quantity);
      }
      const added = [...qtyByItem].map(([id, qty]) => newLine(itemById.get(id) as PickerItem, qty));
      if (added.length) {
        setLines((prev) => [...prev, ...added]);
        setActiveKey(added[0].key);
      }
      const parts = [`${added.length} item${added.length === 1 ? "" : "s"} added from ${res.suggestion.quotation_no}.`];
      if (unmatched.length) parts.push(`Not in inventory: ${unmatched.join(", ")}.`);
      setInfo(parts.join(" "));
    });
  }

  function reset() {
    setLines([]);
    setVehicle("");
    setDeliveredBy("");
    setNotes("");
    setDate(today());
    setInfo(null);
    setDone(null);
  }

  function save() {
    if (!destination) return;
    setError(null);
    const payload = {
      lead_id: destMode === "customer" ? customer!.id : null,
      party_id: destMode === "party" ? party!.id : null,
      movement_date: date || undefined,
      vehicle_no: vehicle,
      delivered_by: deliveredBy,
      notes,
      lines: lines.map((l) => ({
        item_id: l.item.id,
        ...(l.item.track_serials ? { serials: entriesToSerials(l.entries) } : { quantity: Number(l.quantity) }),
      })),
    };
    startTransition(async () => {
      const res = await postDispatch(payload);
      if (!res.ok) return setError(res.error);
      setDone({ id: res.movement.id, no: res.movement.movement_no, units: serialCount });
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--success)]" />
        <div>
          <p className="text-lg font-bold">Dispatch saved</p>
          <p className="font-mono text-sm text-[var(--text-muted)]">Challan {done.no}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {destination?.name}
            {done.units > 0 && ` · ${done.units} serial numbers`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <a
            href={`/api/inventory/challans/${done.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            <FileDown className="h-4 w-4" /> Challan PDF
          </a>
          <Link
            href={`/inventory/movements/${done.id}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] px-4 text-sm font-semibold"
          >
            <FileText className="h-4 w-4" /> View challan
          </Link>
          <Button variant="secondary" onClick={reset} className="min-h-[44px]">
            New dispatch
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchMode("customer")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              destMode === "customer"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--bg)] text-[var(--text-body)] hover:bg-[var(--border-light)]"
            )}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={() => switchMode("party")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              destMode === "party"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--bg)] text-[var(--text-body)] hover:bg-[var(--border-light)]"
            )}
          >
            Company / Dealer / Vendor
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {destination ? (
            <div className="flex min-w-0 items-start gap-3">
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-dark)]" data-testid="dispatch-customer">
                  {destination.name}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {destMode === "customer"
                    ? [customer!.phone, customer!.address || customer!.city].filter(Boolean).join(" · ") || "—"
                    : [
                        INVENTORY_PARTY_KIND_LABELS[party!.kind],
                        party!.phone,
                        party!.city,
                        party!.gstin ? `GSTIN ${party!.gstin}` : null,
                        party!.address,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {destMode === "customer"
                ? "Choose the customer this material goes to."
                : "Choose the company, dealer or vendor this material goes to."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={destination ? "secondary" : "primary"}
              className="min-h-[44px]"
              onClick={() => (destMode === "customer" ? setCustomerOpen(true) : setPartyOpen(true))}
            >
              {destination
                ? destMode === "customer"
                  ? "Change customer"
                  : "Change party"
                : destMode === "customer"
                  ? "Choose customer"
                  : "Choose party"}
            </Button>
            {destMode === "customer" && customer && (
              <Button type="button" variant="secondary" className="min-h-[44px]" onClick={prefillFromQuotation} disabled={loadingQuote}>
                {loadingQuote ? "Loading…" : "Pre-fill from quotation"}
              </Button>
            )}
          </div>
        </div>
        {info && <p className="text-xs text-[var(--text-muted)]">{info}</p>}
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="dc-date">Dispatch date</Label>
          <Input id="dc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px]" />
        </div>
        <div>
          <Label htmlFor="dc-vehicle">Vehicle no.</Label>
          <Input id="dc-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} className="min-h-[44px]" maxLength={40} />
        </div>
        <div>
          <Label htmlFor="dc-by">Delivered by</Label>
          <Input id="dc-by" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} className="min-h-[44px]" maxLength={120} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="dc-notes">Delivery / site notes</Label>
          <Textarea
            id="dc-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[72px]"
            placeholder="Gate timing, site contact, landmark, or other remarks for the challan"
            maxLength={1000}
          />
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
                  {line.item.category_name ?? "—"} · In stock {formatQty(line.item.on_hand, line.item.unit_type)}
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

            {line.item.track_serials ? (
              active ? (
                <>
                  <div className="max-w-[10rem]">
                    <Label htmlFor={`exp-${line.key}`}>Expected qty (optional)</Label>
                    <Input
                      id={`exp-${line.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={line.expected}
                      onChange={(e) => patch(line.key, { expected: e.target.value })}
                      className="min-h-[40px]"
                    />
                  </div>
                  <SerialScanInput
                    itemId={line.item.id}
                    scanMode={line.item.serial_mode}
                    serialPattern={line.item.serial_pattern}
                    checkMode="dispatch"
                    leadId={customer?.id ?? null}
                    partyId={party?.id ?? null}
                    entries={line.entries}
                    onChange={(entries) => patch(line.key, { entries })}
                    expected={line.expected ? Number(line.expected) : null}
                  />
                </>
              ) : (
                <button type="button" onClick={() => setActiveKey(line.key)} className="text-sm font-medium text-[var(--primary)]">
                  {line.entries.filter((e) => e.status === "ok").length} serials scanned — tap to scan more
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

            {problem && <p className="text-xs font-medium text-[var(--warn)]">{problem}</p>}
          </Card>
        );
      })}

      <Button type="button" variant="secondary" className="min-h-[48px] w-full" onClick={() => setPickerOpen(true)}>
        <Plus className="h-4 w-4" /> Add item
      </Button>

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-white p-3 md:sticky md:bottom-0 md:rounded-lg md:border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            {customer ? customer.name : "No customer"} · {lines.length} item{lines.length === 1 ? "" : "s"}
            {serialCount > 0 && ` · ${serialCount} serials`}
          </p>
          <Button onClick={save} disabled={!canSave} className="min-h-[48px] px-6">
            {pending && !loadingQuote ? "Saving…" : "Save dispatch"}
          </Button>
        </div>
      </div>

      <ItemPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={items}
        excludeIds={lines.map((l) => l.item.id)}
        onPick={addItem}
      />
      <CustomerPicker open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={setCustomer} />
      <PartyPicker open={partyOpen} onClose={() => setPartyOpen(false)} onPick={setParty} />
    </div>
  );
}
