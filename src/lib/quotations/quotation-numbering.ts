export const NUMBERING_FORMATS = [
  "prefix_seq",
  "prefix_year_seq",
  "prefix_fy_seq",
  "prefix_ym_seq",
  "prefix_slash_year_seq",
  "prefix_date_seq",
] as const;

export type NumberingFormat = (typeof NUMBERING_FORMATS)[number];

export const NUMBERING_FORMAT_OPTIONS: {
  value: NumberingFormat;
  label: string;
  description: string;
  example: string;
}[] = [
  {
    value: "prefix_seq",
    label: "Continuous series",
    description: "Prefix + running number (never resets)",
    example: "QTN-0001",
  },
  {
    value: "prefix_year_seq",
    label: "Calendar year",
    description: "Resets every Jan 1 — common for corporate quoting",
    example: "QTN-2026-0001",
  },
  {
    value: "prefix_fy_seq",
    label: "Indian financial year",
    description: "Resets every Apr 1 (FY Apr–Mar) — GST / Tally style",
    example: "QTN-2526-0001",
  },
  {
    value: "prefix_ym_seq",
    label: "Year + month",
    description: "Resets each month — high-volume sales teams",
    example: "QTN-202607-0001",
  },
  {
    value: "prefix_slash_year_seq",
    label: "Slash / year series",
    description: "Classic Indian invoice style with slashes",
    example: "QTN/2026/0001",
  },
  {
    value: "prefix_date_seq",
    label: "Date series",
    description: "Includes full date; resets daily",
    example: "QTN-20260714-001",
  },
];

export type NumberingSettings = {
  quotation_prefix?: string | null;
  quotation_numbering_format?: string | null;
  quotation_next_number?: number | null;
  quotation_number_padding?: number | null;
  quotation_numbering_period?: string | null;
};

/** Indian FY label: Apr 2025–Mar 2026 → "2526" */
export function indianFinancialYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  const end = (start + 1) % 100;
  return `${String(start).slice(-2)}${String(end).padStart(2, "0")}`;
}

export function periodKeyForFormat(format: NumberingFormat, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  switch (format) {
    case "prefix_seq":
      return "all";
    case "prefix_year_seq":
    case "prefix_slash_year_seq":
      return String(y);
    case "prefix_fy_seq":
      return indianFinancialYear(date);
    case "prefix_ym_seq":
      return `${y}${m}`;
    case "prefix_date_seq":
      return `${y}${m}${d}`;
  }
}

export function formatQuotationNumber(opts: {
  prefix: string;
  format: NumberingFormat;
  sequence: number;
  padding: number;
  date?: Date;
}): string {
  const date = opts.date ?? new Date();
  const prefix = (opts.prefix || "QTN").trim() || "QTN";
  const pad = Math.min(6, Math.max(3, opts.padding || 4));
  const seq = String(Math.max(1, opts.sequence)).padStart(pad, "0");
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  switch (opts.format) {
    case "prefix_seq":
      return `${prefix}-${seq}`;
    case "prefix_year_seq":
      return `${prefix}-${y}-${seq}`;
    case "prefix_fy_seq":
      return `${prefix}-${indianFinancialYear(date)}-${seq}`;
    case "prefix_ym_seq":
      return `${prefix}-${y}${m}-${seq}`;
    case "prefix_slash_year_seq":
      return `${prefix}/${y}/${seq}`;
    case "prefix_date_seq":
      return `${prefix}-${y}${m}${d}-${seq}`;
  }
}

export function previewQuotationNumber(settings: NumberingSettings, date = new Date()): string {
  const format = (NUMBERING_FORMATS as readonly string[]).includes(settings.quotation_numbering_format ?? "")
    ? (settings.quotation_numbering_format as NumberingFormat)
    : "prefix_year_seq";
  const period = periodKeyForFormat(format, date);
  const storedPeriod = settings.quotation_numbering_period ?? period;
  const sequence = storedPeriod === period ? Number(settings.quotation_next_number ?? 1) : 1;

  return formatQuotationNumber({
    prefix: settings.quotation_prefix ?? "QTN",
    format,
    sequence,
    padding: Number(settings.quotation_number_padding ?? 4),
    date,
  });
}

export function isNumberingFormat(value: string): value is NumberingFormat {
  return (NUMBERING_FORMATS as readonly string[]).includes(value);
}
