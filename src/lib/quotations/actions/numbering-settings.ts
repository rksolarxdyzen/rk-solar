"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import {
  isNumberingFormat,
  periodKeyForFormat,
  type NumberingFormat,
} from "@/lib/quotations/quotation-numbering";
import {
  loadQuotationNumberingSettings,
  resolveNumberingFormat,
} from "@/lib/quotations/numbering-settings-db";

export type QuotationNumberingSettings = {
  quotation_prefix: string;
  quotation_numbering_format: NumberingFormat;
  quotation_next_number: number;
  quotation_number_padding: number;
  quotation_numbering_period: string | null;
};

async function requireNumberingManage() {
  const profile = await requireAuth();
  const allowed =
    (await hasAuthority(profile.id, "manage_settings")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!allowed) {
    throw new Error("You do not have permission to change quotation numbering.");
  }
  return { profile, supabase: await createClient(), companyId: profile.company_id };
}

export async function getQuotationNumberingSettings(): Promise<QuotationNumberingSettings> {
  const { supabase, companyId } = await requireNumberingManage();
  const data = await loadQuotationNumberingSettings(supabase, companyId);
  const format = resolveNumberingFormat(data);

  return {
    quotation_prefix: data.quotation_prefix?.trim() || "QTN",
    quotation_numbering_format: format,
    quotation_next_number: Math.max(1, Number(data.quotation_next_number ?? 1)),
    quotation_number_padding: Math.min(6, Math.max(3, Number(data.quotation_number_padding ?? 4))),
    quotation_numbering_period: data.quotation_numbering_period ?? null,
  };
}

export async function saveQuotationNumberingSettings(input: {
  prefix: string;
  format: string;
  nextNumber: number;
  padding: number;
}) {
  const { supabase, companyId } = await requireNumberingManage();

  if (!isNumberingFormat(input.format)) {
    throw new Error("Invalid numbering format");
  }

  const format = input.format;
  const prefix = input.prefix.trim() || "QTN";
  const nextNumber = Math.max(1, Math.floor(Number(input.nextNumber) || 1));
  const padding = Math.min(6, Math.max(3, Math.floor(Number(input.padding) || 4)));
  const period = periodKeyForFormat(format);

  const payload: Record<string, unknown> = {
    company_id: companyId,
    quotation_prefix: prefix.slice(0, 24),
    quotation_next_number: nextNumber,
    quotation_number_padding: padding,
    updated_at: new Date().toISOString(),
  };

  const existing = await loadQuotationNumberingSettings(supabase, companyId);
  if (existing.extendedColumns) {
    payload.quotation_numbering_format = format;
    payload.quotation_numbering_period = period;
  }

  const { error } = await supabase.from("quotation_company_settings").upsert(payload, {
    onConflict: "company_id",
  });
  if (error) throw error;

  revalidatePath("/settings");
  revalidatePath("/quotations");
  revalidatePath("/quotations/new");
}
