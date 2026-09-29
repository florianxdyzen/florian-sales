-- Recare Phase G: evening digest failures can alert Owner without a lead.

ALTER TABLE reminders
  ALTER COLUMN lead_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_open_daily_report_failed
  ON reminders (company_id)
  WHERE reminder_type = 'daily_report_failed' AND resolved_at IS NULL;

COMMENT ON COLUMN reminders.lead_id IS
  'Nullable for company-level alerts such as daily_report_failed.';
