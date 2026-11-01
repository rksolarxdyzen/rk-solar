import type { SupabaseClient } from "@supabase/supabase-js";

/** Read separately so pages keep working before migration 058 (missing column → 0). */
export async function loadSettlementDiscount(
  supabase: SupabaseClient,
  leadId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("leads")
    .select("settlement_discount_amount")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return 0;
  return Math.max(0, Number(data.settlement_discount_amount) || 0);
}

export async function loadSettlementDiscounts(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, { amount: number; reason: string | null }>> {
  const map = new Map<string, { amount: number; reason: string | null }>();
  if (leadIds.length === 0) return map;
  const { data, error } = await supabase
    .from("leads")
    .select("id, settlement_discount_amount, settlement_discount_reason")
    .in("id", leadIds)
    .gt("settlement_discount_amount", 0);
  if (error) return map;
  for (const row of data ?? []) {
    map.set(row.id as string, {
      amount: Math.max(0, Number(row.settlement_discount_amount) || 0),
      reason: (row.settlement_discount_reason as string | null) ?? null,
    });
  }
  return map;
}
