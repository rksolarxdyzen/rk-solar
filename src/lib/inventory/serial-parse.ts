import type { SerialScanMode } from "@/lib/inventory/types";

/** Same rules as SQL normalize_serial(): drop control chars and whitespace, uppercase. */
export function normalizeSerial(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, "").toUpperCase();
  return cleaned || null;
}

export type ParseSource = "whole" | "pattern" | "label" | "url_param" | "url_path" | "none";

export interface ParsedScan {
  raw: string;
  serial: string | null;
  source: ParseSource;
  /** Candidate parts to pick from when nothing matched (extract mode). */
  segments: string[];
}

const LABEL_RE = /(?:^|[\s;,|&?])(?:S\/N|SN|SERIAL(?:\s*NO\.?|\s*NUMBER|NO)?)\s*[:=#\s]\s*([A-Z0-9][A-Z0-9\-_/.]{3,})/i;

export const SERIAL_PATTERN_PRESETS: { label: string; pattern: string; hint: string }[] = [
  { label: "SN: field", pattern: String.raw`(?:S\/N|SN|SERIAL(?:NO)?)\s*[:=]\s*([A-Z0-9\-]+)`, hint: "MODEL:X SN:ABC123 → ABC123" },
  { label: "URL ?sn=", pattern: String.raw`[?&](?:sn|serial)=([^&#\s]+)`, hint: "https://brand.com/v?sn=ABC123 → ABC123" },
  { label: "Last URL segment", pattern: String.raw`\/([A-Z0-9\-]{6,})\/?(?:[?#].*)?$`, hint: "https://brand.com/p/ABC123 → ABC123" },
];

function splitSegments(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s;,|\t\r\n]+/)
        .flatMap((part) => part.split(/[:=]/))
        .map((p) => p.trim())
        .filter((p) => p.length >= 4 && /[0-9]/.test(p))
    ),
  ].slice(0, 20);
}

function tryUrl(raw: string): { serial: string; source: ParseSource } | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    for (const key of ["sn", "serial", "serialno", "serial_no", "s"]) {
      for (const [k, v] of url.searchParams) {
        if (k.toLowerCase() === key && v.trim()) return { serial: v, source: "url_param" };
      }
    }
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && last.length >= 4) return { serial: decodeURIComponent(last), source: "url_path" };
  } catch {
    return null;
  }
  return null;
}

/** Turn one scanner burst into a serial, following the item's scan mode (plan §7.3). */
export function parseScan(raw: string, mode: SerialScanMode, pattern?: string | null): ParsedScan {
  const text = raw.replace(/\r/g, "").trim();
  if (mode === "whole") {
    return { raw: text, serial: normalizeSerial(text), source: text ? "whole" : "none", segments: [] };
  }

  if (pattern) {
    try {
      const m = new RegExp(pattern, "i").exec(text);
      const hit = m?.[1] ?? m?.[0];
      if (hit && normalizeSerial(hit)) return { raw: text, serial: normalizeSerial(hit), source: "pattern", segments: [] };
    } catch {
      // Invalid pattern: fall through to the built-in rules.
    }
  }

  const label = LABEL_RE.exec(text);
  if (label?.[1]) return { raw: text, serial: normalizeSerial(label[1]), source: "label", segments: [] };

  const url = tryUrl(text);
  if (url) return { raw: text, serial: normalizeSerial(url.serial), source: url.source, segments: [] };

  // A single token with no separators is treated as the serial itself.
  if (text && !/[\s;,|:=]/.test(text)) {
    return { raw: text, serial: normalizeSerial(text), source: "whole", segments: [] };
  }

  return { raw: text, serial: null, source: "none", segments: splitSegments(text) };
}

export function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}
