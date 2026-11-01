import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency } from "@/lib/utils";
import { inWindow, type DayWindow } from "@/lib/reports/day-window";

export type EmployeePerfRow = {
  profileId: string;
  name: string;
  role: string;
  assignedLeads: number;
  uncontactedNew: number;
  callsToday: number;
  visitsCompletedToday: number;
  revenueToday: number;
};

export type DailyReportMetrics = {
  companyId: string;
  companyName: string;
  dateKey: string;
  dateLabel: string;
  leadsReachedToday: number;
  newUncontacted: number;
  surveysCompletedToday: number;
  quotationsSentToday: number;
  revenueToday: number;
  cashCollectedToday: number;
  installationsCompletedToday: number;
  ticketsOpenedToday: number;
  ticketsClosedToday: number;
  ticketsOpenTotal: number;
  employees: EmployeePerfRow[];
};

function money(n: number) {
  return formatCurrency(n);
}

export async function collectDailyReportMetrics(
  admin: SupabaseClient,
  company: { id: string; name: string },
  window: DayWindow
): Promise<DailyReportMetrics> {
  const companyId = company.id;
  const startIso = window.start.toISOString();
  const endIso = window.end.toISOString();

  const [
    leadsRes,
    callsRes,
    surveysRes,
    quotesRes,
    paymentsRes,
    ticketsRes,
    profilesRes,
    auditWonRes,
  ] = await Promise.all([
    admin
      .from("leads")
      .select(
        `id, name, sales_stage, created_at, won_closed_at, accepted_quotation_id,
         assigned_telecaller_id, assigned_surveyor_id, assigned_to,
         installation_completed_at`
      )
      .eq("company_id", companyId),
    admin
      .from("call_logs")
      .select("id, lead_id, user_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    admin
      .from("surveys")
      .select("id, lead_id, surveyed_by, completed_at, created_at, updated_at")
      .eq("company_id", companyId)
      .gte("completed_at", startIso)
      .lte("completed_at", endIso),
    admin
      .from("quotations")
      .select("id, lead_id, customer_phone, grand_total, status, created_at, created_by, updated_at")
      .eq("company_id", companyId)
      .in("status", ["sent", "accepted"])
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    admin
      .from("payments")
      .select("id, amount, verification_status, verified_at, paid_at")
      .eq("company_id", companyId)
      .eq("verification_status", "verified"),
    admin
      .from("service_tickets")
      .select("id, status, created_at, updated_at, lead_id")
      .eq("company_id", companyId),
    admin
      .from("profiles")
      .select("id, name, role, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("role", ["tele_caller", "sales_executive", "surveyor", "sales_manager"]),
    admin
      .from("audit_events")
      .select("lead_id, created_at, metadata, actor_id")
      .eq("company_id", companyId)
      .eq("event_type", "stage_change")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  const leads = leadsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const surveys = surveysRes.data ?? [];
  const quotes = quotesRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const leadsReachedToday = new Set(calls.map((c) => c.lead_id).filter(Boolean)).size;
  const newUncontacted = leads.filter((l) => l.sales_stage === "new_lead").length;
  const surveysCompletedToday = surveys.length;

  // Quotations sent today — dedupe max 1 per customer/lead
  const quoteLeadKeys = new Set<string>();
  for (const q of quotes) {
    quoteLeadKeys.add(q.lead_id || `phone:${q.customer_phone ?? q.id}`);
  }
  const quotationsSentToday = quoteLeadKeys.size;

  // Won today: won_closed_at in window OR audit to quote_accepted today
  const wonLeadIds = new Set<string>();
  for (const l of leads) {
    if (inWindow(l.won_closed_at, window)) wonLeadIds.add(l.id);
  }
  for (const row of auditWonRes.data ?? []) {
    const to = (row.metadata as { to?: string } | null)?.to;
    if (to === "quote_accepted" && row.lead_id) wonLeadIds.add(row.lead_id);
  }

  const quoteTotals = new Map<string, number>();
  const acceptedIds = leads
    .filter((l) => wonLeadIds.has(l.id) && l.accepted_quotation_id)
    .map((l) => l.accepted_quotation_id as string);

  if (acceptedIds.length > 0) {
    const { data: acceptedQuotes } = await admin
      .from("quotations")
      .select("id, grand_total")
      .eq("company_id", companyId)
      .in("id", acceptedIds);
    for (const q of acceptedQuotes ?? []) {
      quoteTotals.set(q.id, Number(q.grand_total) || 0);
    }
  }

  const missingWon = [...wonLeadIds].filter((id) => {
    const lead = leads.find((l) => l.id === id);
    return lead && !lead.accepted_quotation_id;
  });
  const acceptedByLead = new Map<string, number>();
  if (missingWon.length > 0) {
    const { data } = await admin
      .from("quotations")
      .select("lead_id, grand_total, status, updated_at")
      .eq("company_id", companyId)
      .in("lead_id", missingWon)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false });
    for (const q of data ?? []) {
      if (!q.lead_id || acceptedByLead.has(q.lead_id)) continue;
      acceptedByLead.set(q.lead_id, Number(q.grand_total) || 0);
    }
  }

  let revenueToday = 0;
  for (const id of wonLeadIds) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) continue;
    if (lead.accepted_quotation_id && quoteTotals.has(lead.accepted_quotation_id)) {
      revenueToday += quoteTotals.get(lead.accepted_quotation_id) ?? 0;
    } else {
      revenueToday += acceptedByLead.get(id) ?? 0;
    }
  }

  let cashCollectedToday = 0;
  for (const p of paymentsRes.data ?? []) {
    const when = p.verified_at || (p.paid_at ? `${p.paid_at}T12:00:00+05:30` : null);
    if (inWindow(when, window)) cashCollectedToday += Number(p.amount) || 0;
  }

  const installationsCompletedToday = leads.filter((l) =>
    inWindow(l.installation_completed_at, window)
  ).length;

  const ticketsOpenedToday = tickets.filter((t) => inWindow(t.created_at, window)).length;
  const ticketsClosedToday = tickets.filter(
    (t) => t.status === "closed" && inWindow(t.updated_at, window)
  ).length;
  const ticketsOpenTotal = tickets.filter((t) =>
    ["raised", "accepted", "in_progress"].includes(t.status)
  ).length;

  // Employee performance
  const callsByUser = new Map<string, number>();
  for (const c of calls) {
    if (!c.user_id) continue;
    callsByUser.set(c.user_id, (callsByUser.get(c.user_id) ?? 0) + 1);
  }

  const visitsBySurveyor = new Map<string, number>();
  for (const s of surveys) {
    const who = s.surveyed_by;
    if (!who) continue;
    visitsBySurveyor.set(who, (visitsBySurveyor.get(who) ?? 0) + 1);
  }

  const revenueByTelecaller = new Map<string, number>();
  for (const id of wonLeadIds) {
    const lead = leads.find((l) => l.id === id);
    if (!lead?.assigned_telecaller_id) continue;
    let amt = 0;
    if (lead.accepted_quotation_id && quoteTotals.has(lead.accepted_quotation_id)) {
      amt = quoteTotals.get(lead.accepted_quotation_id) ?? 0;
    } else {
      amt = acceptedByLead.get(id) ?? 0;
    }
    revenueByTelecaller.set(
      lead.assigned_telecaller_id,
      (revenueByTelecaller.get(lead.assigned_telecaller_id) ?? 0) + amt
    );
  }

  const employees: EmployeePerfRow[] = profiles.map((p) => {
    const assignedLeads = leads.filter(
      (l) =>
        l.assigned_telecaller_id === p.id ||
        l.assigned_surveyor_id === p.id ||
        l.assigned_to === p.id
    ).length;
    const uncontactedNew = leads.filter(
      (l) =>
        l.sales_stage === "new_lead" &&
        (l.assigned_telecaller_id === p.id || l.assigned_to === p.id)
    ).length;

    return {
      profileId: p.id,
      name: p.name,
      role: p.role,
      assignedLeads,
      uncontactedNew,
      callsToday: callsByUser.get(p.id) ?? 0,
      visitsCompletedToday: visitsBySurveyor.get(p.id) ?? 0,
      revenueToday: revenueByTelecaller.get(p.id) ?? 0,
    };
  });

  employees.sort((a, b) => b.revenueToday - a.revenueToday || a.name.localeCompare(b.name));

  return {
    companyId,
    companyName: company.name,
    dateKey: window.dateKey,
    dateLabel: window.label,
    leadsReachedToday,
    newUncontacted,
    surveysCompletedToday,
    quotationsSentToday,
    revenueToday,
    cashCollectedToday,
    installationsCompletedToday,
    ticketsOpenedToday,
    ticketsClosedToday,
    ticketsOpenTotal,
    employees,
  };
}

export function summarizeMetricsForLog(m: DailyReportMetrics) {
  return {
    leadsReachedToday: m.leadsReachedToday,
    newUncontacted: m.newUncontacted,
    surveysCompletedToday: m.surveysCompletedToday,
    quotationsSentToday: m.quotationsSentToday,
    revenueToday: m.revenueToday,
    cashCollectedToday: m.cashCollectedToday,
    installationsCompletedToday: m.installationsCompletedToday,
    ticketsOpenedToday: m.ticketsOpenedToday,
    ticketsClosedToday: m.ticketsClosedToday,
    ticketsOpenTotal: m.ticketsOpenTotal,
    employeeCount: m.employees.length,
  };
}

export { money };
