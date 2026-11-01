/**
 * Invoice / challan text heuristics for stock inward import.
 * Browser extractors (PDF / OCR) feed text into parseInvoiceText().
 */

import { normalizeSerial } from "./serial-parse";
import type { PickerItem } from "@/lib/inventory/queries";

export type InvoiceImportLineKind = "bulk" | "serial";

export interface InvoiceParsedHeader {
  supplierName: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
}

export interface InvoiceCandidateLine {
  key: string;
  kind: InvoiceImportLineKind;
  description: string;
  quantity: number | null;
  serials: string[];
  itemId: string | null;
  itemName: string | null;
  trackSerials: boolean;
  warnings: string[];
  matchScore: number;
}

export interface InvoiceParseResult {
  header: InvoiceParsedHeader;
  lines: InvoiceCandidateLine[];
  rawTextPreview: string;
  blankSkipped: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Panel/inverter serials on Sattva and Aris challans. GSTIN and vehicle numbers are not serials. */
function isPanelSerial(token: string): boolean {
  const n = normalizeSerial(token);
  if (!n || n.length < 12 || n.length > 24) return false;
  if (/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(n)) return false;
  if (/^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/.test(n)) return false;
  return /[A-Z]/.test(n) && /\d/.test(n);
}

function extractPanelSerials(line: string): string[] {
  const found: string[] = [];
  const chunks = line.split(/[·•,;|]+/);
  for (const chunk of chunks) {
    const tokens = chunk.match(/[A-Za-z0-9][A-Za-z0-9\-/.]{10,}/g) ?? [];
    for (const token of tokens) {
      if (isPanelSerial(token)) {
        const n = normalizeSerial(token);
        if (n) found.push(n);
      }
    }
  }
  return [...new Set(found)];
}

const QTY_DESC =
  /^\s*(?:(\d+(?:\.\d+)?)\s*[x×*]\s+(.+)|(.+?)\s+[x×*]\s*(\d+(?:\.\d+)?))\s*$/i;

const INVOICE_NO = /(?:invoice|inv|challan|bill)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i;
const SUPPLIER = /(?:supplier|vendor|sold\s*by|from)\s*[:.\-]?\s*(.+)$/im;
const DATE_DMY = /(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/;
const DATE_ISO = /(\d{4})-(\d{2})-(\d{2})/;

function scoreItem(description: string, item: PickerItem): number {
  const d = description.toLowerCase().replace(/\s+/g, " ").trim();
  const name = item.name.toLowerCase();
  const sku = (item.sku ?? "").toLowerCase();
  if (!d) return 0;
  if (sku && (d.includes(sku) || sku.includes(d))) return 100;
  if (name === d) return 95;
  if (d.includes(name) || name.includes(d)) return 80;
  const dTokens = new Set(d.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const nTokens = name.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (nTokens.length === 0) return 0;
  let hit = 0;
  for (const t of nTokens) if (dTokens.has(t)) hit++;
  const ratio = hit / nTokens.length;
  if (ratio >= 0.6) return Math.round(50 + ratio * 30);
  // Wattage hint: "540" in both
  const watt = d.match(/\b(\d{3,4})\s*w(?:att)?s?\b/i)?.[1];
  if (watt && name.includes(watt)) return 45;
  return 0;
}

export function matchItemsToDescription(
  description: string,
  items: PickerItem[]
): { item: PickerItem | null; score: number } {
  let best: PickerItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = scoreItem(description, item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  if (bestScore < 40) return { item: null, score: bestScore };
  return { item: best, score: bestScore };
}

function isoDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseHeader(text: string): InvoiceParsedHeader {
  const challanNo =
    /challan\s*no\.?\s*[:.]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/i.exec(text)?.[1] ??
    INVOICE_NO.exec(text)?.[1] ??
    null;

  let invoiceDate: string | null = null;
  const labeledDmy = /challan\s*date\s*[:.]?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i.exec(text);
  const labeledMonth =
    /\bdate\s*[:.]?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i.exec(
      text
    );
  if (labeledDmy) invoiceDate = isoDate(labeledDmy[3], labeledDmy[2], labeledDmy[1]);
  else if (labeledMonth) {
    const month = String(MONTHS.indexOf(labeledMonth[2].slice(0, 3).toLowerCase()) + 1);
    invoiceDate = isoDate(labeledMonth[3], month, labeledMonth[1]);
  } else {
    const iso = DATE_ISO.exec(text);
    const dmy = DATE_DMY.exec(text);
    if (iso) invoiceDate = isoDate(iso[1], iso[2], iso[3]);
    else if (dmy) invoiceDate = isoDate(dmy[3], dmy[2], dmy[1]);
  }

  const labeledSupplier = SUPPLIER.exec(text)?.[1]?.trim();
  let supplierName = labeledSupplier && !/sumeru/i.test(labeledSupplier) ? labeledSupplier : null;
  if (!supplierName) {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (/sumeru/i.test(line)) continue;
      if (/^(?:for\s+)?[A-Z][A-Z0-9&.' ]*(?:ENERGIES|ENERGY|SOLAR|LIMITED|PRIVATE|PVT)\b/i.test(line)) {
        supplierName = line.replace(/^for\s+/i, "").replace(/\s{2,}/g, " ").trim();
        break;
      }
    }
  }

  return {
    supplierName: supplierName?.slice(0, 200) || null,
    invoiceNo: challanNo?.trim().slice(0, 100) || null,
    invoiceDate,
  };
}

function cleanDescription(value: string): string {
  return value
    .replace(/[·•]/g, " ")
    .replace(/^[0-9]+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isChallanFooter(line: string): boolean {
  return /^(driver|remarks|total items|for |authori[sz]ed|goods sent|delivery contact|signature)/i.test(
    line.trim()
  );
}

type DraftLine = {
  description: string;
  quantity: number | null;
  serials: string[];
};

function takeTrailingQty(body: string): { text: string; quantity: number | null } {
  const match = /^(.*?)(?:\s+)(\d+(?:\.\d+)?)\s*(?:nos|pcs|set|mtr|kg|m)?\s*$/i.exec(body.trim());
  if (!match) return { text: body.trim(), quantity: null };
  const quantity = Number(match[2]);
  if (!Number.isFinite(quantity) || quantity <= 0) return { text: body.trim(), quantity: null };
  return { text: match[1].trim(), quantity };
}

function isNoiseLine(line: string): boolean {
  const t = line.trim().toLowerCase();
  if (!t || t.length < 2) return true;
  if (/^(page|total|sub\s*total|gst|cgst|sgst|igst|taxable|grand\s*total|hsn|sac)\b/.test(t)) return true;
  if (/^(sr\.?|no\.?|#|particulars(\s+quantity)?|quantity)$/.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

function looksLikeItem(description: string): boolean {
  return /panel|inverter|structure|accessor|cable|pipe|hook|module|battery|meter/i.test(description);
}

function finishDraft(draft: DraftLine, items: PickerItem[], key: number): InvoiceCandidateLine | null {
  const description = cleanDescription(draft.description);
  if (!description || !looksLikeItem(description)) return null;
  const serials = [...new Set(draft.serials)];
  const { item, score } = matchItemsToDescription(description, items);
  const warnings: string[] = [];
  const trackSerials = Boolean(item?.track_serials) || serials.length > 0 || /panel|inverter|module/i.test(description);
  if (!item) warnings.push("No matching inventory item — pick one before import");
  if (trackSerials && serials.length === 0) warnings.push("Serial-tracked item needs serial numbers");
  if (draft.quantity != null && serials.length > 0 && serials.length !== draft.quantity) {
    warnings.push(`Qty ${draft.quantity} vs ${serials.length} serial(s)`);
  }
  return {
    key: `L${key}`,
    kind: trackSerials ? "serial" : "bulk",
    description,
    quantity: trackSerials ? serials.length || draft.quantity : draft.quantity ?? 1,
    serials,
    itemId: item?.id ?? null,
    itemName: item?.name ?? null,
    trackSerials,
    warnings,
    matchScore: score,
  };
}

function parseChallanDrafts(linesIn: string[]): { drafts: DraftLine[]; blankSkipped: number } | null {
  const joined = linesIn.join("\n");
  if (!/delivery\s+challan/i.test(joined) && !/particulars/i.test(joined)) return null;

  const drafts: DraftLine[] = [];
  let current: DraftLine | null = null;
  let blankSkipped = 0;
  let inBody = false;

  function pushCurrent() {
    if (current && cleanDescription(current.description)) drafts.push(current);
    current = null;
  }

  for (const raw of linesIn) {
    const line = raw.trim();
    if (!line) {
      blankSkipped++;
      continue;
    }
    if (!inBody) {
      if (/particulars/i.test(line)) inBody = true;
      continue;
    }
    if (isChallanFooter(line)) break;
    if (isNoiseLine(line)) continue;

    const serials = extractPanelSerials(line);
    const serialOnly = serials.length > 0 && cleanDescription(line.replace(/s\/n\s*\(\d+\)\s*:/i, "")).length < 8;
    if ((/^s\/n\b/i.test(line) || serialOnly) && current) {
      current.serials.push(...serials);
      continue;
    }

    const numbered = /^(\d+)\s+(.+)$/.exec(line);
    const body = numbered ? numbered[2] : line;
    const trailing = takeTrailingQty(body);
    const bodySerials = extractPanelSerials(trailing.text);
    const description = cleanDescription(
      trailing.text
        .split(/[·•,;|]+/)
        .filter((part) => extractPanelSerials(part).length === 0)
        .join(" ")
    );

    if (bodySerials.length > 0 && description.length < 8 && current) {
      current.serials.push(...bodySerials);
      if (trailing.quantity != null) current.quantity = trailing.quantity;
      continue;
    }

    if (!description || !looksLikeItem(description)) {
      if (bodySerials.length > 0 && current) current.serials.push(...bodySerials);
      continue;
    }

    pushCurrent();
    current = {
      description,
      quantity: trailing.quantity,
      serials: bodySerials,
    };
  }
  pushCurrent();
  if (drafts.length === 0) return null;
  return { drafts, blankSkipped };
}

/** Pure text → candidate lines (unit-testable, no OCR). */
export function parseInvoiceText(text: string, items: PickerItem[]): InvoiceParseResult {
  const header = parseHeader(text);
  const linesIn = text.replace(/\r/g, "").split("\n");
  const challan = parseChallanDrafts(linesIn);
  const drafts =
    challan?.drafts ??
    linesIn.flatMap((raw) => {
      const qtyMatch = QTY_DESC.exec(raw.trim());
      if (!qtyMatch) return [];
      const quantity = Number(qtyMatch[1] || qtyMatch[4]);
      const description = (qtyMatch[2] || qtyMatch[3] || "").trim();
      if (!description) return [];
      return [{ description, quantity, serials: extractPanelSerials(description) }];
    });
  const lines = drafts
    .map((draft, index) => finishDraft(draft, items, index + 1))
    .filter((line): line is InvoiceCandidateLine => Boolean(line));

  return {
    header,
    lines,
    rawTextPreview: text.slice(0, 800),
    blankSkipped: challan?.blankSkipped ?? 0,
  };
}

export async function extractTextFromPdf(file: File): Promise<{ text: string; usedOcr: boolean }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  type Item = { str?: string; transform?: number[] };
  const items = content.items as Item[];
  if (items.some((i) => Array.isArray(i.transform))) {
    const rows = new Map<number, string[]>();
    for (const it of items) {
      const y = Math.round((it.transform?.[5] ?? 0) / 4);
      const list = rows.get(y) ?? [];
      if (it.str) list.push(it.str);
      rows.set(y, list);
    }
    const lined = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(" ").trim())
      .filter(Boolean)
      .join("\n");
    if (lined.replace(/\s/g, "").length >= 40) return { text: lined, usedOcr: false };
  }

  const text = items
    .map((it) => it.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.replace(/\s/g, "").length < 40) {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the PDF page for OCR.");
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    } as Parameters<typeof page.render>[0]);
    await renderTask.promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render the PDF page.");
    const ocr = await extractTextFromImage(new File([blob], "page1.png", { type: "image/png" }));
    return { text: ocr, usedOcr: true };
  }

  return { text, usedOcr: false };
}

export async function extractTextFromImage(file: File): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng");
  try {
    // One challan page: keep line breaks so particulars and serial rows stay apart.
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const result = await worker.recognize(file);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromFile(file: File): Promise<{ text: string; usedOcr: boolean }> {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return extractTextFromPdf(file);
  if (type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name)) {
    return { text: await extractTextFromImage(file), usedOcr: true };
  }
  throw new Error("Upload a PDF or image (PNG, JPG, WEBP).");
}
