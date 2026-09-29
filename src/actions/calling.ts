"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { classifyCallQueue } from "@/lib/domain/calling-cycle";
import { canSeeAllLeads, ownLeadOrFilter } from "@/lib/leads/visibility";

export type CallingDeskSnapshot = {
  overdue: number;
  dueToday: number;
  unscheduled: number;
  scheduled: number;
  hot: number;
  recycled: number | null;
};

export async function getCallingDeskSnapshot(): Promise<CallingDeskSnapshot> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const seeAll = await canSeeAllLeads(profile);

  let q = supabase
    .from("leads")
    .select("temperature, next_followup_at, sales_stage")
    .eq("company_id", profile.company_id)
    .neq("sales_stage", "lost");
  if (!seeAll) q = q.or(ownLeadOrFilter(profile.id));

  const { data, error } = await q;
  if (error) {
    if (/column .* does not exist/i.test(error.message)) {
      return {
        overdue: 0,
        dueToday: 0,
        unscheduled: 0,
        scheduled: 0,
        hot: 0,
        recycled: null,
      };
    }
    throw new Error(error.message);
  }

  const now = new Date();
  const counts: CallingDeskSnapshot = {
    overdue: 0,
    dueToday: 0,
    unscheduled: 0,
    scheduled: 0,
    hot: 0,
    recycled: null,
  };
  for (const row of data ?? []) {
    if (row.temperature === "hot") counts.hot += 1;
    const bucket = classifyCallQueue(row.next_followup_at, now);
    if (bucket === "overdue") counts.overdue += 1;
    else if (bucket === "due_today") counts.dueToday += 1;
    else if (bucket === "unscheduled") counts.unscheduled += 1;
    else counts.scheduled += 1;
  }
  return counts;
}

export async function runCallingCycleNow() {
  const profile = await requireAuth();
  const allowed =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "manage_settings")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!allowed) throw new Error("Only Admin or Sales Manager can run the calling cycle");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("recycle_frs_calling_cycle", {
    p_company_id: profile.company_id,
  });
  if (error) {
    if (/recycle_frs_calling_cycle|does not exist/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/056_calling_cycle.sql on this database.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/pipeline");
  revalidatePath("/");
  return { recycled: typeof data === "number" ? data : Number(data ?? 0) };
}
