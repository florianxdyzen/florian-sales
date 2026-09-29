import { createAdminClient } from "@/lib/supabase/admin";

/** Daily circular recycle — cold/warm, last touch older than 30 days. */
export async function runCallingCycleJob() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("recycle_frs_calling_cycle", {
    p_company_id: null,
  });
  if (error) {
    if (/recycle_frs_calling_cycle|does not exist/i.test(error.message)) {
      return { recycled: 0, skipped: true as const };
    }
    throw new Error(error.message);
  }
  return { recycled: typeof data === "number" ? data : Number(data ?? 0), skipped: false as const };
}
