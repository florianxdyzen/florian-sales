-- Structure micron on quotations + company prefs for last inverter / subsidy.
-- Safe to re-run.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS structure_micron SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_structure_micron_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_structure_micron_check
      CHECK (structure_micron IS NULL OR structure_micron IN (40, 60, 80));
  END IF;
END $$;

COMMENT ON COLUMN quotations.structure_micron IS
  'HDGI structure coating: 40 / 60 / 80 micron. Auto from system kW with staff override.';

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS last_inverter_by_kw JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_subsidy_under_3kw JSONB;

COMMENT ON COLUMN quotation_company_settings.last_inverter_by_kw IS
  'Map of system-kW key (1 decimal) → { make, sizeLabel, updatedAt } from last solar quote.';

COMMENT ON COLUMN quotation_company_settings.last_subsidy_under_3kw IS
  '{ amount, scheme, updatedAt } from last solar quote with system size under 3 kW.';
