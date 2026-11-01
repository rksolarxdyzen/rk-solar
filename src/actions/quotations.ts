"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { leadVisibilityOrFilter } from "@/lib/leads/visibility";
import {
  canSeeAllLeads,
  canSeeAllQuotations,
} from "@/lib/leads/visibility-server";
import { logAuditEvent } from "@/lib/audit";
import { issuePortalCode } from "@/lib/domain/issue-portal-code";
import { calcLineTotal, calcSimpleQuotationTotals } from "@/lib/quotations/quote-math";
import {
  catalogItemMatchesTemplate,
  usesResidentialBomFields,
  type QuoteStatus,
  type QuoteTemplateKind,
  type QuotationRow,
} from "@/lib/quotations/types";

const lineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  item_name_snapshot: z.string().min(1),
  brand_snapshot: z.string().nullable().optional(),
  model_snapshot: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().default("pcs"),
  rate: z.number().min(0),
  gst_percent: z.number().min(0).max(100),
  discount_value: z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  leadId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(2).optional(),
  customerPhone: z.string().min(10).optional(),
  customerAddress: z.string().nullable().optional(),
  customerCity: z.string().nullable().optional(),
  templateKind: z.enum(["solar", "premium", "non_solar"]),
  status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
  systemSizeKw: z.number().min(0).nullable().optional(),
  meterCharges: z.number().min(0).optional(),
  subsidy: z.number().min(0).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountValue: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  validTill: z.string().nullable().optional(),
  items: z.array(lineSchema).min(1),
});

async function requireQuoteWrite() {
  const profile = await requireAuth();
  const ok =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Missing authority: create_quotations");
  return profile;
}

async function nextQuotationNo(companyId: string): Promise<string> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("quotation_company_settings")
    .select("quotation_prefix, quotation_next_number, quotation_number_padding")
    .eq("company_id", companyId)
    .maybeSingle();

  const prefix = settings?.quotation_prefix ?? "RKS";
  const next = settings?.quotation_next_number ?? 1;
  const pad = settings?.quotation_number_padding ?? 4;
  const year = new Date().getFullYear();
  const no = `${prefix}-${year}-${String(next).padStart(pad, "0")}`;

  if (settings) {
    await supabase
      .from("quotation_company_settings")
      .update({ quotation_next_number: next + 1 })
      .eq("company_id", companyId);
  } else {
    await supabase.from("quotation_company_settings").insert({
      company_id: companyId,
      quotation_prefix: prefix,
      quotation_next_number: next + 1,
    });
  }

  return no;
}

export async function listCatalogItems(templateKind?: QuoteTemplateKind) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_items")
    .select(
      "id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, image_url, brand:quote_brands(id, name), category:quote_item_categories(id, name, kind)"
    )
    .eq("is_active", true)
    .order("item_name");

  if (error) throw new Error(error.message);
  const items = data ?? [];
  if (!templateKind) return items;
  return items.filter((item) => catalogItemMatchesTemplate(item, templateKind));
}

/** Solar proposal BOM rows (REGULAR-BOM-* / PREMIUM-BOM-*) for tier PDF pages. */
export async function listBomCatalogItems() {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_items")
    .select(
      "id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, image_url, brand:quote_brands(id, name), category:quote_item_categories(id, name, kind)"
    )
    .eq("is_active", true)
    .or("model.like.REGULAR-BOM-%,model.like.PREMIUM-BOM-%")
    .order("model");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listQuotations(opts?: { leadId?: string }) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "view_quotations")) ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!can) throw new Error("Missing authority: view_quotations");

  const supabase = await createClient();
  const canSeeAll = await canSeeAllQuotations(profile);

  let q = supabase
    .from("quotations")
    .select(
      "id, quotation_no, lead_id, template_kind, tier_type, customer_name, customer_phone, status, quote_date, grand_total, system_size_kw, created_at, updated_at"
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (opts?.leadId) q = q.eq("lead_id", opts.leadId);

  // Dealers (and other nonΓÇôview-all roles): own creates + owned leads only.
  if (!canSeeAll) {
    const { data: leadRows, error: leadErr } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", profile.company_id)
      .or(leadVisibilityOrFilter(profile));
    if (leadErr) throw new Error(leadErr.message);
    const leadIds = (leadRows ?? []).map((row) => row.id);
    if (leadIds.length === 0) {
      q = q.or(`created_by.eq.${profile.id}`);
    } else {
      q = q.or(`created_by.eq.${profile.id},lead_id.in.(${leadIds.join(",")})`);
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getQuotation(id: string): Promise<QuotationRow> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("*, items:quotation_items(*)")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Quotation not found");

  if (!(await canSeeAllQuotations(profile))) {
    const createdByMe = data.created_by === profile.id;
    if (!createdByMe) {
      if (!data.lead_id) {
        throw new Error("Quotation not found");
      }
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .select("id")
        .eq("id", data.lead_id)
        .eq("company_id", profile.company_id)
        .or(leadVisibilityOrFilter(profile))
        .maybeSingle();
      if (leadErr) throw new Error(leadErr.message);
      if (!lead) throw new Error("Quotation not found");
    }
  }

  const items = Array.isArray(data.items)
    ? [...data.items].sort(
        (a: { sort_order?: number }, b: { sort_order?: number }) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
    : [];

  return { ...data, items } as QuotationRow;
}

export async function upsertQuotation(input: z.infer<typeof upsertSchema>) {
  const profile = await requireQuoteWrite();
  const parsed = upsertSchema.parse(input);
  const supabase = await createClient();

  let lead: {
    id: string;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    sales_stage: string;
    recommended_system_kw: number | null;
  } | null = null;

  if (parsed.leadId) {
    const { data, error: leadError } = await supabase
      .from("leads")
      .select(
        "id, name, phone, address, city, sales_stage, company_id, recommended_system_kw"
      )
      .eq("id", parsed.leadId)
      .eq("company_id", profile.company_id)
      .single();

    if (leadError || !data) throw new Error("Lead not found");
    if (data.sales_stage === "lost") {
      throw new Error("Cannot create a quotation for a lost lead");
    }
    lead = data;
  }

  const customerName = (parsed.customerName?.trim() || lead?.name || "").trim();
  const customerPhone = (parsed.customerPhone?.trim() || lead?.phone || "").trim();
  const customerAddress =
    parsed.customerAddress !== undefined
      ? parsed.customerAddress?.trim() || null
      : lead?.address ?? null;
  const customerCity =
    parsed.customerCity !== undefined
      ? parsed.customerCity?.trim() || null
      : lead?.city ?? null;

  if (customerName.length < 2) throw new Error("Customer name is required");
  if (customerPhone.replace(/\D/g, "").length < 10) {
    throw new Error("A valid customer phone is required");
  }

  const canPrice =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "edit_quotation_pricing")) ||
    (await hasAuthority(profile.id, "manage_quotations")) ||
    (await hasAuthority(profile.id, "full_access"));

  const lines = parsed.items.map((item, idx) => {
    const discount = canPrice ? item.discount_value : 0;
    const line_total = calcLineTotal({
      quantity: item.quantity,
      rate: item.rate,
      gstPercent: item.gst_percent,
      discountValue: discount,
    });
    return {
      item_id: item.item_id ?? null,
      sort_order: item.sort_order ?? idx,
      item_name_snapshot: item.item_name_snapshot,
      brand_snapshot: item.brand_snapshot ?? null,
      model_snapshot: item.model_snapshot ?? null,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      gst_percent: item.gst_percent,
      discount_value: discount,
      line_total,
    };
  });

  const headerDiscountValue = canPrice ? (parsed.discountValue ?? 0) : 0;
  const headerDiscountPercent = canPrice ? (parsed.discountPercent ?? 0) : 0;
  const meterCharges =
    parsed.templateKind === "solar" || usesResidentialBomFields(parsed.templateKind)
      ? (parsed.meterCharges ?? 0)
      : 0;
  const subsidy =
    parsed.templateKind === "solar" || usesResidentialBomFields(parsed.templateKind)
      ? (parsed.subsidy ?? 0)
      : 0;

  const totals = calcSimpleQuotationTotals({
    items: lines.map((l) => ({
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      gstPercent: Number(l.gst_percent),
      discountValue: Number(l.discount_value),
    })),
    headerDiscountValue,
    headerDiscountPercent,
    meterCharges,
    subsidy,
  });

  const status: QuoteStatus = parsed.status ?? "draft";
  const systemSizeKw =
    parsed.templateKind === "solar" || usesResidentialBomFields(parsed.templateKind)
      ? (parsed.systemSizeKw ?? lead?.recommended_system_kw ?? null)
      : null;

  let quotationId = parsed.id;

  if (quotationId) {
    const { data: existing } = await supabase
      .from("quotations")
      .select("id, status")
      .eq("id", quotationId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!existing) throw new Error("Quotation not found");

    const { error: updError } = await supabase
      .from("quotations")
      .update({
        template_kind: parsed.templateKind,
        lead_id: lead?.id ?? null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_city: customerCity,
        status,
        system_size_kw: systemSizeKw,
        meter_charges: meterCharges,
        subsidy,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        discount_percent: headerDiscountPercent,
        taxable_total: totals.taxableTotal,
        gst_total: totals.gstTotal,
        grand_total: totals.grandTotal,
        notes: parsed.notes ?? null,
        terms: parsed.terms ?? null,
        valid_till: parsed.validTill || null,
        updated_by: profile.id,
      })
      .eq("id", quotationId);

    if (updError) throw new Error(updError.message);

    await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
  } else {
    const quotationNo = await nextQuotationNo(profile.company_id);
    const { data: created, error: createError } = await supabase
      .from("quotations")
      .insert({
        company_id: profile.company_id,
        quotation_no: quotationNo,
        lead_id: lead?.id ?? null,
        template_kind: parsed.templateKind,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_city: customerCity,
        status,
        system_size_kw: systemSizeKw,
        meter_charges: meterCharges,
        subsidy,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        discount_percent: headerDiscountPercent,
        taxable_total: totals.taxableTotal,
        gst_total: totals.gstTotal,
        grand_total: totals.grandTotal,
        notes: parsed.notes ?? null,
        terms: parsed.terms ?? null,
        valid_till: parsed.validTill || null,
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single();

    if (createError || !created) throw new Error(createError?.message ?? "Create failed");
    quotationId = created.id;
  }

  const { error: itemsError } = await supabase.from("quotation_items").insert(
    lines.map((l) => ({ ...l, quotation_id: quotationId }))
  );
  if (itemsError) throw new Error(itemsError.message);

  // Advance lead to quoted on first save from survey_completed
  if (lead?.sales_stage === "survey_completed") {
    await supabase
      .from("leads")
      .update({ sales_stage: "quoted" })
      .eq("id", lead.id);

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: { from: "survey_completed", to: "quoted", quotationId },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead?.id ?? null,
    actorId: profile.id,
    eventType: parsed.id ? "quotation_updated" : "quotation_created",
    entityType: "quotation",
    entityId: quotationId!,
    metadata: {
      templateKind: parsed.templateKind,
      grandTotal: totals.grandTotal,
      status,
      custom: !lead,
    },
  });

  revalidatePath("/quotations");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath(`/quotations/${quotationId}`);
  return { id: quotationId! };
}

export async function acceptQuotation(quotationId: string) {
  const profile = await requireAuth();
  const ok =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "accept_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Missing authority: accept_quotations");

  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotations")
    .select("id, lead_id, status, company_id")
    .eq("id", quotationId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !quote) throw new Error("Quotation not found");
  if (quote.status === "accepted") return { ok: true };

  const { error: updError } = await supabase
    .from("quotations")
    .update({ status: "accepted", updated_by: profile.id })
    .eq("id", quotationId);
  if (updError) throw new Error(updError.message);

  if (quote.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, sales_stage, portal_code")
      .eq("id", quote.lead_id)
      .maybeSingle();

    if (lead && lead.sales_stage !== "lost") {
      const paymentStages = new Set([
        "token_pending_verification",
        "token_verified_and_feasibility_ok",
        "pre_dispatch_pending_verification",
        "pre_dispatch_verified",
        "final_pending_verification",
        "final_verified",
      ]);
      const portalCode = lead.portal_code || (await issuePortalCode(supabase));
      const updates: Record<string, unknown> = {
        accepted_quotation_id: quotationId,
      };
      if (!lead.portal_code) {
        updates.portal_code = portalCode;
      }
      if (!paymentStages.has(lead.sales_stage) && lead.sales_stage !== "quote_accepted") {
        updates.sales_stage = "quote_accepted";
      }

      await supabase.from("leads").update(updates).eq("id", lead.id);

      if (updates.sales_stage) {
        await logAuditEvent({
          companyId: profile.company_id,
          leadId: lead.id,
          actorId: profile.id,
          eventType: "stage_change",
          entityType: "lead",
          entityId: lead.id,
          metadata: {
            from: lead.sales_stage,
            to: "quote_accepted",
            quotationId,
            portalCode,
          },
        });
      } else if (updates.portal_code) {
        await logAuditEvent({
          companyId: profile.company_id,
          leadId: lead.id,
          actorId: profile.id,
          eventType: "portal_created",
          entityType: "lead",
          entityId: lead.id,
          metadata: { portalCode, quotationId },
        });
      }
    } else if (lead) {
      await supabase
        .from("leads")
        .update({ accepted_quotation_id: quotationId })
        .eq("id", lead.id);
    }
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: quote.lead_id,
    actorId: profile.id,
    eventType: "quotation_accepted",
    entityType: "quotation",
    entityId: quotationId,
    metadata: {},
  });

  revalidatePath("/quotations");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath("/portal");
  revalidatePath(`/quotations/${quotationId}`);
  return { ok: true };
}

export async function markQuotationSent(quotationId: string) {
  await requireQuoteWrite();
  const supabase = await createClient();
  const profile = await requireAuth();

  const { data: quote } = await supabase
    .from("quotations")
    .select("id, status")
    .eq("id", quotationId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!quote) throw new Error("Quotation not found");
  if (quote.status === "accepted") throw new Error("Already accepted");

  const { error } = await supabase
    .from("quotations")
    .update({ status: "sent", updated_by: profile.id })
    .eq("id", quotationId);
  if (error) throw new Error(error.message);

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { ok: true };
}

export async function getLeadForQuote(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, phone, address, city, sales_stage, recommended_system_kw, meter_type, company_id"
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();
  if (error || !data) {
    // meter_type may be missing before migration 024
    if (error && /meter_type|column .* does not exist/i.test(error.message)) {
      const fallback = await supabase
        .from("leads")
        .select(
          "id, name, phone, address, city, sales_stage, recommended_system_kw, company_id"
        )
        .eq("id", leadId)
        .eq("company_id", profile.company_id)
        .single();
      if (fallback.error || !fallback.data) throw new Error("Lead not found");
      return { ...fallback.data, meter_type: null as string | null };
    }
    throw new Error("Lead not found");
  }
  return data;
}

/** Active leads for the new-quotation picker (any stage except lost). */
export async function listLeadsForQuote() {
  const profile = await requireAuth();
  const supabase = await createClient();
  const canSeeAll = await canSeeAllLeads(profile);
  let query = supabase
    .from("leads")
    .select(
      "id, name, phone, city, address, sales_stage, temperature, recommended_system_kw, meter_type, updated_at"
    )
    .eq("company_id", profile.company_id)
    .neq("sales_stage", "lost")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (!canSeeAll) {
    query = query.or(leadVisibilityOrFilter(profile));
  }
  const { data, error } = await query;
  if (error) {
    if (/meter_type|column .* does not exist/i.test(error.message)) {
      let fallbackQuery = supabase
        .from("leads")
        .select(
          "id, name, phone, city, address, sales_stage, temperature, recommended_system_kw, updated_at"
        )
        .eq("company_id", profile.company_id)
        .neq("sales_stage", "lost")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!canSeeAll) {
        fallbackQuery = fallbackQuery.or(leadVisibilityOrFilter(profile));
      }
      const fallback = await fallbackQuery;
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) => ({ ...row, meter_type: null as string | null }));
    }
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function listCatalogForPage() {
  await requireAuth();
  return listCatalogItems();
}
