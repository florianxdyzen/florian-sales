-- Florian Sales — company profit & loss. Reads trade_entries.amount_inr. No new money tables.

INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_profit', 'View Profit and Loss', 'accounts')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_profit', true
FROM roles r
WHERE r.slug IN ('admin', 'accounts')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS trade_entries_select ON trade_entries;
CREATE POLICY trade_entries_select ON trade_entries FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_trade_ledger')
      OR has_authority('view_profit')
      OR has_authority('full_access')
    )
  );
