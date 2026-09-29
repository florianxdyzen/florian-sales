"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { ACCOUNT_CODE_PREFIX } from "@/lib/domain/account-code";

export type AccountCodeSettings = {
  prefix: typeof ACCOUNT_CODE_PREFIX;
  nextN: number;
  preview: string;
};

async function requireCodeAdmin() {
  const profile = await requireAuth();
  const allowed =
    profile.role === "admin" ||
    (await hasAuthority(profile.id, "manage_settings")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!allowed) throw new Error("Only Admin can change the account code start.");
  return profile;
}

export async function getAccountCodeSettings(): Promise<AccountCodeSettings> {
  await requireCodeAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_frs_account_code_seq");
  if (error) {
    if (/get_frs_account_code_seq|does not exist/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/060_discovery_lock.sql on this database.");
    }
    throw new Error(error.message);
  }
  const nextN = Math.max(1, Number(data ?? 1) || 1);
  return { prefix: ACCOUNT_CODE_PREFIX, nextN, preview: `${ACCOUNT_CODE_PREFIX}${nextN}` };
}

export async function saveAccountCodeStart(nextN: number) {
  await requireCodeAdmin();
  const n = Math.floor(Number(nextN));
  if (!Number.isFinite(n) || n < 1) throw new Error("Start number must be at least 1.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_frs_account_code_start", { p_next: n });
  if (error) {
    if (/set_frs_account_code_start|does not exist/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/060_discovery_lock.sql on this database.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/settings");
  const applied = Math.max(1, Number(data ?? n) || n);
  return { nextN: applied, preview: `${ACCOUNT_CODE_PREFIX}${applied}` };
}
