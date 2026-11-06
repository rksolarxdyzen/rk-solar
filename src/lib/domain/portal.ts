import { SUBSIDY_TIMER_DAYS } from "@/lib/domain/workflow";

export function computeSubsidyDueAt(from: Date = new Date()) {
  const due = new Date(from.getTime());
  due.setDate(due.getDate() + SUBSIDY_TIMER_DAYS);
  return due;
}

export function isSubsidyTimerOverdue(input: {
  subsidy_timer_due_at?: string | null;
  subsidy_received_at?: string | null;
  now?: Date;
}) {
  if (input.subsidy_received_at) return false;
  if (!input.subsidy_timer_due_at) return false;
  const due = new Date(input.subsidy_timer_due_at).getTime();
  if (Number.isNaN(due)) return false;
  return (input.now ?? new Date()).getTime() >= due;
}

export function daysUntilSubsidyDue(dueAt: string | null | undefined, now = new Date()) {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return null;
  return Math.ceil((due - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** IST calendar day as ddMMyy for portal codes. */
export function portalCodeDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("day")}${get("month")}${get("year")}`;
}

export function buildRksoPortalCode(dayKey: string, seq: number): string {
  const n = Math.max(0, Math.min(999, Math.floor(seq)));
  return `RKSO${dayKey}${String(n).padStart(3, "0")}`;
}

/**
 * Sync fallback: RKSO + ddMMyy (IST) + random NNN.
 * Prefer `allocateNextPortalCode` / `issuePortalCode` at write time for daily sequence.
 */
export function generatePortalCode(now = new Date()): string {
  return buildRksoPortalCode(portalCodeDayKey(now), Math.floor(Math.random() * 1000));
}

/** Next RKSO{ddMMyy}{NNN} from existing codes that share today's prefix. */
export async function allocateNextPortalCode(
  listExistingWithPrefix: (prefix: string) => Promise<string[]>
): Promise<string> {
  const dayKey = portalCodeDayKey();
  const prefix = `RKSO${dayKey}`;
  const existing = (await listExistingWithPrefix(prefix)).map((c) => c.toUpperCase());
  let max = 0;
  for (const code of existing) {
    if (!code.startsWith(prefix)) continue;
    const nnn = code.slice(prefix.length);
    if (/^\d{3}$/.test(nnn)) max = Math.max(max, Number(nnn));
  }
  if (max < 999) {
    return buildRksoPortalCode(dayKey, max + 1);
  }
  for (let i = 0; i < 80; i++) {
    const candidate = buildRksoPortalCode(dayKey, Math.floor(Math.random() * 1000));
    if (!existing.includes(candidate)) return candidate;
  }
  throw new Error("Unable to allocate a unique portal code for today");
}

export function portalPath(code: string): string {
  return `/portal/${code.trim()}`;
}

export function portalAbsoluteUrl(code: string, origin?: string | null): string {
  const path = portalPath(code);
  const base = (origin ?? "").replace(/\/$/, "");
  if (base) return `${base}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export function whatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export function buildWhatsAppHref(phone: string, text?: string): string {
  const base = `https://wa.me/${whatsappDigits(phone)}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

export function portalInviteWhatsAppMessage(input: {
  customerName: string;
  phone: string;
  portalCode: string;
  portalUrl: string;
}): string {
  return [
    `Hello ${input.customerName.trim() || "Customer"},`,
    "",
    "Your RK Bhabhor customer portal is ready.",
    `Link: ${input.portalUrl}`,
    `Access code: ${input.portalCode}`,
    `Registered mobile: ${input.phone}`,
    "",
    "Open the link and sign in with this mobile number.",
  ].join("\n");
}

export function buildPortalInviteWhatsAppHref(input: {
  customerName: string;
  phone: string;
  portalCode: string;
  origin?: string | null;
}): string {
  const portalUrl = portalAbsoluteUrl(input.portalCode, input.origin);
  return buildWhatsAppHref(
    input.phone,
    portalInviteWhatsAppMessage({
      customerName: input.customerName,
      phone: input.phone,
      portalCode: input.portalCode,
      portalUrl,
    })
  );
}

export const PORTAL_DOC_TYPES = [
  "invoice",
  "self_declaration",
  "quote_pdf",
  "customer_upload",
  "survey_gps",
  "survey_roof",
  "survey_shadow",
  "survey_access",
  "electricity_bill",
  "customer_id",
  "feasibility_report",
  "other",
] as const;
export type PortalDocType = (typeof PORTAL_DOC_TYPES)[number];

export const PORTAL_DOC_LABELS: Record<PortalDocType, string> = {
  invoice: "Invoice",
  self_declaration: "Self-declaration",
  quote_pdf: "Quotation PDF",
  customer_upload: "Customer upload",
  survey_gps: "Survey — GPS site photo",
  survey_roof: "Survey — Roof / terrace",
  survey_shadow: "Survey — Shadow / obstacles",
  survey_access: "Survey — Access / structure",
  electricity_bill: "Electricity bill",
  customer_id: "Customer ID (Aadhaar / PAN / other)",
  feasibility_report: "Feasibility report",
  other: "Other document",
};

export type PortalDocument = {
  id: string;
  doc_type: string;
  title: string;
  file_url: string;
  created_at: string;
  uploaded_by_customer?: boolean;
};

export type PortalLead = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  city: string | null;
  address: string | null;
  sales_stage: string;
  portal_code: string | null;
  referrer_name?: string | null;
  referrer_phone?: string | null;
  meter_installed_at: string | null;
  subsidy_timer_due_at: string | null;
  subsidy_received_at: string | null;
  subsidy_verified_at: string | null;
  completion_certificate_url: string | null;
  installation_completed_at: string | null;
  accepted_quotation_id?: string | null;
  cleaning_next_due_at?: string | null;
  cleaning_last_sent_at?: string | null;
};

export type PortalTicket = {
  id: string;
  status: string;
  description: string;
  created_at: string;
  closed_at: string | null;
  resolution_notes: string | null;
  photos?: { id: string; file_url: string; caption: string | null }[] | null;
};

export type PortalSession = {
  lead: PortalLead;
  documents: PortalDocument[];
  quote: {
    id: string;
    quotation_no: string;
    grand_total: number | null;
    template_kind: string;
    status: string;
  } | null;
  payments: PortalPayment[];
  /** Accounts settlement discount (0 when none). */
  settlementDiscount: number;
  tickets: PortalTicket[];
  overdue: boolean;
};

export type PortalPayment = {
  milestone: string;
  amount: number;
  verification_status: string;
  paid_at: string | null;
};

export type PortalPaymentSummary = {
  projectTotal: number | null;
  paid: number;
  pending: number;
  remaining: number | null;
  discount: number;
};

export function summarizePortalPayments(
  grandTotal: number | null | undefined,
  payments: PortalPayment[],
  settlementDiscount = 0
): PortalPaymentSummary {
  const counted = payments.filter((p) => p.verification_status !== "rejected");
  const paid = counted.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = counted
    .filter((p) => p.verification_status === "pending")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const projectTotal =
    grandTotal == null || Number.isNaN(Number(grandTotal)) ? null : Number(grandTotal);
  const discount = Math.max(0, Number(settlementDiscount) || 0);
  const remaining =
    projectTotal == null
      ? null
      : Math.max(0, Math.round((projectTotal - discount - paid) * 100) / 100);
  return { projectTotal, paid, pending, remaining, discount };
}
