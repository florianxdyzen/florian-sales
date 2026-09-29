"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { runDailyReportJobs } from "@/lib/jobs/daily-report";

export type RetryDailyReportResult =
  | { ok: true; sent: number; failed: number; skipped: number; details: string }
  | { ok: false; error: string };

export async function retryDailyEveningReport(): Promise<RetryDailyReportResult> {
  const profile = await requireAuth();
  const allowed =
    profile.role === "admin" ||
    (await hasAuthority(profile.id, "full_access")) ||
    (await hasAuthority(profile.id, "manage_settings"));
  if (!allowed) {
    return { ok: false, error: "Only Owner can retry the evening report." };
  }

  try {
    const result = await runDailyReportJobs({
      force: true,
      companyId: profile.company_id,
    });
    revalidatePath("/alerts");
    revalidatePath("/");
    const firstError = result.details.find((d) => d.error)?.error;
    if (result.failed > 0) {
      return {
        ok: false,
        error: firstError || `Evening report still failed (${result.failed}).`,
      };
    }
    const logged = result.details.some((d) => d.status === "logged");
    if (logged) {
      return {
        ok: false,
        error: "Report was logged, not emailed. Set RESEND_API_KEY then Retry.",
      };
    }
    return {
      ok: true,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      details: `Sent ${result.sent} · skipped ${result.skipped}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Retry failed",
    };
  }
}
