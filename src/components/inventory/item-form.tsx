"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  createInventoryBrand,
  createInventoryCategory,
  createInventoryItem,
  createInventoryMasterGroup,
  createInventorySubcategory,
  setItemDefaultCost,
  updateInventoryItem,
} from "@/actions/inventory";
import { composeInventoryItemName, costIncGst, formatInr } from "@/lib/inventory/format";
import { isValidPattern, parseScan, SERIAL_PATTERN_PRESETS } from "@/lib/inventory/serial-parse";
import type { CategoryRef, NamedRef, SubcategoryRef } from "@/lib/inventory/queries";
import type { InventoryItem, InventoryUnit, SerialScanMode } from "@/lib/inventory/types";

const SERIAL_NAME = /^(panel|inverter)s?$/i;

type AddKind = "master" | "category" | "subcategory" | "brand" | null;

export function ItemForm({
  item,
  masterGroups: initialGroups,
  categories: initialCategories,
  subcategories: initialSubs,
  brands: initialBrands,
  defaultCost,
  defaultGstPercent,
  canViewCost,
  canManageCost,
  hasMovements,
}: {
  item?: InventoryItem | null;
  masterGroups: NamedRef[];
  categories: CategoryRef[];
  subcategories: SubcategoryRef[];
  brands: NamedRef[];
  defaultCost?: number | null;
  defaultGstPercent?: number | null;
  canViewCost: boolean;
  canManageCost: boolean;
  hasMovements?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [masterGroups, setMasterGroups] = useState(initialGroups);
  const [categories, setCategories] = useState(initialCategories);
  const [subcategories, setSubcategories] = useState(initialSubs);
  const [brands, setBrands] = useState(initialBrands);

  const [sku, setSku] = useState(item?.sku ?? "");
  const [masterGroupId, setMasterGroupId] = useState(item?.master_group_id ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(item?.subcategory_id ?? "");
  const [brandId, setBrandId] = useState(item?.brand_id ?? "");
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit_type ?? "nos");
  const [threshold, setThreshold] = useState(String(item?.low_stock_threshold ?? 0));
  const [active, setActive] = useState(item?.is_active ?? true);
  const [scanMode, setScanMode] = useState<SerialScanMode>(item?.serial_mode ?? "whole");
  const [pattern, setPattern] = useState(item?.serial_pattern ?? "");
  const [cost, setCost] = useState(defaultCost == null ? "" : String(defaultCost));
  const [gst, setGst] = useState(defaultGstPercent == null ? "" : String(defaultGstPercent));
  const [testScan, setTestScan] = useState("");

  const [addKind, setAddKind] = useState<AddKind>(null);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  const masterName = masterGroups.find((g) => g.id === masterGroupId)?.name ?? "";
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";
  const subcategoryName = subcategories.find((s) => s.id === subcategoryId)?.name ?? "";
  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";
  const serialTracked = SERIAL_NAME.test(masterName.trim()) || SERIAL_NAME.test(categoryName.trim());
  const typeLocked = Boolean(hasMovements);
  const patternOk = !pattern || isValidPattern(pattern);
  const hierarchyReady = Boolean(masterGroupId && categoryId && subcategoryId);
  const namePreview = composeInventoryItemName({
    masterGroup: masterName,
    category: categoryName,
    subcategory: subcategoryName,
    brand: brandName,
    sku,
  });
  const exGstNum = cost.trim() === "" ? null : Number(cost);
  const gstNum = gst.trim() === "" ? null : Number(gst);
  const incGst = costIncGst(exGstNum, gstNum);
  const test = useMemo(
    () => (testScan.trim() ? parseScan(testScan, scanMode, pattern || null) : null),
    [testScan, scanMode, pattern]
  );

  const filteredCategories = useMemo(() => {
    if (!masterGroupId) return categories;
    return categories.filter((c) => !c.master_group_id || c.master_group_id === masterGroupId);
  }, [categories, masterGroupId]);

  const filteredSubs = useMemo(() => {
    if (!categoryId) return [];
    return subcategories.filter((s) => s.category_id === categoryId);
  }, [subcategories, categoryId]);

  function onMasterChange(id: string) {
    setMasterGroupId(id);
    if (!id) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.master_group_id && cat.master_group_id !== id) {
      setCategoryId("");
      setSubcategoryId("");
    }
  }

  function onCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat?.master_group_id) setMasterGroupId(cat.master_group_id);
    const sub = subcategories.find((s) => s.id === subcategoryId);
    if (sub && sub.category_id !== id) setSubcategoryId("");
  }

  function openAdd(kind: AddKind) {
    setAddKind(kind);
    setAddName("");
    setAddError(null);
  }

  function submitAdd(e?: React.FormEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setAddError(null);
    const trimmed = addName.trim();
    if (!trimmed) return setAddError("Name is required.");
    startAdd(async () => {
      if (addKind === "master") {
        const res = await createInventoryMasterGroup({ name: trimmed });
        if (!res.ok) return setAddError(res.error);
        if (!res.id) return setAddError("Created, but the server did not return an id. Refresh and try again.");
        setMasterGroups((prev) => (prev.some((g) => g.id === res.id) ? prev : [...prev, { id: res.id, name: res.name }]));
        setMasterGroupId(res.id);
      } else if (addKind === "category") {
        const res = await createInventoryCategory({
          name: trimmed,
          master_group_id: masterGroupId || null,
        });
        if (!res.ok) return setAddError(res.error);
        if (!res.id) return setAddError("Created, but the server did not return an id. Refresh and try again.");
        const mg = (res.master_group_id as string | null | undefined) ?? (masterGroupId || null);
        setCategories((prev) => {
          const next = prev.filter((c) => c.id !== res.id);
          return [...next, { id: res.id, name: res.name, master_group_id: mg }];
        });
        if (mg) setMasterGroupId(mg);
        setCategoryId(res.id);
        setSubcategoryId("");
      } else if (addKind === "subcategory") {
        if (!categoryId) return setAddError("Choose a category first.");
        const res = await createInventorySubcategory({ category_id: categoryId, name: trimmed });
        if (!res.ok) return setAddError(res.error);
        if (!res.id) return setAddError("Created, but the server did not return an id. Refresh and try again.");
        const catId = (res.category_id as string | undefined) ?? categoryId;
        setSubcategories((prev) => {
          const next = prev.filter((s) => s.id !== res.id);
          return [...next, { id: res.id, name: res.name, category_id: catId }];
        });
        setSubcategoryId(res.id);
      } else if (addKind === "brand") {
        const res = await createInventoryBrand({ name: trimmed });
        if (!res.ok) return setAddError(res.error);
        if (!res.id) return setAddError("Created, but the server did not return an id. Refresh and try again.");
        setBrands((prev) => (prev.some((b) => b.id === res.id) ? prev : [...prev, { id: res.id, name: res.name }]));
        setBrandId(res.id);
      }
      setAddKind(null);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hierarchyReady) return setError("Choose Master Group, Category, and Sub-Category.");
    if (!patternOk) return setError("The serial pattern is not a valid regular expression.");
    const payload = {
      sku,
      master_group_id: masterGroupId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      brand_id: brandId || null,
      unit_type: serialTracked ? "nos" : unit,
      serial_mode: scanMode,
      serial_pattern: scanMode === "extract" ? pattern : "",
      low_stock_threshold: threshold || 0,
      is_active: active,
      specifications: item?.specifications ?? {},
    };
    startTransition(async () => {
      const res = item ? await updateInventoryItem(item.id, payload) : await createInventoryItem(payload);
      if (!res.ok) return setError(res.error);
      const id = item?.id ?? ("id" in res ? (res.id as string) : "");
      const nextCost = cost.trim() === "" ? null : Number(cost);
      const nextGst = gst.trim() === "" ? null : Number(gst);
      const costChanged = nextCost !== (defaultCost ?? null) || nextGst !== (defaultGstPercent ?? null);
      if (canManageCost && id && costChanged) {
        const c = await setItemDefaultCost(id, nextCost, nextGst);
        if (!c.ok) return setError(`Item saved, but cost was not: ${c.error}`);
      }
      router.push(`/inventory/items/${id}`);
      router.refresh();
    });
  }

  const addTitle =
    addKind === "master"
      ? "Add master group"
      : addKind === "category"
        ? "Add category"
        : addKind === "subcategory"
          ? "Add sub-category"
          : addKind === "brand"
            ? "Add group"
            : "";

  return (
    <form onSubmit={submit} className="space-y-4 pb-24 md:pb-0">
      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">
          {error}
        </div>
      )}

      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-muted,var(--bg))] px-3 py-2.5">
          <p className="text-xs font-medium text-[var(--text-muted)]">Item name (auto)</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--text-dark)]">
            {namePreview || "Choose Master Group › Group › Category › Sub-Category"}
          </p>
        </div>

        <MasterSelect
          id="inv-master"
          label="Master Group *"
          value={masterGroupId}
          options={masterGroups}
          disabled={typeLocked}
          onChange={onMasterChange}
          onAdd={() => openAdd("master")}
          required
          hint={
            SERIAL_NAME.test(masterName.trim()) ? (
              <Badge variant="received">Serials compulsory (Panel / Inverter master)</Badge>
            ) : undefined
          }
        />

        <MasterSelect
          id="inv-brand"
          label="Group"
          value={brandId}
          options={brands}
          onChange={setBrandId}
          onAdd={() => openAdd("brand")}
        />

        <MasterSelect
          id="inv-cat"
          label="Category *"
          value={categoryId}
          options={filteredCategories}
          disabled={typeLocked}
          onChange={onCategoryChange}
          onAdd={() => openAdd("category")}
          required
          hint={
            serialTracked ? (
              <Badge variant="received">Serial numbers required for every unit</Badge>
            ) : (
              "If Master Group or Category is Panel / Inverter, every unit needs a serial number."
            )
          }
          extraHint={typeLocked ? " Category can't change once stock has moved." : undefined}
        />

        <MasterSelect
          id="inv-sub"
          label="Sub-Category *"
          value={subcategoryId}
          options={filteredSubs}
          disabled={!categoryId || typeLocked}
          onChange={setSubcategoryId}
          onAdd={() => openAdd("subcategory")}
          addDisabled={!categoryId}
          required
        />

        <div>
          <Label htmlFor="inv-sku">SKU / code</Label>
          <Input id="inv-sku" maxLength={80} value={sku} onChange={(e) => setSku(e.target.value)} className="min-h-[44px]" />
        </div>
        <div>
          <Label htmlFor="inv-unit">Unit</Label>
          <Select
            id="inv-unit"
            value={serialTracked ? "nos" : unit}
            disabled={serialTracked || typeLocked}
            onChange={(e) => setUnit(e.target.value as InventoryUnit)}
            className="min-h-[44px]"
          >
            <option value="nos">Nos</option>
            <option value="kg">Kg</option>
            <option value="m">Meter</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="inv-low">Low stock alert at</Label>
          <Input
            id="inv-low"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm font-medium">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
          Active (shown in inward / dispatch)
        </label>
      </Card>

      {serialTracked && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold text-[var(--text-dark)]">Barcode label</h2>
            <p className="text-xs text-[var(--text-muted)]">How to read the serial number from this item&apos;s barcode / QR label.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["whole", "extract"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setScanMode(m)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  scanMode === m ? "border-[var(--primary)] bg-[var(--primary-faint)]" : "border-[var(--border)] hover:border-[var(--text-muted)]"
                )}
              >
                <span className="font-semibold">{m === "whole" ? "Serial only" : "Mixed content"}</span>
                <p className="text-xs text-[var(--text-muted)]">
                  {m === "whole" ? "The code contains just the serial number." : "The code has model, power, URL etc. — pick out the serial."}
                </p>
              </button>
            ))}
          </div>

          {scanMode === "extract" && (
            <div className="space-y-2">
              <Label htmlFor="inv-pattern">Serial pattern (optional)</Label>
              <div className="flex flex-wrap gap-1">
                {SERIAL_PATTERN_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    title={p.hint}
                    onClick={() => setPattern(p.pattern)}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--primary)]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Input
                id="inv-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Leave empty to use the built-in SN: / URL rules"
                className={cn("font-mono text-xs", !patternOk && "border-[var(--error)]")}
              />
            </div>
          )}

          <div>
            <Label htmlFor="inv-test">Test a scan</Label>
            <Input
              id="inv-test"
              value={testScan}
              onChange={(e) => setTestScan(e.target.value)}
              placeholder="Paste a sample barcode here"
              className="min-h-[44px] font-mono text-sm"
            />
            {test && (
              <p className="mt-2 text-sm">
                {test.serial ? (
                  <>
                    Will save: <span className="font-mono font-bold text-[var(--success)]">{test.serial}</span>
                  </>
                ) : (
                  <span className="text-[var(--warn)]">No serial found — staff will be asked to pick it on each scan. Try a pattern above.</span>
                )}
              </p>
            )}
          </div>
        </Card>
      )}

      {canViewCost && (
        <Card className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="inv-cost">Default cost (₹ ex-GST)</Label>
            <Input
              id="inv-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={cost}
              disabled={!canManageCost}
              onChange={(e) => setCost(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label htmlFor="inv-gst">GST %</Label>
            <Input
              id="inv-gst"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={gst}
              disabled={!canManageCost}
              onChange={(e) => setGst(e.target.value)}
              className="min-h-[44px]"
              placeholder="e.g. 18"
            />
          </div>
          <div>
            <Label htmlFor="inv-inc">Inc. GST (final)</Label>
            <Input id="inv-inc" readOnly value={incGst == null ? "" : String(incGst)} className="min-h-[44px] bg-[var(--bg)]" />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {incGst != null
                ? `${formatInr(incGst)} = ex-GST × (1 + GST%/100)`
                : "Enter cost and GST % (e.g. 18) to see tax-inclusive amount"}
            </p>
          </div>
          <p className="sm:col-span-3 text-xs text-[var(--text-muted)]">
            Final cost includes GST for display and inward prefill. Stock value still uses ex-GST purchase cost.
          </p>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-white p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" disabled={pending || !hierarchyReady} className="min-h-[48px] w-full md:w-auto">
          {pending ? "Saving…" : item ? "Save changes" : "Create item"}
        </Button>
      </div>

      <Modal open={Boolean(addKind)} onClose={() => !addPending && setAddKind(null)} title={addTitle}>
        <div className="space-y-3">
          {addError && (
            <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {addError}
            </div>
          )}
          <div>
            <Label htmlFor="inv-add-name">Name</Label>
            <Input
              id="inv-add-name"
              autoFocus
              maxLength={addKind === "brand" ? 120 : 80}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!addPending && addName.trim()) submitAdd();
                }
              }}
              className="min-h-[44px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={addPending} onClick={() => setAddKind(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={addPending || !addName.trim()} onClick={() => submitAdd()}>
              {addPending ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </form>
  );
}

function MasterSelect({
  id,
  label,
  value,
  options,
  onChange,
  onAdd,
  disabled,
  addDisabled,
  hint,
  extraHint,
  required,
}: {
  id: string;
  label: string;
  value: string;
  options: NamedRef[];
  onChange: (id: string) => void;
  onAdd: () => void;
  disabled?: boolean;
  addDisabled?: boolean;
  hint?: React.ReactNode;
  extraHint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          disabled={disabled || addDisabled}
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <Select id={id} value={value} disabled={disabled} required={required} onChange={(e) => onChange(e.target.value)} className="min-h-[44px]">
        <option value="">{required ? "— Choose —" : "— None —"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      {(hint || extraHint) && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {hint}
          {extraHint}
        </p>
      )}
    </div>
  );
}
