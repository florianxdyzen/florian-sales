-- FRS Phase 4 — dual trade ledger (dated lines + summary, not warehouse qty).

INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_trade_ledger', 'View Trade Ledger', 'accounts'),
  ('log_trade_outward', 'Log Outward Trade', 'accounts'),
  ('log_trade_inward', 'Log Inward Trade', 'accounts'),
  ('manage_trade_skus', 'Manage Trade SKUs', 'accounts')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, slug FROM roles WHERE slug IN ('admin', 'sales_manager')
  LOOP
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r.id, key, true FROM (VALUES
      ('view_trade_ledger'),
      ('log_trade_outward'),
      ('log_trade_inward'),
      ('manage_trade_skus')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR r IN
    SELECT id FROM roles WHERE slug IN ('sales_executive', 'tele_caller')
  LOOP
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r.id, key, true FROM (VALUES
      ('view_trade_ledger'),
      ('log_trade_outward')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR r IN
    SELECT id FROM roles WHERE slug = 'accounts'
  LOOP
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r.id, key, true FROM (VALUES
      ('view_trade_ledger'),
      ('log_trade_inward')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS trade_skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL
    CHECK (direction IN ('outward', 'inward', 'both')),
  name VARCHAR(160) NOT NULL,
  family VARCHAR(32) NOT NULL DEFAULT 'other'
    CHECK (family IN ('combo', 'bos', 'panel', 'hardware', 'other')),
  uom VARCHAR(24) NOT NULL DEFAULT 'unit',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_skus_company_name_uidx
  ON trade_skus (company_id, lower(name), direction);

CREATE INDEX IF NOT EXISTS idx_trade_skus_company
  ON trade_skus (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS trade_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL
    CHECK (direction IN ('outward', 'inward')),
  occurred_on DATE NOT NULL,
  sku_id UUID REFERENCES trade_skus(id) ON DELETE SET NULL,
  sku_or_description VARCHAR(240) NOT NULL,
  family VARCHAR(32) NOT NULL DEFAULT 'other'
    CHECK (family IN ('combo', 'bos', 'panel', 'hardware', 'other')),
  qty NUMERIC(14, 3) NOT NULL CHECK (qty > 0),
  uom VARCHAR(24) NOT NULL DEFAULT 'unit',
  amount_inr NUMERIC(14, 2),
  external_invoice_no VARCHAR(80),
  gr_no VARCHAR(80),
  status VARCHAR(16) NOT NULL DEFAULT 'logged'
    CHECK (status IN ('logged', 'dispatched', 'received')),
  dispatched_on DATE,
  received_on DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_entries_account
  ON trade_entries (company_id, lead_id, direction, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_trade_entries_occurred
  ON trade_entries (company_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS trade_entry_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES trade_entries(id) ON DELETE CASCADE,
  kind VARCHAR(24) NOT NULL
    CHECK (kind IN ('invoice', 'gr', 'purchase_bill', 'other')),
  title VARCHAR(160),
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_entry_attachments_entry
  ON trade_entry_attachments (entry_id);

DROP TRIGGER IF EXISTS trade_skus_updated_at ON trade_skus;
CREATE TRIGGER trade_skus_updated_at
  BEFORE UPDATE ON trade_skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trade_entries_updated_at ON trade_entries;
CREATE TRIGGER trade_entries_updated_at
  BEFORE UPDATE ON trade_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Florian Sales: trade catalogue starts empty. Staff name their own SKUs.

ALTER TABLE trade_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_entry_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_skus_select ON trade_skus FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_trade_ledger')
      OR has_authority('manage_trade_skus')
      OR has_authority('full_access')
    )
  );

CREATE POLICY trade_skus_manage ON trade_skus FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('manage_trade_skus') OR has_authority('full_access'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_trade_skus') OR has_authority('full_access'))
  );

CREATE POLICY trade_entries_select ON trade_entries FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('view_trade_ledger') OR has_authority('full_access'))
  );

CREATE POLICY trade_entries_insert ON trade_entries FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR (direction = 'outward' AND has_authority('log_trade_outward'))
      OR (direction = 'inward' AND has_authority('log_trade_inward'))
    )
  );

CREATE POLICY trade_entries_update ON trade_entries FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR (direction = 'outward' AND has_authority('log_trade_outward'))
      OR (direction = 'inward' AND has_authority('log_trade_inward'))
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('full_access')
      OR (direction = 'outward' AND has_authority('log_trade_outward'))
      OR (direction = 'inward' AND has_authority('log_trade_inward'))
    )
  );

CREATE POLICY trade_entries_delete ON trade_entries FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('manage_trade_skus') OR has_authority('full_access'))
  );

CREATE POLICY trade_entry_attachments_select ON trade_entry_attachments FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('view_trade_ledger') OR has_authority('full_access'))
  );

CREATE POLICY trade_entry_attachments_insert ON trade_entry_attachments FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR has_authority('log_trade_outward')
      OR has_authority('log_trade_inward')
    )
  );

CREATE POLICY trade_entry_attachments_delete ON trade_entry_attachments FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR has_authority('log_trade_outward')
      OR has_authority('log_trade_inward')
      OR has_authority('manage_trade_skus')
    )
  );
