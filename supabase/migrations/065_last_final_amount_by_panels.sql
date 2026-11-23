-- Remember last Final Amount by watt peak × panel count for solar quotes.
-- Safe to re-run.

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS last_final_amount_by_panels JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN quotation_company_settings.last_final_amount_by_panels IS
  'Map of "{wattPeak}x{panelCount}" → { amount, updatedAt } from last solar quote Final Amount.';
