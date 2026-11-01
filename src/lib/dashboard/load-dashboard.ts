import { createClient } from "@/lib/supabase/server";
import { getLeadSourceStats, type SourceStat } from "@/actions/ingest";
import { getMyReminders } from "@/actions/reminders";
import { getCurrentUser, getUserAuthorities, hasAuthority } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/brand";
import {
  CUSTOMER_PHASES,
  CUSTOMER_SALES_STAGES,
  PIPELINE_STAGE_GROUPS,
  STAGE_COLORS,
  type SalesStage,
} from "@/lib/domain/workflow";
import type { ReminderItem, ReminderSummary } from "@/lib/domain/reminders";
import {
  leadVisibilityOrFilter,
  ownLeadOrCustomerFilter,
} from "@/lib/leads/visibility";
import {
  canSeeAllCustomers,
  canSeeAllLeads,
} from "@/lib/leads/visibility-server";
import type { Profile } from "@/lib/domain/types";
import { canAccessNavHref } from "@/lib/nav-access";
import { receivablesHref } from "@/lib/accounts/receivables-buckets";
import {
  daysAgoRange,
  inRange,
  monthRange,
  percentChange,
  pipelineValueFromQuotes,
  previousMonth,
} from "@/lib/dashboard/metrics";

export type DashboardPipelineColumn = {
  id: string;
  label: string;
  count: number;
  colorClass: string;
};

export type DashboardPhase = {
  id: string;
  label: string;
  count: number;
};

export type KpiTone = "neutral" | "warn" | "danger" | "success" | "accent";

export type DashboardKpi = {
  id: string;
  label: string;
  href: string;
  /** Primary numeric or currency display value */
  value: number;
  format: "number" | "currency" | "percent";
  hint: string;
  tone: KpiTone;
  /** Optional secondary line (e.g. "12 added this month") */
  detail?: string;
  /** MoM % change when applicable */
  momPct?: number | null;
  /** Dual metrics */
  secondary?: { label: string; value: number; format?: "number" | "currency" };
};

export type DashboardData = {
  name: string;
  roleLabel: string;
  dateLabel: string;
  activeTotal: number;
  customerTotal: number;
  visitsToday: number;
  surveyDone: number;
  lostCount: number;
  pipeline: DashboardPipelineColumn[];
  phases: DashboardPhase[];
  kpis: DashboardKpi[];
  reminders: ReminderSummary;
  attention: ReminderItem[];
  sources: SourceStat[];
  canIngest: boolean;
  canQuotations: boolean;
  /** Accounts / finance stage-wise pending & collected + dealer payouts */
  accountsFinance: AccountsFinanceBlock | null;
};

export type AccountsFinanceBlock = {
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

function emptyReminders(): ReminderSummary {
  return { overdue: 0, dueNow: 0, dueToday: 0, upcoming: 0, total: 0, items: [] };
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isSameLocalDay(iso: string | null | undefined, day: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfLocalDay(day).getTime() && t <= endOfLocalDay(day).getTime();
}

const INSTALL_PENDING_STAGES = new Set<string>([
  "pre_dispatch_verified",
  "installation_assigned",
  "installation_in_progress",
]);

const INSTALL_COMPLETED_STAGES = new Set<string>(
  CUSTOMER_SALES_STAGES.filter((s) => {
    const order = CUSTOMER_SALES_STAGES.indexOf(s);
    const completedAt = CUSTOMER_SALES_STAGES.indexOf("installation_completed");
    return order >= completedAt;
  })
);

const SUBSIDY_PENDING_STAGES = new Set<string>([
  "installation_completed",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
]);

type LeadDashRow = {
  id: string;
  sales_stage: string;
  created_at: string;
  won_closed_at: string | null;
  accepted_quotation_id: string | null;
  visit_scheduled_at: string | null;
  survey_date: string | null;
  installation_completed_at: string | null;
  subsidy_verified_at: string | null;
  subsidy_received_at: string | null;
  assigned_telecaller_id: string | null;
  assigned_surveyor_id: string | null;
  assigned_to: string | null;
  assigned_crew_id: string | null;
  created_by: string | null;
  dealer_id?: string | null;
};

async function loadVisibleLeads(
  profile: Profile,
  seeAll: boolean,
  seeCustomers: boolean
): Promise<LeadDashRow[]> {
  const companyId = profile.company_id;
  const profileId = profile.id;
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select(
      `id, sales_stage, created_at, won_closed_at, accepted_quotation_id,
       visit_scheduled_at, survey_date, installation_completed_at,
       subsidy_verified_at, subsidy_received_at,
       assigned_telecaller_id, assigned_surveyor_id, assigned_to, assigned_crew_id, created_by, dealer_id`
    )
    .eq("company_id", companyId);

  if (!seeAll) {
    q = q.or(
      seeCustomers
        ? ownLeadOrCustomerFilter(profileId)
        : leadVisibilityOrFilter(profile)
    );
  }

  const { data, error } = await q;
  if (error) {
    // won_closed_at may be missing before migration 022
    if (/won_closed_at|column .* does not exist/i.test(error.message)) {
      const fallback = await supabase
        .from("leads")
        .select(
          `id, sales_stage, created_at, accepted_quotation_id,
           visit_scheduled_at, survey_date, installation_completed_at,
           subsidy_verified_at, subsidy_received_at,
           assigned_telecaller_id, assigned_surveyor_id, assigned_to, assigned_crew_id, created_by, dealer_id`
        )
        .eq("company_id", companyId);
      if (fallback.error) throw fallback.error;
      let rows = (fallback.data ?? []) as Omit<LeadDashRow, "won_closed_at">[];
      if (!seeAll) {
        const dealerOnly = profile.role === "dealer";
        rows = rows.filter((r) => {
          if (dealerOnly) {
            return (
              r.created_by === profileId ||
              (r as { dealer_id?: string | null }).dealer_id === profileId
            );
          }
          return (
            r.assigned_telecaller_id === profileId ||
            r.assigned_surveyor_id === profileId ||
            r.assigned_to === profileId ||
            r.assigned_crew_id === profileId ||
            r.created_by === profileId ||
            (r as { dealer_id?: string | null }).dealer_id === profileId ||
            (seeCustomers && CUSTOMER_SALES_STAGES.includes(r.sales_stage as SalesStage))
          );
        });
      }
      return rows.map((r) => ({ ...r, won_closed_at: null }));
    }
    throw error;
  }
  return (data ?? []) as LeadDashRow[];
}

async function wonDatesFromAudit(
  companyId: string,
  leadIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (leadIds.length === 0) return map;
  const supabase = await createClient();
  // Chunk to avoid huge IN filters
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
        map.set(row.lead_id, row.created_at);
      }
    }
  }
  return map;
}

function resolveWonAt(lead: LeadDashRow, auditWon: Map<string, string>): string | null {
  if (lead.won_closed_at) return lead.won_closed_at;
  return auditWon.get(lead.id) ?? null;
}

export async function loadDashboardData(): Promise<DashboardData | null> {
  const profile = await getCurrentUser();
  if (!profile) return null;

  const authorities = await getUserAuthorities(profile.id);
  const accessCtx = { authorities, role: profile.role };
  const seeAll = await canSeeAllLeads(profile);
  const seeCustomers = !seeAll && (await canSeeAllCustomers(profile));

  const canPayments = canAccessNavHref("/payments", accessCtx);
  const canInstall = canAccessNavHref("/installation", accessCtx);
  const canLiaison = canAccessNavHref("/liaison", accessCtx);
  const canMaintenance = canAccessNavHref("/maintenance", accessCtx);
  const canGrievances = canAccessNavHref("/grievances", accessCtx);
  const canIngest = canAccessNavHref("/ingest", accessCtx);
  const canQuotations = canAccessNavHref("/quotations", accessCtx);
  // Company Accounts / Dealer ledger on home — NOT bare record_payment / view_payment_queues
  const canCompanyFinanceDashboard =
    profile.role === "admin" ||
    profile.role === "accounts" ||
    profile.role === "sales_manager" ||
    authorities.has("full_access") ||
    authorities.has("verify_payment") ||
    authorities.has("view_reports") ||
    seeCustomers;

  const today = new Date();
  const thisMonth = monthRange(today);
  const lastMonth = monthRange(previousMonth(today));
  const last30 = daysAgoRange(30, today);

  const [leads, reminders, sources] = await Promise.all([
    loadVisibleLeads(profile, seeAll, seeCustomers).catch(() => [] as LeadDashRow[]),
    getMyReminders().catch(() => emptyReminders()),
    getLeadSourceStats().catch(() => [] as SourceStat[]),
  ]);

  const leadIds = leads.map((l) => l.id);
  const needsWonDates = leads.filter(
    (l) =>
      !l.won_closed_at &&
      (l.sales_stage === "quote_accepted" ||
        CUSTOMER_SALES_STAGES.includes(l.sales_stage as SalesStage))
  );
  const auditWon = await wonDatesFromAudit(
    profile.company_id,
    needsWonDates.map((l) => l.id)
  ).catch(() => new Map<string, string>());

  const byStage: Record<string, number> = {};
  for (const lead of leads) {
    byStage[lead.sales_stage] = (byStage[lead.sales_stage] ?? 0) + 1;
  }

  const pipeline: DashboardPipelineColumn[] = PIPELINE_STAGE_GROUPS.map((group) => {
    const count = group.stages.reduce((n, stage) => n + (byStage[stage] ?? 0), 0);
    const colorKey = (group.stages[0] ?? "new_lead") as SalesStage;
    return {
      id: group.id,
      label: group.label,
      count,
      colorClass: STAGE_COLORS[colorKey] ?? "bg-[var(--primary)]",
    };
  });

  const activeFromPipeline = pipeline.reduce((n, col) => n + col.count, 0);
  const lostCount = byStage.lost ?? 0;
  const surveyDone = byStage.survey_completed ?? 0;

  const visitsToday = leads.filter((lead) => {
    if (!["visit_scheduled", "survey_in_progress"].includes(lead.sales_stage)) return false;
    return (
      isSameLocalDay(lead.visit_scheduled_at, today) ||
      isSameLocalDay(lead.survey_date, today)
    );
  }).length;

  const phases: DashboardPhase[] = CUSTOMER_PHASES.map((phase) => ({
    id: phase.id,
    label: phase.label,
    count: phase.stages.reduce((n, stage) => n + (byStage[stage] ?? 0), 0),
  }));
  const customerTotal = phases.reduce((n, p) => n + p.count, 0);

  const addedThisMonth = leads.filter((l) => inRange(l.created_at, thisMonth)).length;

  const wonThisMonth = leads.filter((l) => {
    const at = resolveWonAt(l, auditWon);
    return at != null && inRange(at, thisMonth);
  });
  const wonLastMonth = leads.filter((l) => {
    const at = resolveWonAt(l, auditWon);
    return at != null && inRange(at, lastMonth);
  });

  const supabase = await createClient();

  // —— Revenue (D5): accepted quote grand_total for files won in period (scoped leads) ——
  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  const canShowRevenue = canQuotations || canCompanyFinanceDashboard;
  if (canShowRevenue && (wonThisMonth.length > 0 || wonLastMonth.length > 0)) {
    const quoteIds = new Set<string>();
    const wonLeadsNeedingQuote: string[] = [];
    for (const l of [...wonThisMonth, ...wonLastMonth]) {
      if (l.accepted_quotation_id) quoteIds.add(l.accepted_quotation_id);
      else wonLeadsNeedingQuote.push(l.id);
    }

    const quoteTotals = new Map<string, number>();
    if (quoteIds.size > 0) {
      const { data } = await supabase
        .from("quotations")
        .select("id, grand_total")
        .eq("company_id", profile.company_id)
        .in("id", [...quoteIds]);
      for (const q of data ?? []) {
        quoteTotals.set(q.id, Number(q.grand_total) || 0);
      }
    }

    const acceptedByLead = new Map<string, number>();
    if (wonLeadsNeedingQuote.length > 0) {
      const { data } = await supabase
        .from("quotations")
        .select("lead_id, grand_total, status, updated_at")
        .eq("company_id", profile.company_id)
        .in("lead_id", wonLeadsNeedingQuote)
        .eq("status", "accepted")
        .order("updated_at", { ascending: false });
      for (const q of data ?? []) {
        if (!q.lead_id || acceptedByLead.has(q.lead_id)) continue;
        acceptedByLead.set(q.lead_id, Number(q.grand_total) || 0);
      }
    }

    const amountFor = (l: LeadDashRow) => {
      if (l.accepted_quotation_id && quoteTotals.has(l.accepted_quotation_id)) {
        return quoteTotals.get(l.accepted_quotation_id) ?? 0;
      }
      return acceptedByLead.get(l.id) ?? 0;
    };

    revenueThisMonth = wonThisMonth.reduce((n, l) => n + amountFor(l), 0);
    revenueLastMonth = wonLastMonth.reduce((n, l) => n + amountFor(l), 0);
  }

  // —— Payments (scoped to visible leads when not company-wide) ——
  let paymentsCollected = 0;
  let paymentsPending = 0;
  let pendingPaymentRows = 0;
  if (canPayments || canCompanyFinanceDashboard) {
    let payQ = supabase
      .from("payments")
      .select("amount, verification_status, lead_id")
      .eq("company_id", profile.company_id);
    if (!seeAll && leadIds.length > 0) {
      payQ = payQ.in("lead_id", leadIds);
    } else if (!seeAll) {
      payQ = payQ.in("lead_id", ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: pays } = await payQ;
    for (const p of pays ?? []) {
      const amt = Number(p.amount) || 0;
      if (p.verification_status === "verified") paymentsCollected += amt;
      else if (p.verification_status === "pending") {
        paymentsPending += amt;
        pendingPaymentRows += 1;
      }
    }
  }

  // —— Pipeline value (30d) ——
  let pipelineValue = 0;
  if (canQuotations) {
    let q = supabase
      .from("quotations")
      .select("id, lead_id, customer_phone, grand_total, status, created_at, quote_date")
      .eq("company_id", profile.company_id)
      .in("status", ["sent", "accepted"])
      .gte("created_at", last30.start.toISOString())
      .lte("created_at", last30.end.toISOString());
    if (!seeAll && leadIds.length > 0) {
      q = q.in("lead_id", leadIds);
    } else if (!seeAll) {
      q = q.in("lead_id", ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: quotes } = await q;
    pipelineValue = pipelineValueFromQuotes(
      (quotes ?? []).map((row) => ({
        leadKey: row.lead_id || `phone:${row.customer_phone ?? row.id}`,
        amount: Number(row.grand_total) || 0,
      }))
    );
  }

  // —— Installations ——
  const installCompleted = leads.filter(
    (l) =>
      INSTALL_COMPLETED_STAGES.has(l.sales_stage) || Boolean(l.installation_completed_at)
  ).length;
  const installPending = leads.filter((l) => INSTALL_PENDING_STAGES.has(l.sales_stage)).length;

  // —— Service tickets ——
  let ticketsOpen = 0;
  let ticketsTotal = 0;
  let oldestTicket: { createdAt: string; leadName: string } | null = null;
  if (canMaintenance) {
    let tq = supabase
      .from("service_tickets")
      .select("id, status, created_at, lead_id, lead:leads(name)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: true });
    if (!seeAll && leadIds.length > 0) {
      tq = tq.in("lead_id", leadIds);
    }
    const { data: tickets } = await tq;
    ticketsTotal = tickets?.length ?? 0;
    const open = (tickets ?? []).filter((t) =>
      ["raised", "accepted", "in_progress"].includes(t.status)
    );
    ticketsOpen = open.length;
    if (open[0]) {
      const leadRel = open[0].lead;
      const leadName = Array.isArray(leadRel)
        ? (leadRel[0] as { name?: string } | undefined)?.name
        : (leadRel as { name?: string } | null)?.name;
      oldestTicket = {
        createdAt: open[0].created_at,
        leadName: leadName ?? "Customer",
      };
    }
  }

  // —— Open grievances (internal). Table has no lead_id — omit for assigned-only ——
  let grievancesOpen = 0;
  if (canGrievances && (seeAll || seeCustomers)) {
    const { count, error: gErr } = await supabase
      .from("grievances")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .in("status", ["open", "in_progress", "escalated"]);
    if (!gErr) grievancesOpen = count ?? 0;
  }

  // —— Pending subsidy ₹ ——
  let pendingSubsidy = 0;
  let subsidyOverdueCount = 0;
  if (canLiaison || canCompanyFinanceDashboard) {
    const subsidyLeads = leads.filter(
      (l) =>
        SUBSIDY_PENDING_STAGES.has(l.sales_stage) &&
        !l.subsidy_verified_at &&
        l.sales_stage !== "completed"
    );
    if (subsidyLeads.length > 0) {
      const ids = subsidyLeads.map((l) => l.id);
      const acceptedIds = subsidyLeads
        .map((l) => l.accepted_quotation_id)
        .filter((id): id is string => Boolean(id));

      const subsidyByLead = new Map<string, number>();
      if (acceptedIds.length > 0) {
        const { data } = await supabase
          .from("quotations")
          .select("id, lead_id, subsidy")
          .eq("company_id", profile.company_id)
          .in("id", acceptedIds);
        for (const q of data ?? []) {
          const amt = Number(q.subsidy) || 0;
          if (q.lead_id) subsidyByLead.set(q.lead_id, amt);
          // also map by quotation id lookup below
          for (const l of subsidyLeads) {
            if (l.accepted_quotation_id === q.id) subsidyByLead.set(l.id, amt);
          }
        }
      }

      const missing = ids.filter((id) => !subsidyByLead.has(id));
      if (missing.length > 0) {
        const { data } = await supabase
          .from("quotations")
          .select("lead_id, subsidy, status, updated_at")
          .eq("company_id", profile.company_id)
          .in("lead_id", missing)
          .in("status", ["accepted", "sent"])
          .order("updated_at", { ascending: false });
        for (const q of data ?? []) {
          if (!q.lead_id || subsidyByLead.has(q.lead_id)) continue;
          subsidyByLead.set(q.lead_id, Number(q.subsidy) || 0);
        }
      }

      pendingSubsidy = [...subsidyByLead.values()].reduce((a, b) => a + b, 0);
    }

    // overdue timer count for outstanding tasks
    if (canLiaison) {
      const { data: liaisonRows } = await supabase
        .from("leads")
        .select("id, subsidy_timer_due_at, subsidy_received_at")
        .eq("company_id", profile.company_id)
        .in("sales_stage", [
          "liaison_in_progress",
          "meter_installed",
          "subsidy_pending",
          "subsidy_received_pending_accounts",
        ]);
      const now = Date.now();
      for (const row of liaisonRows ?? []) {
        if (row.subsidy_received_at || !row.subsidy_timer_due_at) continue;
        if (!seeAll && !leadIds.includes(row.id)) continue;
        if (new Date(row.subsidy_timer_due_at).getTime() <= now) subsidyOverdueCount += 1;
      }
    }
  }

  const overdueReminders = reminders.overdue;
  const outstandingTotal =
    overdueReminders +
    subsidyOverdueCount +
    pendingPaymentRows +
    ticketsOpen +
    grievancesOpen;

  const attention = reminders.items
    .filter(
      (item) =>
        item.urgency === "overdue" || item.urgency === "due_now" || item.urgency === "due_today"
    )
    .slice(0, 8);

  const outstandingHref =
    grievancesOpen > 0 && canGrievances
      ? "/grievances"
      : ticketsOpen > 0 && canMaintenance
        ? "/maintenance"
        : "/alerts";

  const kpis: DashboardKpi[] = [
    {
      id: "active-leads",
      label: "Active leads",
      href: "/pipeline",
      value: activeFromPipeline,
      format: "number",
      hint: "In sales pipeline",
      tone: "neutral",
      detail: `${addedThisMonth} added this month`,
    },
    {
      id: "files-won",
      label: "Files won",
      href: "/customers",
      value: wonThisMonth.length,
      format: "number",
      hint: "This month",
      tone: wonThisMonth.length > 0 ? "success" : "neutral",
      momPct: percentChange(wonThisMonth.length, wonLastMonth.length),
      detail: `vs ${wonLastMonth.length} last month`,
    },
  ];

  if (canShowRevenue) {
    kpis.push({
      id: "monthly-revenue",
      label: "Monthly revenue",
      href: "/customers",
      value: revenueThisMonth,
      format: "currency",
      hint: "Accepted quotes · Won this month",
      tone: "accent",
      momPct: percentChange(revenueThisMonth, revenueLastMonth),
      detail: `vs prior month`,
    });
  }

  // Scoped payments for sales; hide empty card so company zeros never look "theirs"
  if (
    canPayments &&
    (canCompanyFinanceDashboard ||
      paymentsCollected > 0 ||
      paymentsPending > 0)
  ) {
    kpis.push({
      id: "payments",
      label: "Payment overview",
      href: "/payments",
      value: paymentsCollected,
      format: "currency",
      hint: "Collected (verified)",
      tone: paymentsPending > 0 ? "warn" : "success",
      secondary: {
        label: "Pending",
        value: paymentsPending,
        format: "currency",
      },
    });
  }

  if (canInstall) {
    kpis.push({
      id: "installations",
      label: "Installations",
      href: "/installation",
      value: installCompleted,
      format: "number",
      hint: "Completed",
      tone: installPending > 0 ? "accent" : "success",
      secondary: { label: "Pending", value: installPending },
    });
  }

  kpis.push({
    id: "outstanding",
    label: "Outstanding tasks",
    href: outstandingHref,
    value: outstandingTotal,
    format: "number",
    hint: "Overdue alerts · payments · subsidy · tickets · grievances",
    tone: outstandingTotal > 0 ? "danger" : "success",
    detail: [
      overdueReminders ? `${overdueReminders} overdue reminders` : null,
      pendingPaymentRows ? `${pendingPaymentRows} payments` : null,
      subsidyOverdueCount ? `${subsidyOverdueCount} subsidy` : null,
      ticketsOpen ? `${ticketsOpen} tickets` : null,
      grievancesOpen ? `${grievancesOpen} grievances` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "All clear",
  });

  if (canQuotations) {
    kpis.push({
      id: "pipeline-value",
      label: "Pipeline value",
      href: "/quotations",
      value: pipelineValue,
      format: "currency",
      hint: "Quotes sent (30d) · avg per customer",
      tone: "neutral",
    });
  }

  if (canMaintenance) {
    kpis.push({
      id: "services",
      label: "Services pending",
      href: "/maintenance",
      value: ticketsOpen,
      format: "number",
      hint: `Open of ${ticketsTotal} total`,
      tone: ticketsOpen > 0 ? "warn" : "success",
      secondary: { label: "Total tickets", value: ticketsTotal },
      detail: oldestTicket
        ? `Oldest: ${oldestTicket.leadName} · ${new Date(oldestTicket.createdAt).toLocaleDateString("en-IN")}`
        : "No open tickets",
    });
  }

  if (canLiaison || canCompanyFinanceDashboard) {
    kpis.push({
      id: "pending-subsidy",
      label: "Pending subsidy",
      href: "/liaison",
      value: pendingSubsidy,
      format: "currency",
      hint: "Install done · subsidy not verified",
      tone: pendingSubsidy > 0 ? "warn" : "success",
    });
  }

  let accountsFinance: AccountsFinanceBlock | null = null;
  if (canCompanyFinanceDashboard) {
    try {
      const { getAccountsFinanceSnapshot } = await import(
        "@/actions/accounts-receivables"
      );
      const snap = await getAccountsFinanceSnapshot();
      accountsFinance = snap;
      kpis.unshift(
        {
          id: "recv-customers",
          label: "Pending customers",
          href: receivablesHref("pending"),
          value: snap.pendingCustomers,
          format: "number",
          hint: "Any milestone or company subsidy pending",
          tone: snap.pendingCustomers > 0 ? "warn" : "success",
        },
        {
          id: "recv-token",
          label: "Token pending",
          href: receivablesHref("token"),
          value: snap.pendingToken.amount,
          format: "currency",
          hint: `${snap.pendingToken.count} customers`,
          tone: snap.pendingToken.amount > 0 ? "warn" : "success",
        },
        {
          id: "recv-pre",
          label: "Pre-dispatch pending",
          href: receivablesHref("pre"),
          value: snap.pendingPreDispatch.amount,
          format: "currency",
          hint: `${snap.pendingPreDispatch.count} customers`,
          tone: snap.pendingPreDispatch.amount > 0 ? "warn" : "success",
        },
        {
          id: "recv-final",
          label: "Final pending",
          href: receivablesHref("final"),
          value: snap.pendingFinal.amount,
          format: "currency",
          hint: `${snap.pendingFinal.count} customers`,
          tone: snap.pendingFinal.amount > 0 ? "warn" : "success",
        },
        {
          id: "recv-company-subsidy",
          label: "Company subsidy pending",
          href: receivablesHref("subsidy"),
          value: snap.pendingSubsidy.amount,
          format: "currency",
          hint: `Won checkbox · ${snap.pendingSubsidy.count} files`,
          tone: snap.pendingSubsidy.amount > 0 ? "warn" : "success",
        },
        {
          id: "collected-mtd",
          label: "Collected MTD",
          href: "/payments",
          value:
            snap.collectedMtd.token +
            snap.collectedMtd.pre_dispatch +
            snap.collectedMtd.final,
          format: "currency",
          hint: `Token ${snap.collectedMtd.token.toLocaleString("en-IN")} · Pre ${snap.collectedMtd.pre_dispatch.toLocaleString("en-IN")} · Final ${snap.collectedMtd.final.toLocaleString("en-IN")}`,
          tone: "accent",
        },
        {
          id: "dealer-due",
          label: "Dealer shortly due",
          href: "/dealers",
          value: snap.dealerShortlyDue,
          format: "currency",
          hint: "Pre-dispatch verified · commission not approved",
          tone: snap.dealerShortlyDue > 0 ? "warn" : "success",
          secondary: {
            label: "Paid this month",
            value: snap.dealerPaidMonth,
            format: "currency",
          },
        }
      );
    } catch {
      accountsFinance = null;
    }
  }

  const canIngestAuth =
    canIngest ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "import_leads")) ||
    (await hasAuthority(profile.id, "add_edit_leads"));

  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(today);

  return {
    name: profile.name,
    roleLabel: ROLE_LABELS[profile.role] ?? profile.role,
    dateLabel,
    activeTotal: activeFromPipeline,
    customerTotal,
    visitsToday,
    surveyDone,
    lostCount,
    pipeline,
    phases,
    kpis,
    reminders,
    attention,
    sources: sources.slice(0, 6),
    canIngest: canIngestAuth,
    canQuotations,
    accountsFinance,
  };
}
