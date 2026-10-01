-- Inverter catalog was created without row policies. Hosted Supabase enables RLS on
-- new tables, so inserts were rejected and the app hid the database message.

ALTER TABLE rate_card_inverters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_card_inverters_select ON rate_card_inverters;
CREATE POLICY rate_card_inverters_select ON rate_card_inverters FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_inverters_manage ON rate_card_inverters;
CREATE POLICY rate_card_inverters_manage ON rate_card_inverters FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_card_inverters TO authenticated;
GRANT ALL ON rate_card_inverters TO service_role;
