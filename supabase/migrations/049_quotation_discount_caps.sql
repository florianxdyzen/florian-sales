-- Recare Phase F: Owner discount caps (default 0 = no discount until raised).
-- Also snapshot PDF template fields on each quotation so later template edits
-- do not rewrite issued quotes.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS max_discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount_per_kw NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS max_discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount_per_kw NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

COMMENT ON COLUMN companies.max_discount_percent IS
  'Max header discount % on solar quotes. 0 = no percent discount unless raised.';
COMMENT ON COLUMN companies.max_discount_per_kw IS
  'Max discount ₹ per system kW. 0 = no rupee/kW discount unless raised.';
COMMENT ON COLUMN quotations.template_snapshot IS
  'PDF-relevant template fields copied at quote save (cables, BOS, terms, payment %).';
