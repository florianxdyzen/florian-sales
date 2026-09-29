import { createClient } from "@supabase/supabase-js";
import { getSupabaseClientOptions, getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/env";

/** Server-only admin client — requires SUPABASE_SERVICE_ROLE_KEY */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceKey = getSupabaseServiceRoleKey();

  return createClient(url, serviceKey, {
    ...getSupabaseClientOptions(),
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
