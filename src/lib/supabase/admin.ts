import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/env";

/** Server-only admin client — requires SUPABASE_SERVICE_ROLE_KEY */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceKey = getSupabaseServiceRoleKey();

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
