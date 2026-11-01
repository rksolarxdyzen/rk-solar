"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { upsertQuotation } from "@/actions/quotations";
import {
  calcLineTotal,
  calcSimpleQuotationTotals,
  discountAmountFromPercent,
  discountPercentFromAmount,
} from "@/lib/quotations/quote-math";
import {
  QUOTE_TEMPLATE_LABELS,
  catalogItemMatchesTemplate,
  usesResidentialBomFields,
  type CatalogItem,
  type QuoteTemplateKind,
  type QuotationItemRow,
  type QuotationRow,
} from "@/lib/quotations/types";
import { formatCurrency } from "@/lib/utils";

type DraftLine = QuotationItemRow & { key: string };

function bomSortKey(model: string | null | undefined) {
  const match = model?.match(/(?:PREMIUM|REGULAR)-BOM-(\d+)/i);
  return match ? Number(match[1]) : 9999;
}

function toDraft(items: QuotationItemRow[]): DraftLine[] {
  return items.map((item, i) => ({
    ...item,
    key: item.id ?? `new-${i}`,
  }));
}

function catalogItemToDraft(item: CatalogItem, index: number): DraftLine {
  const brand = Array.isArray(item.brand) ? item.brand[0] : item.brand;
  const quantity = 1;
  const rate = Number(item.base_rate);
  const gstPercent = Number(item.gst_percent);
  return {
    key: `catalog-${item.id}`,
    item_id: item.id,
    sort_order: index,
    item_name_snapshot: item.item_name,
    brand_snapshot: brand?.name ?? null,
    model_snapshot: item.model,
    quantity,
    unit: item.unit,
    rate,
    gst_percent: gstPercent,
    discount_value: 0,
    image_url_snapshot: item.image_url ?? null,
    line_total: calcLineTotal({
      quantity,
      rate,
      gstPercent,
      discountValue: 0,
    }),
  };
}

function buildInitialLines(
  catalog: CatalogItem[],
  templateKind: QuoteTemplateKind,
  initial?: QuotationRow | null
): DraftLine[] {
  if (initial?.items?.length) return toDraft(initial.items);
  if (!usesResidentialBomFields(templateKind)) return [];

  return catalog
    .filter((item) => catalogItemMatchesTemplate(item, templateKind))
    .sort((a, b) => bomSortKey(a.model) - bomSortKey(b.model) || a.item_name.localeCompare(b.item_name))
    .map(catalogItemToDraft);
}

export function QuotationBuilderFormSimple({
  lead,
  customer,
  catalog,
  initial,
  defaultTemplate = "solar",
  canEditQuotationPricing = false,
  bomMaterialsOnly = false,
}: {
  /** @deprecated Prefer `customer` — kept for edit page compatibility. */
  lead?: {
    id: string;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    recommended_system_kw: number | null;
  };
  customer?: {
    id: string | null;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    recommended_system_kw: number | null;
  };
  catalog: CatalogItem[];
  initial?: QuotationRow | null;
  defaultTemplate?: QuoteTemplateKind;
  canEditQuotationPricing?: boolean;
  bomMaterialsOnly?: boolean;
}) {
  const emptyCustomer = {
    id: null as string | null,
    name: "",
    phone: "",
    address: null as string | null,
    city: null as string | null,
    recommended_system_kw: null as number | null,
  };
  const resolved =
    customer ??
    (lead ? { ...lead, id: lead.id as string | null } : emptyCustomer);

  const hideLinePricing = bomMaterialsOnly && !canEditQuotationPricing;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(resolved.name);
  const [customerPhone, setCustomerPhone] = useState(resolved.phone);
  const [customerCity, setCustomerCity] = useState(resolved.city ?? "");
  const [customerAddress, setCustomerAddress] = useState(resolved.address ?? "");
  const templateKind: QuoteTemplateKind = initial?.template_kind ?? defaultTemplate;
  const [systemSizeKw, setSystemSizeKw] = useState(
    String(initial?.system_size_kw ?? resolved.recommended_system_kw ?? "")
  );
  const [meterCharges, setMeterCharges] = useState(String(initial?.meter_charges ?? 0));
  const [subsidy, setSubsidy] = useState(String(initial?.subsidy ?? 0));
  const [discountPercent, setDiscountPercent] = useState(
    String(initial?.discount_percent ?? 0)
  );
  const [discountValue, setDiscountValue] = useState(
    String(
      Math.max(
        0,
        Number(initial?.discount_total ?? 0) -
          (initial?.items?.reduce((s, i) => s + Number(i.discount_value), 0) ?? 0)
      )
    )
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    buildInitialLines(catalog, templateKind, initial)
  );

  const filteredCatalog = useMemo(
    () =>
      catalog
        .filter((c) => catalogItemMatchesTemplate(c, templateKind))
        .sort((a, b) => bomSortKey(a.model) - bomSortKey(b.model) || a.item_name.localeCompare(b.item_name)),
    [catalog, templateKind]
  );

  const addableCatalog = useMemo(
    () => filteredCatalog.filter((item) => !lines.some((line) => line.item_id === item.id)),
    [filteredCatalog, lines]
  );

  const totals = useMemo(() => {
    return calcSimpleQuotationTotals({
      items: lines.map((l) => ({
        quantity: Number(l.quantity) || 0,
        rate: Number(l.rate) || 0,
        gstPercent: Number(l.gst_percent) || 0,
        discountValue: Number(l.discount_value) || 0,
      })),
      headerDiscountValue: Number(discountValue) || 0,
      headerDiscountPercent: Number(discountPercent) || 0,
      meterCharges: usesResidentialBomFields(templateKind) ? Number(meterCharges) || 0 : 0,
      subsidy: usesResidentialBomFields(templateKind) ? Number(subsidy) || 0 : 0,
    });
  }, [lines, discountValue, discountPercent, meterCharges, subsidy, templateKind]);

  function addCatalogItem(item: CatalogItem) {
    if (lines.some((line) => line.item_id === item.id)) return;
    const draft = catalogItemToDraft(item, lines.length);
    draft.key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLines((prev) => [...prev, draft]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        next.line_total = calcLineTotal({
          quantity: Number(next.quantity) || 0,
          rate: Number(next.rate) || 0,
          gstPercent: Number(next.gst_percent) || 0,
          discountValue: Number(next.discount_value) || 0,
        });
        return next;
      })
    );
  }

  function onDiscountPercentChange(value: string) {
    setDiscountPercent(value);
    const pct = Number(value) || 0;
    const taxable = calcItemTaxable(lines);
    setDiscountValue(String(discountAmountFromPercent(taxable, pct)));
  }

  function onDiscountValueChange(value: string) {
    setDiscountValue(value);
    const amount = Number(value) || 0;
    const taxable = calcItemTaxable(lines);
    setDiscountPercent(String(discountPercentFromAmount(taxable, amount)));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (lines.length === 0) {
          setError("Add at least one line item");
          return;
        }
        startTransition(async () => {
          try {
            const result = await upsertQuotation({
              id: initial?.id,
              leadId: resolved.id,
              customerName,
              customerPhone,
              customerCity: customerCity || null,
              customerAddress: customerAddress || null,
              templateKind,
              systemSizeKw:
                usesResidentialBomFields(templateKind) && systemSizeKw
                  ? Number(systemSizeKw)
                  : null,
              meterCharges: Number(meterCharges) || 0,
              subsidy: Number(subsidy) || 0,
              discountPercent: Number(discountPercent) || 0,
              discountValue: Number(discountValue) || 0,
              notes: notes || null,
              terms: terms || null,
              items: lines.map((l, idx) => ({
                item_id: l.item_id,
                item_name_snapshot: l.item_name_snapshot,
                brand_snapshot: l.brand_snapshot,
                model_snapshot: l.model_snapshot,
                quantity: Number(l.quantity),
                unit: l.unit,
                rate: Number(l.rate),
                gst_percent: Number(l.gst_percent),
                discount_value: Number(l.discount_value) || 0,
                sort_order: idx,
              })),
            });
            router.push(`/quotations/${result.id}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Customer
          </p>
          {resolved.id ? (
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--primary)]">
              Linked lead
            </span>
          ) : (
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Custom details
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Name *</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
              inputMode="tel"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={customerCity}
              onChange={(e) => setCustomerCity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Template</Label>
          <p className="rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-body)]">
            {QUOTE_TEMPLATE_LABELS[templateKind]}
          </p>
        </div>
        {usesResidentialBomFields(templateKind) && (
          <div>
            <Label>System size (kW)</Label>
            <Input
              type="number"
              step="0.1"
              value={systemSizeKw}
              onChange={(e) => setSystemSizeKw(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-dark)]">Line items</h3>
            {usesResidentialBomFields(templateKind) && !initial?.id ? (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {hideLinePricing
                  ? "Material list only — quantities can be adjusted. Pricing is set from the rate card."
                  : "Package materials are preloaded — enter rates, adjust qty, or remove items."}
              </p>
            ) : null}
          </div>
          <select
            className="max-w-xs rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            defaultValue=""
            onChange={(e) => {
              const item = addableCatalog.find((c) => c.id === e.target.value);
              if (item) addCatalogItem(item);
              e.target.value = "";
            }}
          >
            <option value="">Add from catalog…</option>
            {addableCatalog.length === 0 ? (
              <option value="" disabled>
                {filteredCatalog.length === 0
                  ? "No catalogue items for this template"
                  : "All catalogue items are already added"}
              </option>
            ) : null}
            {addableCatalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.item_name}
                {c.capacity_label ? ` (${c.capacity_label})` : ""} —{" "}
                {formatCurrency(Number(c.base_rate))}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">Qty</th>
                {!hideLinePricing ? (
                  <>
                    <th className="py-2 pr-2">Rate</th>
                    <th className="py-2 pr-2">GST%</th>
                    <th className="py-2 pr-2">Disc ₹</th>
                    <th className="py-2 pr-2">Total</th>
                  </>
                ) : null}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-[var(--border-light)]">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-[var(--text-dark)]">
                      {l.item_name_snapshot}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {[l.brand_snapshot, l.model_snapshot].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      className="w-20"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(l.key, { quantity: Number(e.target.value) })
                      }
                    />
                  </td>
                  {!hideLinePricing ? (
                    <>
                      <td className="py-2 pr-2">
                        <Input
                          className="w-28"
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.rate}
                          readOnly={!canEditQuotationPricing}
                          onChange={(e) => updateLine(l.key, { rate: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          className="w-20"
                          type="number"
                          min={0}
                          value={l.gst_percent}
                          readOnly={!canEditQuotationPricing}
                          onChange={(e) =>
                            updateLine(l.key, { gst_percent: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          className="w-24"
                          type="number"
                          min={0}
                          value={l.discount_value}
                          readOnly={!canEditQuotationPricing}
                          onChange={(e) =>
                            updateLine(l.key, { discount_value: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {formatCurrency(l.line_total)}
                      </td>
                    </>
                  ) : null}
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--error)]"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={hideLinePricing ? 2 : 7} className="py-6 text-center text-[var(--text-muted)]">
                    {usesResidentialBomFields(templateKind)
                      ? "No items — add from the catalogue or run the BOM seed SQL."
                      : "No lines yet — pick items from the catalog."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--text-dark)]">Discounts & extras</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Header discount %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => onDiscountPercentChange(e.target.value)}
              />
            </div>
            <div>
              <Label>Header discount ₹</Label>
              <Input
                type="number"
                min={0}
                value={discountValue}
                onChange={(e) => onDiscountValueChange(e.target.value)}
              />
            </div>
          </div>
          {usesResidentialBomFields(templateKind) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GEB/MGVCL meter ₹</Label>
                <Input
                  type="number"
                  min={0}
                  value={meterCharges}
                  onChange={(e) => setMeterCharges(e.target.value)}
                />
              </div>
              <div>
                <Label>Subsidy ₹</Label>
                <Input
                  type="number"
                  min={0}
                  value={subsidy}
                  onChange={(e) => setSubsidy(e.target.value)}
                />
              </div>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Terms</Label>
            <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--text-dark)]">Totals</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Subtotal</dt>
              <dd>{formatCurrency(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Discounts</dt>
              <dd>−{formatCurrency(totals.discountTotal)}</dd>
            </div>
            {usesResidentialBomFields(templateKind) && (
              <>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Meter charges</dt>
                  <dd>{formatCurrency(totals.meterCharges)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Subsidy</dt>
                  <dd>−{formatCurrency(totals.subsidy)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">GST</dt>
              <dd>{formatCurrency(totals.gstTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold">
              <dt>Grand total</dt>
              <dd>{formatCurrency(totals.grandTotal)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Update quotation" : "Create quotation"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function calcItemTaxable(lines: DraftLine[]) {
  return lines.reduce((sum, l) => {
    const base = Math.max(
      0,
      Number(l.quantity) * Number(l.rate) - Number(l.discount_value || 0)
    );
    return sum + base;
  }, 0);
}
