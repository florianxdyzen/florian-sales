-- Solar quotation bill of materials.
-- bom_items: this quotation only.
-- last_bom_items: the list used to start the next solar quotation.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS bom_items JSONB;

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS last_bom_items JSONB;

COMMENT ON COLUMN quotations.bom_items IS
  'Solar materials list for this quotation (component, spec, qty, make, image). Null uses the Florian sample list.';

COMMENT ON COLUMN quotation_company_settings.last_bom_items IS
  'Last solar materials list saved when "this quotation only" is off. Null uses the Florian sample list.';
