"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

const referrerSchema = z.object({
  portalCode: z.string().min(4),
  phone: z.string().min(8),
  referrerName: z.string().trim().max(120).optional().nullable(),
  referrerPhone: z.string().trim().max(20).optional().nullable(),
});

/** Customer portal: update reference person details (authenticated by code + phone). */
export async function portalUpdateReferrer(input: unknown) {
  const data = referrerSchema.parse(input);
  const admin = createAdminClient();
  const code = data.portalCode.trim().toUpperCase();
  const phone = normalizePhone(data.phone);

  const { data: lead, error } = await admin
    .from("leads")
    .select("id, company_id, phone, portal_code")
    .eq("portal_code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Invalid portal code");
  if (normalizePhone(lead.phone) !== phone) {
    throw new Error("Phone number does not match this project");
  }

  const referrerName = data.referrerName?.trim() || null;
  const referrerPhoneRaw = data.referrerPhone?.trim() || null;
  const referrerPhone = referrerPhoneRaw
    ? normalizePhone(referrerPhoneRaw) || referrerPhoneRaw
    : null;

  const { error: updateError } = await admin
    .from("leads")
    .update({
      referrer_name: referrerName,
      referrer_phone: referrerPhone,
    })
    .eq("id", lead.id)
    .eq("company_id", lead.company_id);

  if (updateError) throw new Error(updateError.message);

  await admin.from("audit_events").insert({
    company_id: lead.company_id,
    lead_id: lead.id,
    actor_id: null,
    event_type: "portal_referrer_updated",
    entity_type: "lead",
    entity_id: lead.id,
    metadata: { via: "customer_portal", hasReferrer: Boolean(referrerName || referrerPhone) },
  });

  revalidatePath("/portal");
  revalidatePath(`/portal/${code}`);
  revalidatePath("/customers");
  return { ok: true as const };
}
