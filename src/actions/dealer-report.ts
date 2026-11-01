"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  assertCanViewDealerMonthlyReport,
  collectDealerMonthlyReport,
  type DealerMonthlyFilters,
  type DealerMonthlyReport,
} from "@/lib/reports/dealer-monthly";
import type { DealerReportOption } from "@/lib/reports/dealer-monthly-types";

export async function listDealerMonthlyReport(
  filters: DealerMonthlyFilters
): Promise<DealerMonthlyReport> {
  const profile = await requireAuth();
  return collectDealerMonthlyReport(profile, filters);
}

/** Active (and inactive) dealers for the filter dropdown. */
export async function listDealerReportOptions(): Promise<DealerReportOption[]> {
  const profile = await requireAuth();
  await assertCanViewDealerMonthlyReport(profile);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("company_id", profile.company_id)
    .eq("role", "dealer")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name:
      (((p.name as string) ?? "").trim() || "Unknown dealer") +
      (p.is_active === false ? " (inactive)" : ""),
  }));
}
