"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { postInward } from "@/actions/inventory";
import { ItemPicker } from "@/components/inventory/item-picker";
import { SerialScanInput, entriesToSerials, type ScanEntry } from "@/components/inventory/serial-scan-input";
import { INVENTORY_UNIT_LABELS } from "@/lib/inventory/types";
import type { PickerItem } from "@/lib/inventory/queries";

interface Line {
  key: string;
  item: PickerItem;
  quantity: string;
  expected: string;
  entries: ScanEntry[];
  unitCost: string;
  gst: string;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function lineProblem(line: Line): string | null {
  if (line.item.track_serials) {
    const ok = line.entries.filter((e) => e.status === "ok").length;
    if (ok === 0) return "Scan at least one serial";
    if (line.entries.some((e) => e.status !== "ok")) return "Fix or remove the flagged serials";
    if (line.expected && Number(line.expected) !== ok) return `Expected ${line.expected}, scanned ${ok}`;
    return null;
  }
  const q = Number(line.quantity);
  if (!line.quantity || !(q > 0)) return "Enter a quantity";
  if (line.item.unit_type === "nos" && !Number.isInteger(q)) return "Nos must be a whole number";
  return null;
}

export function InwardForm({ items, canManageCost }: { items: PickerItem[]; canManageCost: boolean }) {
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ no: string; units: number } | null>(null);

  const problems = useMemo(() => lines.map(lineProblem), [lines]);
  const canSave = lines.length > 0 && problems.every((p) => p === null) && !pending;
  const serialCount = lines.reduce((n, l) => n + l.entries.filter((e) => e.status === "ok").length, 0);

  function patch(key: string, fields: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...fields } : l)));
  }

  function addItem(item: PickerItem) {
    const key = `${item.id}-${Date.now()}`;
    const unitCost =
      canManageCost && item.default_unit_cost != null ? String(item.default_unit_cost) : "";
    const gst =
      canManageCost && item.default_gst_percent != null ? String(item.default_gst_percent) : "";
    setLines((prev) => [...prev, { key, item, quantity: "", expected: "", entries: [], unitCost, gst }]);
    setActiveKey(key);
  }

  function reset() {
    setLines([]);
    setSupplier("");
    setInvoiceNo("");
    setInvoiceDate("");
    setNotes("");
    setOpening(false);
    setDate(today());
    setDone(null);
  }

  function save() {
    setError(null);
    const payload = {
      movement_date: date || undefined,
      supplier_name: supplier,
      supplier_invoice_no: invoiceNo,
      supplier_invoice_date: invoiceDate || undefined,
      notes,
      is_opening_stock: opening,
      lines: lines.map((l) => ({
        item_id: l.item.id,
        ...(l.item.track_serials ? { serials: entriesToSerials(l.entries) } : { quantity: Number(l.quantity) }),
        ...(canManageCost && l.unitCost !== "" ? { unit_cost: Number(l.unitCost) } : {}),
        ...(canManageCost && l.gst !== "" ? { gst_percent: Number(l.gst) } : {}),
      })),
    };
    startTransition(async () => {
      const res = await postInward(payload);
      if (!res.ok) return setError(res.error);
      setDone({ no: res.movement.movement_no, units: serialCount });
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--success)]" />
        <div>
          <p className="text-lg font-bold">Inward saved</p>
          <p className="font-mono text-sm text-[var(--text-muted)]">{done.no}</p>
          {done.units > 0 && <p className="text-sm text-[var(--text-muted)]">{done.units} serial numbers added</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>New inward</Button>
          <Link href="/inventory" className="inline-flex min-h-[40px] items-center justify-center rounded-lg border-[1.5px] border-[var(--border)] px-4 text-sm font-semibold">
            Back to stock
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:pb-4">
      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">{error}</div>
      )}

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="in-supplier">Supplier</Label>
          <Input id="in-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="min-h-[44px]" disabled={opening} />
        </div>
        <div>
          <Label htmlFor="in-inv">Invoice no.</Label>
          <Input id="in-inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="min-h-[44px]" disabled={opening} />
        </div>
        <div>
          <Label htmlFor="in-invdate">Invoice date</Label>
          <Input id="in-invdate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="min-h-[44px]" disabled={opening} />
        </div>
        <div>
          <Label htmlFor="in-date">Received on</Label>
          <Input id="in-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px]" />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm font-medium">
          <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} className="h-5 w-5" />
          Opening stock (already in store)
        </label>
        <div className="sm:col-span-2">
          <Label htmlFor="in-notes">Notes</Label>
          <Textarea id="in-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[44px]" />
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
                  {line.item.category_name ?? "—"} · {INVENTORY_UNIT_LABELS[line.item.unit_type]}
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
                    checkMode="inward"
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

            {canManageCost && (
              <div className="grid max-w-md grid-cols-2 gap-2">
                <div>
                  <Label htmlFor={`cost-${line.key}`}>Unit cost ₹</Label>
                  <Input
                    id={`cost-${line.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => patch(line.key, { unitCost: e.target.value })}
                    className="min-h-[40px]"
                  />
                </div>
                <div>
                  <Label htmlFor={`gst-${line.key}`}>GST %</Label>
                  <Input
                    id={`gst-${line.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    value={line.gst}
                    onChange={(e) => patch(line.key, { gst: e.target.value })}
                    className="min-h-[40px]"
                    placeholder="from item"
                  />
                  {line.unitCost !== "" && line.gst !== "" && Number.isFinite(Number(line.unitCost)) && Number.isFinite(Number(line.gst)) && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Inc. GST ≈ ₹
                      {(Math.round(Number(line.unitCost) * (1 + Number(line.gst) / 100) * 100) / 100).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
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
            {lines.length} item{lines.length === 1 ? "" : "s"}
            {serialCount > 0 && ` · ${serialCount} serials`}
          </p>
          <Button onClick={save} disabled={!canSave} className="min-h-[48px] px-6">
            {pending ? "Saving…" : opening ? "Save opening stock" : "Save inward"}
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
    </div>
  );
}
