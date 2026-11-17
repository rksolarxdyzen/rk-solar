import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdsCompanyId } from "@/lib/ads/company";
import { isValidAdPhone, normalizeAdPhone } from "@/lib/ads/phone";
import type { AdSubmitInput } from "@/lib/ads/types";

export type AdSubmitResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status: number };

function clean(value: string | undefined | null, max = 200): string | null {
  const t = (value ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Persist a public ad enquiry (service role). */
export async function submitAdCampaignEnquiry(input: AdSubmitInput): Promise<AdSubmitResult> {
  // Honeypot — treat as soft success so bots do not retry
  if ((input.website ?? "").trim()) {
    return { ok: true, id: "ignored" };
  }

  const name = (input.name ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Please enter your name", status: 400 };
  }

  const phone = normalizeAdPhone(input.phone ?? "");
  if (!isValidAdPhone(phone)) {
    return { ok: false, error: "Enter a valid 10-digit mobile number", status: 400 };
  }

  const companyId = await resolveAdsCompanyId();
  const admin = createAdminClient();

  // Soft rate limit: same phone within 10 minutes
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("ad_campaign_submissions")
    .select("id")
    .eq("company_id", companyId)
    .eq("phone", phone)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (recent?.id) {
    return { ok: true, id: recent.id as string };
  }

  const { data, error } = await admin
    .from("ad_campaign_submissions")
    .insert({
      company_id: companyId,
      name: name.slice(0, 120),
      phone,
      email: clean(input.email, 160),
      city: clean(input.city, 80),
      capacity_interest: clean(input.capacityInterest, 40),
      message: clean(input.message, 1000),
      campaign: clean(input.campaign, 80) ?? "default",
      utm_source: clean(input.utmSource, 80),
      utm_medium: clean(input.utmMedium, 80),
      utm_campaign: clean(input.utmCampaign, 120),
      utm_content: clean(input.utmContent, 120),
      utm_term: clean(input.utmTerm, 120),
      gclid: clean(input.gclid, 200),
      fbclid: clean(input.fbclid, 200),
      landing_path: clean(input.landingPath, 80) ?? "/go",
      user_agent: clean(input.userAgent, 300),
      ip_hash: clean(input.ipHash, 64),
      status: "new",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? "Could not save enquiry", status: 500 };
  }

  return { ok: true, id: data.id as string };
}
