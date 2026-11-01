"use server";

import { revalidatePath } from "next/cache";
import { getQuotationContext } from "@/lib/quotations/context";
import { calcQuotationTotals, calcLineTotal } from "@/lib/quotations/quote-math";
import { defaultSiteCharges, normalizeSiteCharges } from "@/lib/quotations/site-charges";
import { quotationSchema } from "@/lib/quotations/validations";
import { allocateQuotationNumber } from "@/lib/quotations/actions/quotation-number";
import { assertSystemCostAllowed, enforceQuotationSubsidyMatrix } from "@/lib/quotations/subsidy";
import { logAuditEvent } from "@/lib/audit";
import { persistQuotationRow } from "@/lib/quotations/quotation-persist";
import { loadQuotationDeleteBlockers } from "@/lib/quotations/delete-guard";

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

function dbError(error: { message?: string; code?: string; details?: string } | null, fallback: string) {
  const parts = [error?.message, error?.details, error?.code ? `(${error.code})` : null].filter(Boolean);
  return new Error(parts.join(" — ") || fallback);
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues?: Array<{ path?: (string | number)[]; message?: string }> }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .slice(0, 3)
        .map((i) => `${(i.path ?? []).join(".") || "field"}: ${i.message ?? "invalid"}`)
        .join("; ");
    }
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return "Failed to save quotation";
}

export type UpsertQuotationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function upsertQuotation(input: unknown): Promise<UpsertQuotationResult> {
  try {
    const data = quotationSchema.parse(input);
    const { supabase, userId, companyId, canManageQuotations, canEditQuotations } =
      await getQuotationContext();

    if (data.id) {
      if (!canEditQuotations) {
        return { ok: false, error: "You do not have permission to edit quotations." };
      }
      const { data: existing } = await supabase
        .from("quotations")
        .select("status")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!existing) return { ok: false, error: "Quotation not found." };
    } else if (!canManageQuotations) {
      return { ok: false, error: "You do not have permission to create quotations." };
    }

    if (
      data.projectType !== "commercial" &&
      data.ratePackageId &&
      data.systemCost != null &&
      data.minSalePriceSnapshot != null
    ) {
      const net =
        Number(data.systemCost) - Math.max(0, Number(data.discountAmount ?? 0));
      assertSystemCostAllowed(net, Number(data.minSalePriceSnapshot));
    }

    const subsidyMatrix = enforceQuotationSubsidyMatrix({
      projectType: data.projectType,
      subsidyScheme: data.subsidyScheme,
      subsidy: data.subsidy,
    });
    data.projectType = subsidyMatrix.projectType;
    data.subsidyScheme = subsidyMatrix.subsidyScheme;
    data.subsidy = subsidyMatrix.subsidy;

    const siteCharges = normalizeSiteCharges(data.siteCharges ?? defaultSiteCharges());
    const t = calcQuotationTotals(data.items, siteCharges);
    const now = new Date().toISOString();

    const lead = data.leadId ? await loadLead(supabase, companyId, data.leadId) : null;
    if (lead?.sales_stage === "lost") {
      return { ok: false, error: "Cannot create a quotation for a lost lead." };
    }

    const extraCharges =
      Number(data.meterChargeAmount ?? 0) + Number(data.gedaChargeAmount ?? 0);
    const grandTotal = Math.max(0, t.total + extraCharges);

    // New quotes always take the next number from the numbering sequence.
    const quotationNo = data.id ? data.quotationNo : await allocateQuotationNumber();

    const base = {
      company_id: companyId,
      quotation_no: quotationNo,
      lead_id: data.leadId ?? null,
      template_kind: "solar",
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      customer_address: data.address ?? null,
      project_type: data.projectType ?? "residential",
      status: data.status,
      quote_date: data.quoteDate,
      valid_till: data.validTill,
      subtotal: r2(t.subtotal + extraCharges),
      discount_total: t.discount,
      discount_percent: Number(data.discountPercent ?? 0),
      taxable_total: r2(t.taxable + extraCharges),
      gst_total: t.gst,
      grand_total: grandTotal,
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      site_charges: siteCharges,
      rate_package_id: data.ratePackageId ?? null,
      module_type_name: data.moduleTypeName ?? null,
      module_company_name: data.moduleCompanyName ?? null,
      module_capacity_label: data.moduleCapacityLabel ?? null,
      inverter_type_name: data.inverterTypeName ?? null,
      inverter_size_label: data.inverterSizeLabel ?? null,
      system_size_kw: data.systemSizeKw ?? null,
      panel_count: data.panelCount ?? null,
      system_cost: data.systemCost ?? null,
      min_sale_price_snapshot: data.minSalePriceSnapshot ?? null,
      subsidy_scheme: data.subsidyScheme,
      subsidy: data.subsidy ?? 0,
      meter_phase: data.meterPhase ?? null,
      meter_charge_amount: data.meterChargeAmount ?? null,
      meter_charges: Number(data.meterChargeAmount ?? 0),
      meter_phase_label: data.meterPhaseLabel ?? null,
      price_per_kw_excl_gst: data.pricePerKwExclGst ?? null,
      commercial_gst_percent:
        data.projectType === "commercial"
          ? (data.commercialGstPercent ?? null)
          : null,
      geda_charge_amount: data.gedaChargeAmount ?? null,
      panel_mount_type: data.panelMountType ?? null,
      tier_type: data.tierType ?? "premium",
      rate_per_kw_snapshot: data.ratePerKwSnapshot ?? null,
      net_payable_amount: data.netPayableAmount ?? null,
      updated_by: userId,
      updated_at: now,
    };

    let saved: { id: string };
    if (data.id) {
      await persistQuotationRow(supabase, "update", base, {
        id: data.id,
        companyId,
      });
      saved = { id: data.id };
    } else {
      let inserted: { id: string } | null = null;
      let lastError: { message?: string; code?: string; details?: string } | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const attemptNo =
          attempt === 0 ? quotationNo : await allocateQuotationNumber();
        const newId = crypto.randomUUID();

        try {
          await persistQuotationRow(supabase, "insert", {
            id: newId,
            ...base,
            quotation_no: attemptNo,
            created_by: userId,
          });
          inserted = { id: newId };
          break;
        } catch (error) {
          lastError =
            error && typeof error === "object"
              ? (error as { message?: string; code?: string; details?: string })
              : { message: String(error) };
          if (lastError?.code !== "23505") break;
        }
      }

      if (!inserted) {
        throw dbError(lastError, "Failed to create quotation");
      }
      saved = inserted;
    }

    const { error: deleteError } = await supabase
      .from("quotation_items")
      .delete()
      .eq("quotation_id", saved.id);
    if (deleteError) throw dbError(deleteError, "Failed to clear quotation items");

    const { error: insertError } = await supabase.from("quotation_items").insert(
      data.items.map((item, idx) => ({
        quotation_id: saved.id,
        sort_order: idx,
        item_id: item.itemId ?? null,
        item_name_snapshot: item.itemName,
        brand_snapshot: item.brand ?? null,
        model_snapshot: item.model ?? null,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_percent: item.gstPercent,
        discount_value: item.discountValue,
        line_total: calcLineTotal(item),
        image_url_snapshot: item.imageUrl?.trim() || null,
        brand_image_url_snapshot: item.brandImageUrl?.trim() || null,
      }))
    );
    if (insertError) throw dbError(insertError, "Failed to save quotation items");

    // First quote from a completed survey moves the lead to "quoted".
    if (lead?.sales_stage === "survey_completed") {
      await supabase.from("leads").update({ sales_stage: "quoted" }).eq("id", lead.id);
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        actorId: userId,
        eventType: "stage_change",
        entityType: "lead",
        entityId: lead.id,
        metadata: { from: "survey_completed", to: "quoted", quotationId: saved.id },
      });
    }

    await logAuditEvent({
      companyId,
      leadId: lead?.id ?? null,
      actorId: userId,
      eventType: data.id ? "quotation_updated" : "quotation_created",
      entityType: "quotation",
      entityId: saved.id,
      metadata: {
        templateKind: "solar",
        projectType: data.projectType ?? "residential",
        grandTotal,
        status: data.status,
        custom: !lead,
      },
    });

    try {
      revalidatePath("/quotations");
      revalidatePath("/pipeline");
      revalidatePath("/customers");
      revalidatePath(`/quotations/${saved.id}`);
    } catch (err) {
      console.error("[upsertQuotation] revalidatePath", err);
    }
    return { ok: true, id: saved.id };
  } catch (err) {
    console.error("[upsertQuotation]", err);
    return { ok: false, error: errorMessage(err) };
  }
}

export async function duplicateQuotation(id: string): Promise<string> {
  const { supabase, userId, companyId, canManageQuotations } = await getQuotationContext();
  if (!canManageQuotations) {
    throw new Error("You do not have permission to modify quotations.");
  }
  const { data: orig, error } = await supabase
    .from("quotations")
    .select("*,quotation_items(*)")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (error) throw dbError(error, "Failed to load quotation");

  const { data: q, error: insertError } = await supabase
    .from("quotations")
    .insert({
      company_id: companyId,
      quotation_no: `${orig.quotation_no}-R${Date.now().toString().slice(-4)}`,
      lead_id: orig.lead_id,
      template_kind: orig.template_kind ?? "solar",
      customer_name: orig.customer_name,
      customer_phone: orig.customer_phone,
      customer_address: orig.customer_address,
      project_type: orig.project_type ?? "residential",
      status: "draft",
      quote_date: new Date().toISOString().slice(0, 10),
      valid_till: orig.valid_till,
      subtotal: orig.subtotal,
      discount_total: orig.discount_total,
      taxable_total: orig.taxable_total,
      gst_total: orig.gst_total,
      grand_total: orig.grand_total,
      notes: orig.notes,
      terms: orig.terms,
      site_charges: orig.site_charges ?? null,
      rate_package_id: orig.rate_package_id ?? null,
      module_type_name: orig.module_type_name ?? null,
      module_company_name: orig.module_company_name ?? null,
      module_capacity_label: orig.module_capacity_label ?? null,
      inverter_type_name: orig.inverter_type_name ?? null,
      inverter_size_label: orig.inverter_size_label ?? null,
      system_size_kw: orig.system_size_kw ?? null,
      panel_count: orig.panel_count ?? null,
      system_cost: orig.system_cost ?? null,
      min_sale_price_snapshot: orig.min_sale_price_snapshot ?? null,
      subsidy_scheme: orig.subsidy_scheme ?? "residential",
      subsidy: orig.subsidy ?? null,
      meter_phase: orig.meter_phase ?? null,
      meter_charge_amount: orig.meter_charge_amount ?? null,
      meter_phase_label: orig.meter_phase_label ?? null,
      price_per_kw_excl_gst: orig.price_per_kw_excl_gst ?? null,
      commercial_gst_percent: orig.commercial_gst_percent ?? null,
      geda_charge_amount: orig.geda_charge_amount ?? null,
      panel_mount_type: orig.panel_mount_type ?? null,
      tier_type: orig.tier_type ?? "premium",
      rate_per_kw_snapshot: orig.rate_per_kw_snapshot ?? null,
      net_payable_amount: orig.net_payable_amount ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (insertError) throw dbError(insertError, "Failed to duplicate quotation");

  if (orig.quotation_items?.length) {
    const { error: itemsError } = await supabase.from("quotation_items").insert(
      orig.quotation_items.map(({ id: _id, quotation_id: _qid, ...rest }: Record<string, unknown>) => ({
        ...rest,
        quotation_id: q.id,
      }))
    );
    if (itemsError) throw dbError(itemsError, "Failed to duplicate quotation items");
  }

  revalidatePath("/quotations");
  return q.id;
}

export async function updateQuotationStatus(id: string, status: string) {
  const { supabase, companyId, canManageQuotations } = await getQuotationContext();
  if (!canManageQuotations) throw new Error("You do not have permission to modify quotations.");
  const { error } = await supabase
    .from("quotations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw dbError(error, "Failed to update status");
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function getQuotationDeleteBlockers(
  ids: string[]
): Promise<Record<string, string[]>> {
  const { supabase, companyId, canDeleteQuotations } = await getQuotationContext();
  if (!canDeleteQuotations) return {};
  return loadQuotationDeleteBlockers(supabase, companyId, ids);
}

export type DeleteQuotationResult =
  | { ok: true }
  | { ok: false; error: string; reasons?: string[] };

export async function deleteQuotation(
  id: string,
  reason?: string
): Promise<DeleteQuotationResult> {
  try {
    const { supabase, companyId, userId, canDeleteQuotations } = await getQuotationContext();
    if (!canDeleteQuotations) {
      return { ok: false, error: "You do not have permission to delete quotations." };
    }

    const { data: quote, error: loadError } = await supabase
      .from("quotations")
      .select("id, quotation_no, lead_id, status, grand_total, customer_name")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    if (!quote) return { ok: false, error: "Quotation not found." };

    const reasons = (await loadQuotationDeleteBlockers(supabase, companyId, [id]))[id] ?? [];
    if (reasons.length > 0) {
      return { ok: false, error: "This quotation cannot be deleted.", reasons };
    }

    const trimmedReason = reason?.trim() || null;
    const { error } = await supabase.rpc("soft_delete_quotation", {
      p_id: id,
      p_reason: trimmedReason,
    });
    if (error) {
      if (/soft_delete_quotation|function .* does not exist/i.test(error.message)) {
        return {
          ok: false,
          error:
            "Recycle bin is not set up. Run supabase/migrations/057_quotation_recycle_bin.sql in the Supabase SQL editor.",
        };
      }
      return { ok: false, error: dbError(error, "Failed to delete quotation").message };
    }

    await logAuditEvent({
      companyId,
      leadId: quote.lead_id ?? null,
      actorId: userId,
      eventType: "quotation_deleted",
      entityType: "quotation",
      entityId: id,
      metadata: {
        soft: true,
        reason: trimmedReason,
        quotation_no: quote.quotation_no,
        status: quote.status,
        grand_total: quote.grand_total,
        customer_name: quote.customer_name,
      },
    });

    revalidatePath("/quotations");
    revalidatePath("/quotations/bin");
    revalidatePath("/pipeline");
    revalidatePath("/customers");
    if (quote.lead_id) revalidatePath(`/leads/${quote.lead_id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export type DeletedQuotationRow = {
  id: string;
  quotation_no: string;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  grand_total: number;
  lead_id: string | null;
  lead_name: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  delete_reason: string | null;
};

export type ListDeletedQuotationsResult =
  | { ok: true; rows: DeletedQuotationRow[] }
  | { ok: false; error: string };

export async function listDeletedQuotations(): Promise<ListDeletedQuotationsResult> {
  try {
    const { supabase, canViewRecycleBin } = await getQuotationContext();
    if (!canViewRecycleBin) {
      return { ok: false, error: "You do not have access to the Recycle bin." };
    }
    const { data, error } = await supabase.rpc("list_deleted_quotations");
    if (error) {
      if (/list_deleted_quotations|function .* does not exist/i.test(error.message)) {
        return {
          ok: false,
          error:
            "Recycle bin is not set up. Run supabase/migrations/057_quotation_recycle_bin.sql in the Supabase SQL editor.",
        };
      }
      return { ok: false, error: error.message };
    }
    const rows = ((data ?? []) as DeletedQuotationRow[]).map((r) => ({
      ...r,
      grand_total: Number(r.grand_total) || 0,
    }));
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function countDeletedQuotations(): Promise<number> {
  const res = await listDeletedQuotations();
  return res.ok ? res.rows.length : 0;
}

export type RestoreQuotationResult =
  | { ok: true; note?: string }
  | { ok: false; error: string };

export async function restoreQuotation(id: string): Promise<RestoreQuotationResult> {
  try {
    const { supabase, companyId, userId, canRestoreQuotations } = await getQuotationContext();
    if (!canRestoreQuotations) {
      return { ok: false, error: "You do not have permission to restore quotations." };
    }

    const { error } = await supabase.rpc("restore_quotation", { p_id: id });
    if (error) return { ok: false, error: dbError(error, "Failed to restore quotation").message };

    const { data: quote } = await supabase
      .from("quotations")
      .select("id, quotation_no, lead_id, status, grand_total, customer_name")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    let note: string | undefined;
    if (quote && !quote.lead_id) {
      note = "Restored as a custom-customer quotation (no linked lead).";
    } else if (quote?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("sales_stage")
        .eq("id", quote.lead_id)
        .maybeSingle();
      if (lead?.sales_stage === "lost") note = "Restored. Note: the linked lead is marked Lost.";
    }

    await logAuditEvent({
      companyId,
      leadId: quote?.lead_id ?? null,
      actorId: userId,
      eventType: "quotation_restored",
      entityType: "quotation",
      entityId: id,
      metadata: {
        quotation_no: quote?.quotation_no ?? null,
        status: quote?.status ?? null,
        grand_total: quote?.grand_total ?? null,
        customer_name: quote?.customer_name ?? null,
      },
    });

    revalidatePath("/quotations");
    revalidatePath("/quotations/bin");
    revalidatePath("/pipeline");
    revalidatePath("/customers");
    return { ok: true, note };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function purgeQuotation(
  id: string,
  meta: { quotationNo: string; customerName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, companyId, userId, canPurgeQuotations } = await getQuotationContext();
    if (!canPurgeQuotations) {
      return { ok: false, error: "Only admins can delete quotations permanently." };
    }

    const { error } = await supabase.rpc("purge_quotation", { p_id: id });
    if (error) return { ok: false, error: dbError(error, "Failed to delete permanently").message };

    await logAuditEvent({
      companyId,
      leadId: null,
      actorId: userId,
      eventType: "quotation_purged",
      entityType: "quotation",
      entityId: id,
      metadata: { quotation_no: meta.quotationNo, customer_name: meta.customerName },
    });

    revalidatePath("/quotations/bin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function loadLead(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  leadId: string
) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, address, city, sales_stage")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw dbError(error, "Failed to load lead");
  if (!data) throw new Error("Lead not found");
  return data as {
    id: string;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    sales_stage: string;
  };
}
