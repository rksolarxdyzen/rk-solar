import type { SupabaseClient } from "@supabase/supabase-js";

type DbRow = Record<string, unknown>;

function missingColumnFromError(error: { message?: string; code?: string } | null): string | null {
  if (!error) return null;
  if (error.code === "PGRST204" || /Could not find the '[^']+' column/i.test(error.message ?? "")) {
    const match = error.message?.match(/Could not find the '([^']+)' column/i);
    return match?.[1] ?? null;
  }
  return null;
}

/** Retry insert/update when PostgREST schema cache is behind app code (missing columns). */
export async function persistQuotationRow(
  supabase: SupabaseClient,
  mode: "insert" | "update",
  payload: DbRow,
  filters?: { id: string; companyId: string }
): Promise<void> {
  let row: DbRow = { ...payload };

  for (let attempt = 0; attempt < 20; attempt++) {
    const result =
      mode === "insert"
        ? await supabase.from("quotations").insert(row)
        : await supabase
            .from("quotations")
            .update(row)
            .eq("id", filters!.id)
            .eq("company_id", filters!.companyId);

    if (!result.error) return;

    const missing = missingColumnFromError(result.error);
    if (!missing || !(missing in row)) {
      throw result.error;
    }

    const { [missing]: _removed, ...rest } = row;
    row = rest;
  }

  throw new Error("Failed to save quotation — database schema is out of date.");
}
