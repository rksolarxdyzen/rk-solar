"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import {
  CUSTOMER_SALES_STAGES,
  SALES_STAGE_LABELS,
  type SalesStage,
} from "@/lib/domain/workflow";
import {
  applySettlementDiscount,
  companySubsidyPendingAmount,
  milestoneRemaining,
  sumVerifiedByMilestone,
} from "@/lib/accounts/receivables-math";
import { loadSettlementDiscounts } from "@/lib/accounts/settlement-discount";
import { canSeeAllCustomers } from "@/lib/leads/visibility-server";
import type { Profile } from "@/lib/domain/types";

export type ReceivableRow = {
  leadId: string;
  name: string;
  phone: string;
  city: string | null;
  portalCode: string | null;
  salesStage: string;
  salesStageLabel: string;
  consumerNumber: string | null;
  tokenReceived: number;
  preDispatchReceived: number;
  finalReceived: number;
  subsidyReceived: number;
  totalReceived: number;
  tokenRemaining: number;
  preDispatchRemaining: number;
  finalRemaining: number;
  subsidyPending: number;
  totalPending: number;
  /** Accounts settlement discount already taken off the pending amounts. */
  discountAmount: number;
  discountReason: string | null;
  salespersonId: string | null;
  salespersonName: string | null;
  telecallerName: string | null;
  surveyorName: string | null;
};

function joinName(
  raw: { name?: string } | { name?: string }[] | null | undefined
): string | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0]?.name ?? null : raw.name ?? null;
}

async function canViewReceivables(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "accounts" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_payment_queues")) ||
    (await hasAuthority(profile.id, "verify_payment")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

/** Home Accounts finance KPIs — not bare record_payment / view_payment_queues. */
async function canCompanyFinanceDashboard(profile: Profile) {
  if (
    profile.role === "admin" ||
    profile.role === "accounts" ||
    profile.role === "sales_manager"
  ) {
    return true;
  }
  if (await hasAuthority(profile.id, "full_access")) return true;
  if (await hasAuthority(profile.id, "verify_payment")) return true;
  if (await hasAuthority(profile.id, "view_reports")) return true;
  return canSeeAllCustomers(profile);
}

export async function listAccountsReceivables(): Promise<ReceivableRow[]> {
  const profile = await requireAuth();
  if (!(await canViewReceivables(profile))) {
    throw new Error("Missing authority to view receivables");
  }

  const supabase = await createClient();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      `
      id, name, phone, city, portal_code, sales_stage, consumer_number,
      assigned_to, assigned_telecaller_id,
      won_token_amount, won_pre_dispatch_amount, won_final_amount,
      company_bears_subsidy, subsidy_amount_at_won, subsidy_verified_at,
      telecaller_profile:profiles!leads_assigned_telecaller_id_fkey(id, name),
      assigned_profile:profiles!leads_assigned_to_fkey(id, name),
      surveyor_profile:profiles!leads_assigned_surveyor_id_fkey(name)
    `
    )
    .eq("company_id", profile.company_id)
    .in("sales_stage", [...CUSTOMER_SALES_STAGES])
    .order("updated_at", { ascending: false });

  if (error) {
    if (/company_bears_subsidy|consumer_number|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing Won consumer/subsidy columns. Run supabase/migrations/045_won_consumer_subsidy.sql."
      );
    }
    throw new Error(error.message);
  }

  const leadRows = leads ?? [];
  if (leadRows.length === 0) return [];

  const ids = leadRows.map((l) => l.id);
  const { data: payments } = await supabase
    .from("payments")
    .select("lead_id, milestone, amount, verification_status")
    .eq("company_id", profile.company_id)
    .in("lead_id", ids);

  const discounts = await loadSettlementDiscounts(supabase, ids);

  const paysByLead = new Map<string, typeof payments>();
  for (const p of payments ?? []) {
    const list = paysByLead.get(p.lead_id) ?? [];
    list.push(p);
    paysByLead.set(p.lead_id, list);
  }

  const rows: ReceivableRow[] = [];
  for (const lead of leadRows) {
    const pays = paysByLead.get(lead.id) ?? [];
    const verified = sumVerifiedByMilestone(
      pays.map((p) => ({
        milestone: p.milestone,
        amount: Number(p.amount) || 0,
        verification_status: p.verification_status,
      }))
    );
    const discount = discounts.get(lead.id);
    const discountAmount = discount?.amount ?? 0;
    const {
      token: tokenRemaining,
      pre_dispatch: preDispatchRemaining,
      final: finalRemaining,
    } = applySettlementDiscount(
      {
        token: milestoneRemaining(Number(lead.won_token_amount) || 0, verified.token),
        pre_dispatch: milestoneRemaining(
          Number(lead.won_pre_dispatch_amount) || 0,
          verified.pre_dispatch
        ),
        final: milestoneRemaining(Number(lead.won_final_amount) || 0, verified.final),
      },
      discountAmount
    );
    const subsidyPending = companySubsidyPendingAmount({
      companyBearsSubsidy: lead.company_bears_subsidy === true,
      subsidyAmountAtWon: lead.subsidy_amount_at_won,
      subsidyVerifiedAt: lead.subsidy_verified_at,
    });
    const subsidyReceived =
      lead.company_bears_subsidy === true && lead.subsidy_verified_at
        ? Math.max(0, Number(lead.subsidy_amount_at_won) || 0)
        : 0;
    const totalPending =
      tokenRemaining + preDispatchRemaining + finalRemaining + subsidyPending;
    const totalReceived =
      verified.token + verified.pre_dispatch + verified.final + subsidyReceived;

    const teleName = joinName(
      lead.telecaller_profile as { name?: string } | { name?: string }[] | null
    );
    const assignedName = joinName(
      lead.assigned_profile as { name?: string } | { name?: string }[] | null
    );
    const survName = joinName(
      lead.surveyor_profile as { name?: string } | { name?: string }[] | null
    );
    const salespersonName = teleName ?? assignedName;
    const salespersonId =
      (lead.assigned_telecaller_id as string | null) ??
      (lead.assigned_to as string | null) ??
      null;

    rows.push({
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      portalCode: lead.portal_code,
      salesStage: lead.sales_stage,
      salesStageLabel:
        SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ?? lead.sales_stage,
      consumerNumber: lead.consumer_number ?? null,
      tokenReceived: verified.token,
      preDispatchReceived: verified.pre_dispatch,
      finalReceived: verified.final,
      subsidyReceived,
      totalReceived,
      tokenRemaining,
      preDispatchRemaining,
      finalRemaining,
      subsidyPending,
      totalPending,
      discountAmount,
      discountReason: discount?.reason ?? null,
      salespersonId,
      salespersonName,
      telecallerName: teleName,
      surveyorName: survName,
    });
  }

  rows.sort((a, b) => {
    if (b.totalPending !== a.totalPending) return b.totalPending - a.totalPending;
    return a.name.localeCompare(b.name, "en");
  });
  return rows;
}

export type AccountsFinanceSnapshot = {
  pendingCustomers: number;
  pendingToken: { count: number; amount: number };
  pendingPreDispatch: { count: number; amount: number };
  pendingFinal: { count: number; amount: number };
  pendingSubsidy: { count: number; amount: number };
  collectedMtd: { token: number; pre_dispatch: number; final: number };
  dealerShortlyDue: number;
  dealerPaidMonth: number;
  avgPaidPerFile: number | null;
  avgPaidPerDealer: number | null;
};

export async function getAccountsFinanceSnapshot(): Promise<AccountsFinanceSnapshot> {
  const profile = await requireAuth();
  if (!(await canCompanyFinanceDashboard(profile))) {
    throw new Error("Missing authority for company finance dashboard");
  }

  const receivables = await listAccountsReceivables();
  const pendingToken = { count: 0, amount: 0 };
  const pendingPreDispatch = { count: 0, amount: 0 };
  const pendingFinal = { count: 0, amount: 0 };
  const pendingSubsidy = { count: 0, amount: 0 };
  let pendingCustomers = 0;
  for (const row of receivables) {
    if (row.totalPending > 0) pendingCustomers += 1;
    if (row.tokenRemaining > 0) {
      pendingToken.count += 1;
      pendingToken.amount += row.tokenRemaining;
    }
    if (row.preDispatchRemaining > 0) {
      pendingPreDispatch.count += 1;
      pendingPreDispatch.amount += row.preDispatchRemaining;
    }
    if (row.finalRemaining > 0) {
      pendingFinal.count += 1;
      pendingFinal.amount += row.finalRemaining;
    }
    if (row.subsidyPending > 0) {
      pendingSubsidy.count += 1;
      pendingSubsidy.amount += row.subsidyPending;
    }
  }

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  const { data: mtdPays } = await supabase
    .from("payments")
    .select("milestone, amount, verification_status, verified_at")
    .eq("company_id", profile.company_id)
    .eq("verification_status", "verified")
    .gte("verified_at", monthStart)
    .lte("verified_at", monthEnd);

  const collectedMtd = { token: 0, pre_dispatch: 0, final: 0 };
  for (const p of mtdPays ?? []) {
    const amt = Number(p.amount) || 0;
    if (p.milestone === "token") collectedMtd.token += amt;
    else if (p.milestone === "pre_dispatch") collectedMtd.pre_dispatch += amt;
    else if (p.milestone === "final") collectedMtd.final += amt;
  }

  const dealerStats = await computeDealerPayoutStats(profile.company_id, monthStart, monthEnd);

  return {
    pendingCustomers,
    pendingToken,
    pendingPreDispatch,
    pendingFinal,
    pendingSubsidy,
    collectedMtd,
    dealerShortlyDue: dealerStats.shortlyDue,
    dealerPaidMonth: dealerStats.paidMonth,
    avgPaidPerFile: dealerStats.avgPerFile,
    avgPaidPerDealer: dealerStats.avgPerDealer,
  };
}

async function computeDealerPayoutStats(
  companyId: string,
  monthStart: string,
  monthEnd: string
) {
  const supabase = await createClient();

  const { data: pdPays } = await supabase
    .from("payments")
    .select("lead_id")
    .eq("company_id", companyId)
    .eq("milestone", "pre_dispatch")
    .eq("verification_status", "verified");

  const pdLeadIds = [...new Set((pdPays ?? []).map((p) => p.lead_id))];

  const { data: commissions } = await supabase
    .from("dealer_commissions")
    .select("id, lead_id, dealer_id, amount_inr, status, reviewed_at")
    .eq("company_id", companyId);

  const commissionByLead = new Map(
    (commissions ?? []).map((c) => [c.lead_id, c] as const)
  );

  let shortlyDue = 0;
  if (pdLeadIds.length > 0) {
    const { data: dealerLeads } = await supabase
      .from("leads")
      .select("id, dealer_id")
      .eq("company_id", companyId)
      .in("id", pdLeadIds)
      .not("dealer_id", "is", null);

    for (const lead of dealerLeads ?? []) {
      const c = commissionByLead.get(lead.id);
      if (!c || c.status === "pending") {
        shortlyDue += Number(c?.amount_inr) || 0;
      }
    }
  }

  const paidMonthRows = (commissions ?? []).filter(
    (c) =>
      c.status === "approved" &&
      c.reviewed_at &&
      c.reviewed_at >= monthStart &&
      c.reviewed_at <= monthEnd
  );
  const paidMonth = paidMonthRows.reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);
  const fileIds = new Set(paidMonthRows.map((c) => c.lead_id));
  const dealerIds = new Set(paidMonthRows.map((c) => c.dealer_id));

  return {
    shortlyDue,
    paidMonth,
    avgPerFile: fileIds.size > 0 ? Math.round((paidMonth / fileIds.size) * 100) / 100 : null,
    avgPerDealer:
      dealerIds.size > 0 ? Math.round((paidMonth / dealerIds.size) * 100) / 100 : null,
  };
}
