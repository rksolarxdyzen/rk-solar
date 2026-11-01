import { createClient } from "@/lib/supabase/server";
import { hasAuthority } from "@/lib/auth";
import type { Profile } from "@/lib/domain/types";
import { CUSTOMER_SALES_STAGES, type SalesStage } from "@/lib/domain/workflow";
import { inRange, monthRange } from "@/lib/dashboard/metrics";
import {
  UNASSIGNED_DEALER_ID,
  dealerOwnerId,
  canViewDealerMonthlyReport,
  type DealerMonthlyFilters,
  type DealerMonthlyReport,
  type DealerMonthlyRow,
} from "@/lib/reports/dealer-monthly-types";

export {
  UNASSIGNED_DEALER_ID,
  dealerOwnerId,
  canViewDealerMonthlyReport,
  type DealerMonthlyFilters,
  type DealerMonthlyReport,
  type DealerMonthlyRow,
} from "@/lib/reports/dealer-monthly-types";

type LeadRow = {
  id: string;
  sales_stage: string;
  created_at: string;
  won_closed_at: string | null;
  accepted_quotation_id: string | null;
  dealer_id: string | null;
  created_by: string | null;
};

export async function assertCanViewDealerMonthlyReport(profile: Profile): Promise<void> {
  if (profile.role === "admin") return;
  if (await hasAuthority(profile.id, "full_access")) return;
  if (await hasAuthority(profile.id, "view_dealer_monthly_report")) return;
  if (profile.role === "accounts" || profile.role === "sales_manager") return;
  if (await hasAuthority(profile.id, "assign_dealer")) return;
  if (await hasAuthority(profile.id, "approve_dealer_commission")) return;
  throw new Error("Missing authority: view_dealer_monthly_report");
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
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

function emptyBucket(id: string, name: string): DealerMonthlyRow {
  return {
    dealerId: id,
    dealerName: name,
    leadsSubmitted: 0,
    filesWon: 0,
    quotationsSubmitted: 0,
    bookedValue: 0,
  };
}

export async function collectDealerMonthlyReport(
  profile: Profile,
  filters: DealerMonthlyFilters
): Promise<DealerMonthlyReport> {
  await assertCanViewDealerMonthlyReport(profile);

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

  const { data: dealerProfiles, error: dealerErr } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("company_id", companyId)
    .eq("role", "dealer");
  if (dealerErr) throw new Error(dealerErr.message);

  const dealerIds = new Set((dealerProfiles ?? []).map((d) => d.id as string));
  const dealerNames = new Map(
    (dealerProfiles ?? []).map((d) => [
      d.id as string,
      ((d.name as string) ?? "").trim() || "Unknown dealer",
    ])
  );

  const selectCols =
    "id, sales_stage, created_at, won_closed_at, accepted_quotation_id, dealer_id, created_by";

  const { data: byDealerId, error: byDealerErr } = await supabase
    .from("leads")
    .select(selectCols)
    .eq("company_id", companyId)
    .not("dealer_id", "is", null);
  if (byDealerErr) throw new Error(byDealerErr.message);

  const byCreator =
    dealerIds.size > 0
      ? await supabase
          .from("leads")
          .select(selectCols)
          .eq("company_id", companyId)
          .in("created_by", [...dealerIds])
      : { data: [] as LeadRow[], error: null as null };
  if (byCreator.error) throw new Error(byCreator.error.message);

  const merged = new Map<string, LeadRow>();
  for (const row of [
    ...((byDealerId ?? []) as LeadRow[]),
    ...((byCreator.data ?? []) as LeadRow[]),
  ]) {
    merged.set(row.id, row);
  }
  const leads = [...merged.values()];

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

  const buckets = new Map<string, DealerMonthlyRow>();
  const ensure = (id: string) => {
    let row = buckets.get(id);
    if (!row) {
      row = emptyBucket(
        id,
        id === UNASSIGNED_DEALER_ID
          ? "Unassigned / no dealer"
          : dealerNames.get(id) ?? "Unknown dealer"
      );
      buckets.set(id, row);
    }
    return row;
  };

  const wonInMonth: LeadRow[] = [];

  for (const lead of leads) {
    const owner = dealerOwnerId(lead, dealerIds);
    if (owner === UNASSIGNED_DEALER_ID) continue;

    if (inRange(lead.created_at, range)) {
      ensure(owner).leadsSubmitted += 1;
    }
    const wonAt = lead.won_closed_at ?? auditWon.get(lead.id) ?? null;
    if (wonAt && inRange(wonAt, range)) {
      ensure(owner).filesWon += 1;
      wonInMonth.push(lead);
    }
  }

  const quoteIds = [
    ...new Set(
      wonInMonth
        .map((l) => l.accepted_quotation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const quoteTotals = new Map<string, number>();
  if (quoteIds.length > 0) {
    const { data: quotes } = await supabase
      .from("quotations")
      .select("id, grand_total")
      .eq("company_id", companyId)
      .in("id", quoteIds);
    for (const q of quotes ?? []) {
      quoteTotals.set(q.id as string, Number(q.grand_total) || 0);
    }
  }

  for (const lead of wonInMonth) {
    const owner = dealerOwnerId(lead, dealerIds);
    if (owner === UNASSIGNED_DEALER_ID) continue;
    const row = ensure(owner);
    if (lead.accepted_quotation_id) {
      row.bookedValue += quoteTotals.get(lead.accepted_quotation_id) ?? 0;
    }
  }

  const leadOwnerById = new Map(
    leads.map((l) => [l.id, dealerOwnerId(l, dealerIds)] as const)
  );

  const { data: quoteRows, error: quoteErr } = await supabase
    .from("quotations")
    .select("id, lead_id, created_by, created_at")
    .eq("company_id", companyId)
    .gte("created_at", range.start.toISOString())
    .lte("created_at", range.end.toISOString());
  if (quoteErr) throw new Error(quoteErr.message);

  for (const q of quoteRows ?? []) {
    const createdBy = q.created_by as string | null;
    const leadId = q.lead_id as string | null;
    let owner = UNASSIGNED_DEALER_ID;
    if (createdBy && dealerIds.has(createdBy)) owner = createdBy;
    else if (leadId && leadOwnerById.has(leadId)) {
      const fromLead = leadOwnerById.get(leadId)!;
      if (fromLead !== UNASSIGNED_DEALER_ID) owner = fromLead;
    }
    if (owner === UNASSIGNED_DEALER_ID) continue;
    ensure(owner).quotationsSubmitted += 1;
  }

  const missingNames = [...buckets.keys()].filter(
    (id) => id !== UNASSIGNED_DEALER_ID && !dealerNames.has(id)
  );
  if (missingNames.length > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", missingNames);
    for (const p of names ?? []) {
      const row = buckets.get(p.id as string);
      if (row) row.dealerName = ((p.name as string) ?? "").trim() || "Unknown dealer";
    }
  }

  let rows = [...buckets.values()].sort((a, b) => {
    if (a.dealerId === UNASSIGNED_DEALER_ID) return 1;
    if (b.dealerId === UNASSIGNED_DEALER_ID) return -1;
    return (
      b.leadsSubmitted - a.leadsSubmitted ||
      b.filesWon - a.filesWon ||
      a.dealerName.localeCompare(b.dealerName)
    );
  });

  const filterDealer = filters.dealerId?.trim();
  if (filterDealer && filterDealer !== "all") {
    rows = rows.filter((r) => r.dealerId === filterDealer);
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.leadsSubmitted += r.leadsSubmitted;
      acc.filesWon += r.filesWon;
      acc.quotationsSubmitted += r.quotationsSubmitted;
      acc.bookedValue += r.bookedValue;
      return acc;
    },
    {
      leadsSubmitted: 0,
      filesWon: 0,
      quotationsSubmitted: 0,
      bookedValue: 0,
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
