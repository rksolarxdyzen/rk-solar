"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  assertCanViewSalesRepReport,
  collectSalesRepMonthlyReport,
  type SalesRepMonthlyFilters,
  type SalesRepMonthlyReport,
} from "@/lib/reports/sales-rep-monthly";
import type { SalesRepOption } from "@/lib/reports/sales-rep-monthly-types";

const SALES_ROLES = new Set([
  "admin",
  "sales_manager",
  "sales_executive",
  "tele_caller",
]);

export async function listSalesRepMonthlyReport(
  filters: SalesRepMonthlyFilters
): Promise<SalesRepMonthlyReport> {
  const profile = await requireAuth();
  return collectSalesRepMonthlyReport(profile, filters);
}

/** Active staff for the Sales Rep filter dropdown. */
export async function listSalesRepOptions(): Promise<SalesRepOption[]> {
  const profile = await requireAuth();
  await assertCanViewSalesRepReport(profile);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("company_id", profile.company_id)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((p) => {
      if (p.is_active === false) return false;
      return SALES_ROLES.has(String(p.role ?? ""));
    })
    .map((p) => ({
      id: p.id as string,
      name: ((p.name as string) ?? "").trim() || "Unknown",
    }));
}
