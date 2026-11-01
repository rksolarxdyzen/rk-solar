"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { postInward } from "@/actions/inventory";
import {
  extractTextFromFile,
  parseInvoiceText,
  type InvoiceCandidateLine,
  type InvoiceParseResult,
} from "@/lib/inventory/invoice-import";
import type { PickerItem } from "@/lib/inventory/queries";

const MAX_BYTES = 10 * 1024 * 1024;

export function InvoiceInwardImport({ items }: { items: PickerItem[] }) {
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [usedOcr, setUsedOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<InvoiceParseResult | null>(null);
  const [lines, setLines] = useState<InvoiceCandidateLine[]>([]);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ no: string; units: number } | null>(null);

  const problems = useMemo(
    () =>
      lines.map((l) => {
        if (!l.itemId) return "Pick an inventory item";
        if (l.trackSerials) {
          if (l.serials.length === 0) return "Add at least one serial";
          return null;
        }
        if (!l.quantity || !(l.quantity > 0)) return "Enter a quantity";
        return null;
      }),
    [lines]
  );
  const canImport = lines.length > 0 && problems.every((p) => !p) && !pending;

  async function onFile(file: File) {
    setError(null);
    setParsed(null);
    setLines([]);
    setDone(null);
    setFileName(file.name);
    if (file.size > MAX_BYTES) {
      setError("File is larger than 10 MB. Compress the photo or use a smaller PDF.");
      return;
    }
    setReading(true);
    try {
      const { text, usedOcr: ocr } = await extractTextFromFile(file);
      setUsedOcr(ocr);
      if (!text.trim()) throw new Error("Could not read any text from this file.");
      const result = parseInvoiceText(text, items);
      setParsed(result);
      setLines(result.lines);
      setSupplier(result.header.supplierName ?? "");
      setInvoiceNo(result.header.invoiceNo ?? "");
      setInvoiceDate(result.header.invoiceDate ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setReading(false);
    }
  }

  function patch(key: string, fields: Partial<InvoiceCandidateLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...fields } : l)));
  }

  function assignItem(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId) ?? null;
    patch(key, {
      itemId: item?.id ?? null,
      itemName: item?.name ?? null,
      trackSerials: Boolean(item?.track_serials),
      warnings: item ? [] : ["No matching inventory item — pick one before import"],
    });
  }

  function save() {
    setError(null);
    const payload = {
      movement_date: date || undefined,
      supplier_name: supplier,
      supplier_invoice_no: invoiceNo,
      supplier_invoice_date: invoiceDate || undefined,
      notes: `Imported from invoice/challan: ${fileName}${usedOcr ? " (OCR)" : ""}`,
      lines: lines.map((l) => ({
        item_id: l.itemId as string,
        ...(l.trackSerials
          ? { serials: l.serials.map((s) => ({ serial_no: s })) }
          : { quantity: Number(l.quantity) }),
      })),
    };
    startTransition(async () => {
      const res = await postInward(payload);
      if (!res.ok) return setError(res.error);
      setDone({
        no: res.movement.movement_no,
        units: lines.reduce((n, l) => n + l.serials.length, 0),
      });
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
          <Link
            href="/inventory/inward/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white"
          >
            Manual inward
          </Link>
          <Link
            href="/inventory"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-[1.5px] border-[var(--border)] px-4 text-sm font-semibold"
          >
            Back to stock
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm text-[var(--text-body)]">
          Upload a supplier invoice or short challan (PDF or photo). Text PDFs are read in the browser;
          scans use on-device OCR. Review the preview, fix unmatched items, then import into stock.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Handwritten or blurry photos may need manual fixes. Only the first PDF page is read in v1.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]">
          <Upload className="h-4 w-4" />
          {reading ? "Reading…" : "Choose PDF or image"}
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="hidden"
            disabled={reading || pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && (
          <p className="text-xs text-[var(--text-muted)]">
            {fileName}
            {usedOcr ? " · OCR" : parsed ? " · text extract" : ""}
          </p>
        )}
        {reading && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting text…
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">
          {error}
        </div>
      )}

      {parsed && (
        <>
          <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="inv-supplier">Supplier</Label>
              <Input id="inv-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label htmlFor="inv-no">Invoice no.</Label>
              <Input id="inv-no" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label htmlFor="inv-date">Invoice date</Label>
              <Input id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label htmlFor="rcv-date">Received on</Label>
              <Input id="rcv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px]" />
            </div>
          </Card>

          <div className="space-y-3">
            {lines.length === 0 ? (
              <Card className="py-8 text-center text-sm text-[var(--text-muted)]">
                No line items detected. Try a clearer scan or enter stock manually.
              </Card>
            ) : (
              lines.map((line, idx) => (
                <Card key={line.key} className={cn("space-y-3", problems[idx] && "border-[var(--error)]")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-dark)]">{line.description || "—"}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {line.kind === "serial" ? "Serial line" : "Bulk"} · score {line.matchScore}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--error)]"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      Remove
                    </button>
                  </div>

                  <div>
                    <Label>Inventory item</Label>
                    <Select
                      value={line.itemId ?? ""}
                      onChange={(e) => assignItem(line.key, e.target.value)}
                      className="min-h-[44px]"
                    >
                      <option value="">Select item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                          {it.sku ? ` (${it.sku})` : ""}
                          {it.track_serials ? " · serial" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {line.trackSerials ? (
                    <div>
                      <Label>Serials ({line.serials.length})</Label>
                      <textarea
                        className="min-h-[72px] w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 font-mono text-xs"
                        value={line.serials.join("\n")}
                        onChange={(e) =>
                          patch(line.key, {
                            serials: e.target.value
                              .split(/[\n,;]+/)
                              .map((s) => s.trim().toUpperCase())
                              .filter(Boolean),
                            quantity: e.target.value.split(/[\n,;]+/).filter((s) => s.trim()).length,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="max-w-[10rem]">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min={0.001}
                        step="any"
                        value={line.quantity ?? ""}
                        onChange={(e) => patch(line.key, { quantity: Number(e.target.value) || null })}
                        className="min-h-[44px]"
                      />
                    </div>
                  )}

                  {(line.warnings.length > 0 || problems[idx]) && (
                    <ul className="space-y-0.5 text-xs text-[var(--error)]">
                      {problems[idx] && <li>{problems[idx]}</li>}
                      {line.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!canImport} onClick={save}>
              {pending ? "Importing…" : `Import ${lines.length} line(s)`}
            </Button>
            <Link
              href="/inventory/inward/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] px-4 text-sm font-semibold"
            >
              <FileText className="h-4 w-4" /> Manual inward instead
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
