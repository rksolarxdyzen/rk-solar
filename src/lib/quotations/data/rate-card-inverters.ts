import { createClient } from "@/lib/supabase/server";
import {
  sortRateCardInverters,
  type RateCardInverter,
} from "@/lib/quotations/rate-card-inverters";

const INVERTER_COLS =
  "id, inverter_name, inverter_size, sort_order, is_active";

type InverterRow = {
  id: string;
  inverter_name: string;
  inverter_size: string;
  sort_order: number | null;
  is_active: boolean | null;
};

function mapInverterRow(row: InverterRow): RateCardInverter {
  return {
    id: row.id,
    inverter_name: row.inverter_name.trim(),
    inverter_size: row.inverter_size.trim(),
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
  };
}

export async function getRateCardInverters(): Promise<RateCardInverter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_inverters")
    .select(INVERTER_COLS)
    .order("sort_order")
    .order("inverter_name");

  if (error) {
    if (/rate_card_inverters/i.test(error.message ?? "")) {
      return [];
    }
    throw error;
  }

  return sortRateCardInverters((data ?? []).map((row) => mapInverterRow(row)));
}
