import { createAdminClient } from "@/lib/supabase/admin";

const COMPANY_SLUG = "rk-solar";

/** Resolve RK Bhabhor company id for public ad submits. */
export async function resolveAdsCompanyId(): Promise<string> {
  const fromEnv = (process.env.ADS_COMPANY_ID ?? process.env.FACEBOOK_DEFAULT_COMPANY_ID ?? "").trim();
  if (fromEnv) return fromEnv;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .eq("slug", COMPANY_SLUG)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Could not resolve company for ad submissions");
  }
  return data.id as string;
}
