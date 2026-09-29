import type { createAdminClient } from "@/lib/supabase/admin";

const ALERT_TYPE = "daily_report_failed";

export async function upsertDailyReportFailedAlert(
  admin: ReturnType<typeof createAdminClient>,
  input: { companyId: string; message: string }
) {
  const { data: existing } = await admin
    .from("reminders")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("reminder_type", ALERT_TYPE)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("reminders")
      .update({
        message: input.message,
        due_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) console.error("[daily-report] update alert", error.message);
    return;
  }

  const { error } = await admin.from("reminders").insert({
    company_id: input.companyId,
    lead_id: null,
    reminder_type: ALERT_TYPE,
    message: input.message,
    due_at: new Date().toISOString(),
  });
  if (error) console.error("[daily-report] insert alert", error.message);
}

export async function resolveDailyReportFailedAlerts(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string
) {
  const { error } = await admin
    .from("reminders")
    .update({ resolved_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("reminder_type", ALERT_TYPE)
    .is("resolved_at", null);
  if (error) console.error("[daily-report] resolve alert", error.message);
}

export function dailyReportAlertMessage(opts: {
  status: "failed" | "logged";
  error?: string | null;
  recipientCount: number;
}): string {
  if (opts.status === "logged") {
    return `Evening report was logged, not emailed (${opts.recipientCount} recipient${
      opts.recipientCount === 1 ? "" : "s"
    }). Set RESEND_API_KEY, then Retry.`;
  }
  return `Evening report failed: ${opts.error?.trim() || "send error"}. Retry after fixing Resend / recipients.`;
}
