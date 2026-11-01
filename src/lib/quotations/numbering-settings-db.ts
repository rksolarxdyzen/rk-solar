import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatQuotationNumber,
  isNumberingFormat,
  periodKeyForFormat,
  type NumberingFormat,
  type NumberingSettings,
} from "@/lib/quotations/quotation-numbering";

const LEGACY_NUMBERING_COLUMNS =
  "quotation_prefix,quotation_next_number,quotation_number_padding";

const EXTENDED_NUMBERING_COLUMNS =
  `${LEGACY_NUMBERING_COLUMNS},quotation_numbering_format,quotation_numbering_period`;

export type LoadedNumberingSettings = NumberingSettings & {
  extendedColumns: boolean;
};

function isMissingNumberingColumnError(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return (
    /quotation_numbering_format/i.test(message) ||
    /quotation_numbering_period/i.test(message) ||
    /does not exist/i.test(message)
  );
}

export async function loadQuotationNumberingSettings(
  supabase: SupabaseClient,
  companyId: string
): Promise<LoadedNumberingSettings> {
  const extended = await supabase
    .from("quotation_company_settings")
    .select(EXTENDED_NUMBERING_COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!extended.error) {
    return {
      ...(extended.data ?? {}),
      extendedColumns: true,
    };
  }

  if (!isMissingNumberingColumnError(extended.error)) {
    throw new Error(extended.error.message || "Failed to load numbering settings");
  }

  const legacy = await supabase
    .from("quotation_company_settings")
    .select(LEGACY_NUMBERING_COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();

  if (legacy.error) {
    throw new Error(legacy.error.message || "Failed to load numbering settings");
  }

  return {
    ...(legacy.data ?? {}),
    extendedColumns: false,
  };
}

export function resolveNumberingFormat(settings: NumberingSettings): NumberingFormat {
  return isNumberingFormat(settings.quotation_numbering_format ?? "")
    ? (settings.quotation_numbering_format as NumberingFormat)
    : "prefix_year_seq";
}

export function allocateNumberFromSettings(
  settings: LoadedNumberingSettings,
  date = new Date()
): { quotationNo: string; nextSequence: number; period: string; format: NumberingFormat } {
  const format = settings.extendedColumns
    ? resolveNumberingFormat(settings)
    : "prefix_year_seq";
  const padding = Number(settings.quotation_number_padding ?? 4);
  const prefix = settings.quotation_prefix ?? "QTN";
  const period = periodKeyForFormat(format, date);
  const reset =
    settings.extendedColumns &&
    (settings.quotation_numbering_period ?? period) !== period;
  const sequence = reset ? 1 : Number(settings.quotation_next_number ?? 1);

  return {
    quotationNo: formatQuotationNumber({ prefix, format, sequence, padding, date }),
    nextSequence: sequence + 1,
    period,
    format,
  };
}

export async function persistAllocatedQuotationNumber(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    settings: LoadedNumberingSettings;
    nextSequence: number;
    period: string;
    format: NumberingFormat;
    padding: number;
    prefix: string;
  }
) {
  const now = new Date().toISOString();
  const base = {
    company_id: companyId,
    quotation_next_number: input.nextSequence,
    quotation_number_padding: input.padding,
    quotation_prefix: input.prefix,
    updated_at: now,
  };

  const payload = input.settings.extendedColumns
    ? {
        ...base,
        quotation_numbering_format: input.format,
        quotation_numbering_period: input.period,
      }
    : base;

  const { error } = await supabase
    .from("quotation_company_settings")
    .upsert(payload, { onConflict: "company_id" });

  if (error) {
    throw new Error(error.message || "Failed to allocate quotation number");
  }
}
