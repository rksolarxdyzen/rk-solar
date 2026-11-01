"use server";

import { getQuotationContext } from "@/lib/quotations/context";
import { previewQuotationNumber } from "@/lib/quotations/quotation-numbering";
import {
  allocateNumberFromSettings,
  loadQuotationNumberingSettings,
  persistAllocatedQuotationNumber,
} from "@/lib/quotations/numbering-settings-db";

export async function peekNextQuotationNumber(): Promise<string> {
  const { supabase, companyId } = await getQuotationContext();
  const settings = await loadQuotationNumberingSettings(supabase, companyId);
  return previewQuotationNumber(settings);
}

/** Atomically allocate the next quotation number for this company. */
export async function allocateQuotationNumber(): Promise<string> {
  const { supabase, companyId } = await getQuotationContext();
  const settings = await loadQuotationNumberingSettings(supabase, companyId);
  const padding = Math.min(6, Math.max(3, Number(settings.quotation_number_padding ?? 4)));
  const prefix = (settings.quotation_prefix ?? "QTN").trim() || "QTN";
  const allocated = allocateNumberFromSettings(settings);

  await persistAllocatedQuotationNumber(supabase, companyId, {
    settings,
    nextSequence: allocated.nextSequence,
    period: allocated.period,
    format: allocated.format,
    padding,
    prefix,
  });

  return allocated.quotationNo;
}
