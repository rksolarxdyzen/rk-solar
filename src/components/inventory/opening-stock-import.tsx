"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Card, StatCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checkSerials, importOpeningStock } from "@/actions/inventory";
import {
  buildImportPayload,
  downloadErrorReport,
  downloadTemplate,
  parseImportFile,
  type ParsedImport,
} from "@/lib/inventory/excel-import";
import type { CategoryRef, NamedRef, PickerItem, SubcategoryRef } from "@/lib/inventory/queries";
import type { OpeningImportResult } from "@/lib/inventory/types";
import { formatQty } from "@/lib/inventory/format";

const ANY_ITEM = "00000000-0000-4000-8000-000000000000";

async function flagExistingSerials(parsed: ParsedImport): Promise<ParsedImport> {
  const serialRows = parsed.rows.filter((r) => r.sheet === "Serials" && r.serial && r.status !== "error");
  const existing = new Map<string, string>();
  for (let i = 0; i < serialRows.length; i += 500) {
    const chunk = serialRows.slice(i, i + 500);
    const res = await checkSerials({ item_id: ANY_ITEM, serials: chunk.map((r) => r.serial as string), mode: "inward" });
    if (!res.ok) throw new Error(res.error);
    res.results.forEach((r) => {
      if (!r.ok && r.serial_no) existing.set(r.serial_no, r.message ?? "Already in inventory");
    });
  }
  if (existing.size === 0) return parsed;
  return {
    ...parsed,
    rows: parsed.rows.map((r) =>
      r.serial && existing.has(r.serial) && r.status !== "error"
        ? { ...r, status: "error", messages: [...r.messages, existing.get(r.serial) as string] }
        : r
    ),
  };
}

export function OpeningStockImport({
  items,
  masterGroups,
  categories,
  subcategories,
  brands,
  canManageCost,
}: {
  items: PickerItem[];
  masterGroups: NamedRef[];
  categories: CategoryRef[];
  subcategories: SubcategoryRef[];
  brands: NamedRef[];
  canManageCost: boolean;
}) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [result, setResult] = useState<OpeningImportResult | null>(null);
  const [filter, setFilter] = useState<"all" | "error">("all");
  const [pending, startTransition] = useTransition();

  async function onFile(file: File) {
    setError(null);
    setParsed(null);
    setResult(null);
    setFileName(file.name);
    setReading(true);
    try {
      const p = await parseImportFile(file, {
        items,
        masterGroups,
        categories,
        subcategories,
        brands,
        canManageCost,
      });
      setParsed(await flagExistingSerials(p));
      setSkipErrors(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setReading(false);
    }
  }

  const summary = useMemo(() => {
    if (!parsed) return null;
    const good = parsed.rows.filter((r) => r.status !== "error");
    const errors = parsed.rows.length - good.length;
    const itemsTouched = new Set(good.map((r) => r.itemId ?? r.itemKey)).size;
    const serials = good.filter((r) => r.sheet === "Serials").length;
    const newItems = new Set(good.filter((r) => !r.itemId).map((r) => r.itemKey)).size;
    return { good: good.length, errors, itemsTouched, serials, newItems };
  }, [parsed]);

  const canImport = Boolean(parsed && summary && summary.good > 0 && (summary.errors === 0 || skipErrors) && !pending);

  function runImport() {
    if (!parsed) return;
    setError(null);
    const payload = buildImportPayload(parsed, fileName, date || undefined);
    startTransition(async () => {
      const res = await importOpeningStock(payload);
      if (!res.ok) return setError(res.error);
      setResult(res.result);
    });
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--success)]" />
        <div>
          <p className="text-lg font-bold">Opening stock imported</p>
          <p className="text-sm text-[var(--text-muted)]">
            {result.movements} item entries · {result.serials} serials · {result.items_created} new items
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/inventory" className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white">
            View stock
          </Link>
          {parsed && summary && summary.errors > 0 && (
            <Button variant="secondary" onClick={() => void downloadErrorReport(parsed.rows)}>
              Download skipped rows
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const shownRows = parsed ? parsed.rows.filter((r) => filter === "all" || r.status === "error") : [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">1. Download the template</p>
          <p className="text-xs text-[var(--text-muted)]">Stock sheet for bulk items, Serials sheet for panels and inverters (one row per unit).</p>
        </div>
        <Button variant="secondary" onClick={() => void downloadTemplate()} className="min-h-[44px]">
          <Download className="h-4 w-4" /> Template
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">2. Upload the filled file</p>
        <label
          className={cn(
            "flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--border)] p-4 text-center hover:border-[var(--primary)]",
            reading && "pointer-events-none opacity-60"
          )}
        >
          {reading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-[var(--text-muted)]" />}
          <span className="text-sm font-medium">{fileName || "Choose .xlsx, .xls or .csv"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {!canManageCost && <p className="text-xs text-[var(--text-muted)]">Unit cost columns are ignored for your account.</p>}
      </Card>

      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">{error}</div>
      )}

      {parsed && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Items" value={summary.itemsTouched} sub={summary.newItems ? `${summary.newItems} new` : undefined} />
            <StatCard label="Serials" value={summary.serials} />
            <StatCard label="Good rows" value={summary.good} color="success" />
            <StatCard label="Errors" value={summary.errors} color={summary.errors ? "error" : "default"} />
          </div>
          {parsed.ignoredCost && <p className="text-xs text-[var(--warn)]">This file has unit costs; they will not be saved for your account.</p>}

          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
              <div className="flex gap-1">
                {(["all", "error"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "min-h-[36px] rounded-full border px-3 text-xs font-semibold",
                      filter === f ? "border-[var(--primary)] bg-[var(--primary-faint)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]"
                    )}
                  >
                    {f === "all" ? `All rows (${parsed.rows.length})` : `Errors (${summary.errors})`}
                  </button>
                ))}
              </div>
              {summary.errors > 0 && (
                <Button size="sm" variant="ghost" onClick={() => void downloadErrorReport(parsed.rows)}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Error report
                </Button>
              )}
            </div>
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg)] text-left text-[0.65rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Qty / Serial</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.slice(0, 1000).map((r) => (
                    <tr key={r.id} className={cn("border-t border-[var(--border-light)]", r.status === "error" && "bg-[var(--error-light)]/50")}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-muted)]">
                        {r.sheet} {r.rowNo}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.itemName || r.sku}</span>
                        {!r.itemId && r.status !== "error" && <Badge className="ml-1">New</Badge>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.sheet === "Serials" ? r.serial : formatQty(r.quantity, r.unit ?? undefined)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.status === "error" ? <span className="text-[var(--error)]">{r.messages.join("; ")}</span> : <Badge variant="received">OK</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownRows.length > 1000 && <p className="p-3 text-center text-xs text-[var(--text-muted)]">Showing the first 1000 rows.</p>}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div>
                <Label htmlFor="imp-date">Stock as on</Label>
                <Input id="imp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px]" />
              </div>
              {summary.errors > 0 && (
                <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} className="h-5 w-5" />
                  Skip the {summary.errors} rows with errors
                </label>
              )}
            </div>
            <Button onClick={runImport} disabled={!canImport} className="min-h-[48px] px-6">
              {pending ? "Importing…" : `3. Import ${summary.good} rows`}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
