import type { createClient } from "@/lib/supabase/server";
import {
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMilestone,
  type PaymentVerificationStatus,
} from "@/lib/domain/payments";
import {
  CUSTOMER_SALES_STAGES,
  SALES_STAGE_LABELS,
  type SalesStage,
} from "@/lib/domain/workflow";
import { formatCurrency } from "@/lib/utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Reasons each quotation cannot be deleted. An empty list means deletable.
 * The lead's linked quotation and quotes with payments stay locked.
 */
export async function loadQuotationDeleteBlockers(
  supabase: Supabase,
  companyId: string,
  ids: string[]
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (ids.length === 0) return result;

  const { data: quotes, error } = await supabase
    .from("quotations")
    .select("id, status, lead_id")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);

  const leadIds = [
    ...new Set((quotes ?? []).map((q) => q.lead_id).filter((v): v is string => Boolean(v))),
  ];

  const [leadsRes, paymentsRes] = await Promise.all([
    leadIds.length
      ? supabase
          .from("leads")
          .select("id, sales_stage, accepted_quotation_id")
          .eq("company_id", companyId)
          .in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("payments")
      .select("quotation_id, milestone, amount, verification_status")
      .eq("company_id", companyId)
      .in("quotation_id", ids),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const leadById = new Map(
    (leadsRes.data ?? []).map((l) => [
      l.id as string,
      l as { id: string; sales_stage: string; accepted_quotation_id: string | null },
    ])
  );

  for (const q of quotes ?? []) {
    const reasons: string[] = [];
    const lead = q.lead_id ? leadById.get(q.lead_id) : undefined;

    if (lead?.accepted_quotation_id === q.id) {
      reasons.push("Linked as the lead's accepted quotation");
    }

    const payments = (paymentsRes.data ?? []).filter((p) => p.quotation_id === q.id);
    if (payments.length > 0) {
      const total = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      const detail = payments
        .map((p) => {
          const milestone =
            PAYMENT_MILESTONE_LABELS[p.milestone as PaymentMilestone] ?? p.milestone;
          const status =
            PAYMENT_STATUS_LABELS[p.verification_status as PaymentVerificationStatus] ??
            p.verification_status;
          return `${milestone}, ${status.toLowerCase()}`;
        })
        .join("; ");
      reasons.push(
        `${payments.length} payment${payments.length === 1 ? "" : "s"} recorded: ${formatCurrency(total)} (${detail})`
      );
    }

    const stage = lead?.sales_stage as SalesStage | undefined;
    if (
      reasons.length > 0 &&
      stage &&
      (stage === "quote_accepted" || CUSTOMER_SALES_STAGES.includes(stage))
    ) {
      reasons.push(`Lead is at ${SALES_STAGE_LABELS[stage] ?? stage}`);
    }

    result[q.id] = reasons;
  }

  return result;
}
