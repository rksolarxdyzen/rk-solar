import { createClient } from "@/lib/supabase/server";
import { hasAuthority } from "@/lib/auth";
import type { Profile } from "@/lib/domain/types";
import { CUSTOMER_SALES_STAGES, type SalesStage } from "@/lib/domain/workflow";
import { inRange, monthRange } from "@/lib/dashboard/metrics";
import {
  UNASSIGNED_REP_ID,
  salespersonId,
  canViewSalesRepReport,
  type SalesRepMonthlyFilters,
  type SalesRepMonthlyReport,
  type SalesRepMonthlyRow,
} from "@/lib/reports/sales-rep-monthly-types";

export {
  UNASSIGNED_REP_ID,
  salespersonId,
  canViewSalesRepReport,
  type SalesRepMonthlyFilters,
  type SalesRepMonthlyReport,
  type SalesRepMonthlyRow,
} from "@/lib/reports/sales-rep-monthly-types";

type LeadRow = {
  id: string;
  sales_stage: string;
  won_closed_at: string | null;
  accepted_quotation_id: string | null;
  assigned_telecaller_id: string | null;
  assigned_to: string | null;
};

export async function assertCanViewSalesRepReport(profile: Profile): Promise<void> {
  if (profile.role === "admin") return;
  if (await hasAuthority(profile.id, "full_access")) return;
  if (await hasAuthority(profile.id, "view_sales_rep_report")) return;
  throw new Error("Missing authority: view_sales_rep_report");
}

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

async function wonDatesFromAudit(
  companyId: string,
  leadIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (leadIds.length === 0) return map;
  const supabase = await createClient();
  const chunkSize = 200;
  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const chunk = leadIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from("audit_events")
      .select("lead_id, created_at, metadata")
      .eq("company_id", companyId)
      .eq("event_type", "stage_change")
      .in("lead_id", chunk)
      .order("created_at", { ascending: true });

    for (const row of data ?? []) {
      const to = (row.metadata as { to?: string } | null)?.to;
      if (to !== "quote_accepted" || !row.lead_id) continue;
      if (!map.has(row.lead_id)) {
        map.set(row.lead_id, row.created_at as string);
      }
    }
  }
  return map;
}

function emptyBucket(id: string, name: string): SalesRepMonthlyRow {
  return {
    salesRepId: id,
    salesRepName: name,
    closedDeals: 0,
    bookedValue: 0,
    paymentsRecorded: 0,
    paymentsVerified: 0,
  };
}

export async function collectSalesRepMonthlyReport(
  profile: Profile,
  filters: SalesRepMonthlyFilters
): Promise<SalesRepMonthlyReport> {
  await assertCanViewSalesRepReport(profile);

  const year = filters.year;
  const month = filters.month;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }

  const range = monthRange(new Date(year, month - 1, 15));
  const supabase = await createClient();
  const companyId = profile.company_id;

  const { data: leadData, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, sales_stage, won_closed_at, accepted_quotation_id, assigned_telecaller_id, assigned_to"
    )
    .eq("company_id", companyId);

  if (leadErr) throw new Error(leadErr.message);
  const leads = (leadData ?? []) as LeadRow[];
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const needsAudit = leads.filter(
    (l) =>
      !l.won_closed_at &&
      (l.sales_stage === "quote_accepted" ||
        CUSTOMER_SALES_STAGES.includes(l.sales_stage as SalesStage))
  );
  const auditWon = await wonDatesFromAudit(
    companyId,
    needsAudit.map((l) => l.id)
  );

  const closedInMonth = leads.filter((l) => {
    const at = l.won_closed_at ?? auditWon.get(l.id) ?? null;
    return at != null && inRange(at, range);
  });

  const quoteIds = [
    ...new Set(
      closedInMonth
        .map((l) => l.accepted_quotation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const quoteTotals = new Map<string, number>();
  if (quoteIds.length > 0) {
    const { data: quotes } = await supabase
      .from("quotations")
      .select("id, grand_total, lead_id, status")
      .eq("company_id", companyId)
      .in("id", quoteIds);
    for (const q of quotes ?? []) {
      quoteTotals.set(q.id as string, Number(q.grand_total) || 0);
    }
  }

  // Fallback: latest accepted quote per closed lead without accepted_quotation_id
  const missingQuoteLeads = closedInMonth
    .filter((l) => !l.accepted_quotation_id)
    .map((l) => l.id);
  const acceptedByLead = new Map<string, number>();
  if (missingQuoteLeads.length > 0) {
    const { data: accepted } = await supabase
      .from("quotations")
      .select("lead_id, grand_total, created_at")
      .eq("company_id", companyId)
      .eq("status", "accepted")
      .in("lead_id", missingQuoteLeads)
      .order("created_at", { ascending: false });
    for (const q of accepted ?? []) {
      const lid = q.lead_id as string | null;
      if (!lid || acceptedByLead.has(lid)) continue;
      acceptedByLead.set(lid, Number(q.grand_total) || 0);
    }
  }

  const { data: payData, error: payErr } = await supabase
    .from("payments")
    .select(
      "id, lead_id, amount, verification_status, paid_at, created_at, verified_at"
    )
    .eq("company_id", companyId);

  if (payErr) throw new Error(payErr.message);

  const paymentsInMonth = (payData ?? []).filter((p) => {
    const when = (p.paid_at as string | null) ?? (p.created_at as string | null);
    return inRange(when, range);
  });

  const buckets = new Map<string, SalesRepMonthlyRow>();

  const ensure = (id: string, nameHint?: string) => {
    let row = buckets.get(id);
    if (!row) {
      row = emptyBucket(
        id,
        id === UNASSIGNED_REP_ID ? "Unassigned" : nameHint ?? "Unknown"
      );
      buckets.set(id, row);
    }
    return row;
  };

  for (const lead of closedInMonth) {
    const id = salespersonId(lead);
    const row = ensure(id);
    row.closedDeals += 1;
    if (lead.accepted_quotation_id) {
      row.bookedValue += quoteTotals.get(lead.accepted_quotation_id) ?? 0;
    } else {
      row.bookedValue += acceptedByLead.get(lead.id) ?? 0;
    }
  }

  for (const p of paymentsInMonth) {
    const lead = p.lead_id ? leadById.get(p.lead_id as string) : undefined;
    const id = lead ? salespersonId(lead) : UNASSIGNED_REP_ID;
    const row = ensure(id);
    const amt = Number(p.amount) || 0;
    row.paymentsRecorded += amt;
    if (p.verification_status === "verified") {
      row.paymentsVerified += amt;
    }
  }

  const repIds = [...buckets.keys()].filter((id) => id !== UNASSIGNED_REP_ID);
  if (repIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", repIds);
    for (const p of profiles ?? []) {
      const row = buckets.get(p.id as string);
      if (row) {
        row.salesRepName = (p.name as string)?.trim() || "Unknown";
      }
    }
  }

  let rows = [...buckets.values()].sort((a, b) => {
    if (a.salesRepId === UNASSIGNED_REP_ID) return 1;
    if (b.salesRepId === UNASSIGNED_REP_ID) return -1;
    return (
      b.closedDeals - a.closedDeals ||
      b.paymentsRecorded - a.paymentsRecorded ||
      a.salesRepName.localeCompare(b.salesRepName)
    );
  });

  const filterRep = filters.salesRepId?.trim();
  if (filterRep && filterRep !== "all") {
    rows = rows.filter((r) => r.salesRepId === filterRep);
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.closedDeals += r.closedDeals;
      acc.bookedValue += r.bookedValue;
      acc.paymentsRecorded += r.paymentsRecorded;
      acc.paymentsVerified += r.paymentsVerified;
      return acc;
    },
    {
      closedDeals: 0,
      bookedValue: 0,
      paymentsRecorded: 0,
      paymentsVerified: 0,
    }
  );

  return {
    year,
    month,
    rangeLabel: monthLabel(year, month),
    rows,
    totals,
  };
}
