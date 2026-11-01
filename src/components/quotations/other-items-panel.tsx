"use client";

import { useMemo, useState } from "react";
import type { CatalogItem } from "@/lib/quotations/catalog-items";
import { catalogItemToLine, filterOtherItems, otherItemOptionLabel } from "@/lib/quotations/catalog-items";
import type { QuoteItemInput } from "@/lib/quotations/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calcLineTotal } from "@/lib/quotations/quote-math";
import { inr } from "@/lib/quotations/format";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700">{children}</label>;
}

const emptyCustom = (): QuoteItemInput => ({
  itemName: "",
  brand: "",
  model: "",
  quantity: 1,
  unit: "pcs",
  rate: 0,
  gstPercent: 18,
  discountValue: 0,
});

export function OtherItemsPanel({
  catalog,
  items,
  onChange,
  showPricing = true,
  canEditPricing = false,
}: {
  catalog: CatalogItem[];
  items: QuoteItemInput[];
  onChange: (items: QuoteItemInput[]) => void;
  showPricing?: boolean;
  canEditPricing?: boolean;
}) {
  const otherCatalog = useMemo(() => filterOtherItems(catalog), [catalog]);
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(emptyCustom);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return otherCatalog
      .filter((item) =>
        `${item.item_name} ${item.model ?? ""} ${item.brand ?? ""} ${item.category ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
  }, [otherCatalog, query]);

  function addFromCatalog(item: CatalogItem) {
    onChange([...items, catalogItemToLine(item, 1)]);
    setQuery("");
  }

  function addCustom() {
    if (!custom.itemName.trim()) return;
    onChange([...items, { ...custom, itemName: custom.itemName.trim() }]);
    setCustom(emptyCustom());
    setCustomOpen(false);
  }

  function updateItem(index: number, patch: Partial<QuoteItemInput>) {
    onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Add structure, cables, ACDB, earthing, or any accessory from item master — or enter a one-off custom line.
      </p>

      <div>
        <FieldLabel>Search item master</FieldLabel>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cables, structure, ACDB, accessories…"
          className="min-h-11"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
            {searchResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addFromCatalog(item)}
                className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-slate-100"
              >
                <span className="min-w-0 truncate">{otherItemOptionLabel(item)}</span>
                {showPricing && (
                  <span className="shrink-0 text-xs font-semibold text-brand-700">{inr(Number(item.base_rate))}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {query.trim() && searchResults.length === 0 && (
          <p className="mt-1.5 text-xs text-slate-400">No matching items — use quick add below or add a custom line.</p>
        )}
      </div>

      {otherCatalog.length > 0 && (
        <div>
          <FieldLabel>Quick add from catalog</FieldLabel>
          <select
            className={selectClass}
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const item = otherCatalog.find((c) => c.id === id);
              if (item) addFromCatalog(item);
              e.target.value = "";
            }}
          >
            <option value="">Choose structure, cable, or accessory…</option>
            {otherCatalog.map((item) => (
              <option key={item.id} value={item.id}>
                {otherItemOptionLabel(item)}
                {showPricing ? ` — ${inr(Number(item.base_rate))}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {otherCatalog.length === 0 && (
        <p className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-800">
          No &quot;other&quot; items in item master yet. Add them under Catalog → Other Items, or use a custom line below.
        </p>
      )}

      {!customOpen ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 w-full sm:w-auto"
          onClick={() => setCustomOpen(true)}
        >
          + Add custom item
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-medium text-slate-800">Custom line item</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>Item name *</FieldLabel>
              <Input
                value={custom.itemName}
                onChange={(e) => setCustom({ ...custom, itemName: e.target.value })}
                placeholder="e.g. Custom mounting kit"
                className="min-h-11"
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>Qty</FieldLabel>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={custom.quantity || ""}
                onChange={(e) => setCustom({ ...custom, quantity: Number(e.target.value) || 1 })}
                className="min-h-11"
              />
            </div>
            <div>
              <FieldLabel>Unit</FieldLabel>
              <Input
                value={custom.unit}
                onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
                placeholder="pcs"
                className="min-h-11"
              />
            </div>
            {showPricing && canEditPricing && (
              <>
                <div>
                  <FieldLabel>Rate (₹)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={custom.rate || ""}
                    onChange={(e) => setCustom({ ...custom, rate: Number(e.target.value) || 0 })}
                    className="min-h-11"
                  />
                </div>
                <div>
                  <FieldLabel>GST %</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={custom.gstPercent}
                    onChange={(e) => setCustom({ ...custom, gstPercent: Number(e.target.value) || 0 })}
                    className="min-h-11"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={addCustom} disabled={!custom.itemName.trim()} className="min-h-10">
              Add to quote
            </Button>
            <button
              type="button"
              onClick={() => {
                setCustomOpen(false);
                setCustom(emptyCustom());
              }}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Added ({items.length})
          </p>
          {items.map((row, index) => {
            const lineTotal = showPricing ? calcLineTotal(row) : 0;
            return (
              <div
                key={`${row.itemId ?? "custom"}-${index}-${row.itemName}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{row.itemName}</p>
                    {(row.brand || row.model) && (
                      <p className="text-xs text-slate-500">
                        {[row.brand, row.model].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {showPricing && (
                    <p className="shrink-0 font-semibold text-brand-700">{inr(lineTotal)}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${row.itemName}`}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="mb-0.5 block text-[11px] text-slate-400">Qty</label>
                    <Input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 1 })}
                      className="min-h-9 text-sm"
                    />
                  </div>
                  {showPricing && canEditPricing && (
                    <>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-400">Rate</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.rate}
                          onChange={(e) => updateItem(index, { rate: Number(e.target.value) || 0 })}
                          className="min-h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-400">GST %</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={row.gstPercent}
                          onChange={(e) => updateItem(index, { gstPercent: Number(e.target.value) || 0 })}
                          className="min-h-9 text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
