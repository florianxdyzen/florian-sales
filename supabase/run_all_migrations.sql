-- ============================================================
-- Florian Sales — combined migrations
-- ============================================================
-- Paste this entire file into Supabase SQL Editor and run it.
-- Intended for a dedicated Cloud project (schema public).
-- Do not apply this file to the FRS or Florian inventory database.
--
-- Generated from 57 files in supabase/migrations/
-- Includes:
--   - 001_init.sql
--   - 002_lms.sql
--   - 003_dual_assignee.sql
--   - 004_surveys.sql
--   - 005_ingestion.sql
--   - 006_fix_auth_trigger.sql
--   - 007_quotations.sql
--   - 008_payments.sql
--   - 009_installation.sql
--   - 010_discom_portal.sql
--   - 011_maintenance.sql
--   - 012_proofs_storage.sql
--   - 013_team_access.sql
--   - 014_portal_customer_docs.sql
--   - 015_catalog_item_images.sql
--   - 016_rate_card.sql
--   - 017_quotation_project_type.sql
--   - 018_quotation_meter_phase.sql
--   - 019_quotation_subsidy_scheme.sql
--   - 020_commercial_quotation_fields.sql
--   - 021_quotation_builder_support.sql
--   - 022_won_closing_gate.sql
--   - 023_report_runs.sql
--   - 024_lead_profile_fields.sql
--   - 025_lead_import_profiles.sql
--   - 026_grievances.sql
--   - 027_dealer_role.sql
--   - 028_dealer_commissions.sql
--   - 029_commercial_gst_percent.sql
--   - 029_proofs_upload_hardening.sql
--   - 030_service_ticket_video.sql
--   - 031_team_profile_pictures.sql
--   - 032_premium_quotation_template.sql
--   - 033_quotation_item_image_snapshots.sql
--   - 034_quotation_per_kw_rate_card.sql
--   - 035_rate_card_flat_panels.sql
--   - 036_quotation_company_settings_builder.sql
--   - 037_quotations_schema_catchup.sql
--   - 038_rename_non_solar_category_labels.sql
--   - 039_rename_home_appliances_category.sql
--   - 040_rate_card_panel_watt_peak.sql
--   - 041_rate_card_inverters.sql
--   - 047_won_structure_legs.sql
--   - 048_feasibility_pdf_and_docs.sql
--   - 049_quotation_discount_caps.sql
--   - 050_catalog_available_for_sales.sql
--   - 051_role_authority_recare_ops.sql
--   - 052_daily_report_alerts.sql
--   - 053_survey_discount_visibility.sql
--   - 054_frs_brand_seed.sql
--   - 055_account_code.sql
--   - 056_calling_cycle.sql
--   - 057_trade_ledger.sql
--   - 058_trade_score.sql
--   - 059_b2b_quote_skus.sql
--   - 060_discovery_lock.sql
--   - 061_view_profit.sql
-- ============================================================


-- ############################################################
-- >>> 001_init.sql
-- ############################################################

-- Recare — Phase 0 bootstrap schema
-- Companies (tenants) + Profiles + RLS helpers
-- See docs/workflow.md for full role catalog

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- Role keys align with docs/workflow.md §1
-- ============================================================
CREATE TYPE user_role AS ENUM (
  'admin',
  'sales_manager',
  'tele_caller',
  'surveyor',
  'sales_executive',
  'feasibility',
  'accounts',
  'ops_coordinator',
  'installation_crew',
  'liaison',
  'service_engineer',
  'service_supervisor',
  'customer'
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20) NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'tele_caller',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_role ON profiles(company_id, role);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_companies_updated
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true AND role = 'admin'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON companies FOR SELECT
  USING (id = auth_company_id() AND is_active_user());

CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = auth_company_id() AND is_admin_user());

CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid() AND is_active_user());

CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (company_id = auth_company_id() AND is_admin_user());

CREATE POLICY profiles_insert_admin ON profiles FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND is_admin_user());

-- ============================================================
-- AUTO PROFILE ON AUTH SIGNUP
-- Pass company_id, name, phone, role via user metadata
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_company UUID;
BEGIN
  SELECT id INTO default_company FROM companies ORDER BY created_at ASC LIMIT 1;

  INSERT INTO profiles (id, company_id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'company_id')::UUID, default_company),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tele_caller')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED TENANT (Florian)
-- ============================================================
INSERT INTO companies (id, name, slug, email)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Florian',
  'florian-sales',
  'admin@florian-sales.local'
)
ON CONFLICT (slug) DO NOTHING;


-- ############################################################
-- >>> 002_lms.sql
-- ############################################################

-- Recare — Phase 1 LMS schema
-- Leads, call logs, reminders, audit, import, authorities/roles

-- ============================================================
-- AUTHORITIES + ROLES
-- ============================================================
CREATE TABLE authorities (
  key VARCHAR(64) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  authority_group VARCHAR(64) NOT NULL
);

CREATE TABLE user_authorities (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  authority_key VARCHAR(64) NOT NULL REFERENCES authorities(key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, authority_key)
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, slug)
);

CREATE TABLE role_authorities (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  authority_key VARCHAR(64) NOT NULL REFERENCES authorities(key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (role_id, authority_key)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE SET NULL;

INSERT INTO authorities (key, label, authority_group) VALUES
  ('full_access', 'Full Access', 'general'),
  ('manage_users', 'Manage Team', 'general'),
  ('manage_roles', 'Manage Roles & Permissions', 'general'),
  ('manage_settings', 'Manage Settings', 'general'),
  ('import_leads', 'Import Leads (Excel)', 'sales'),
  ('distribute_leads', 'Distribute Leads', 'sales'),
  ('add_edit_leads', 'Add / Edit Leads', 'sales'),
  ('delete_leads', 'Delete Leads', 'sales'),
  ('move_lead_stage', 'Move Lead Stage', 'sales'),
  ('reassign_leads', 'Reassign Leads', 'sales'),
  ('reopen_lost_leads', 'Reopen Lost Leads', 'sales'),
  ('view_all_leads', 'View All Leads', 'sales'),
  ('log_sales_activity', 'Log Sales Activity', 'sales'),
  ('schedule_site_visit', 'Schedule Site Visit', 'sales'),
  ('conduct_survey', 'Conduct Survey', 'sales'),
  ('view_reports', 'View Reports', 'general')
ON CONFLICT (key) DO NOTHING;

-- Seed system roles for KT tenant
DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_mgr UUID;
  r_tele UUID;
  r_surv UUID;
BEGIN
  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Admin', 'admin', 'Full tenant administration', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_admin;

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Sales Manager', 'sales_manager', 'Distribute and oversee leads', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_mgr;

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Tele-caller', 'tele_caller', 'Qualify leads and schedule visits', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_tele;

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Surveyor', 'surveyor', 'Conduct field surveys', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_surv;

  -- Resolve IDs if ON CONFLICT skipped RETURNING
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_mgr FROM roles WHERE company_id = cid AND slug = 'sales_manager';
  SELECT id INTO r_tele FROM roles WHERE company_id = cid AND slug = 'tele_caller';
  SELECT id INTO r_surv FROM roles WHERE company_id = cid AND slug = 'surveyor';

  INSERT INTO role_authorities (role_id, authority_key, granted)
  SELECT r_admin, key, true FROM authorities
  ON CONFLICT DO NOTHING;

  INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
    (r_mgr, 'view_all_leads', true),
    (r_mgr, 'import_leads', true),
    (r_mgr, 'distribute_leads', true),
    (r_mgr, 'add_edit_leads', true),
    (r_mgr, 'delete_leads', true),
    (r_mgr, 'move_lead_stage', true),
    (r_mgr, 'reassign_leads', true),
    (r_mgr, 'reopen_lost_leads', true),
    (r_mgr, 'log_sales_activity', true),
    (r_mgr, 'schedule_site_visit', true),
    (r_mgr, 'conduct_survey', true),
    (r_mgr, 'view_reports', true),
    (r_mgr, 'manage_users', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
    (r_tele, 'add_edit_leads', true),
    (r_tele, 'move_lead_stage', true),
    (r_tele, 'log_sales_activity', true),
    (r_tele, 'schedule_site_visit', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
    (r_surv, 'conduct_survey', true),
    (r_surv, 'log_sales_activity', true),
    (r_surv, 'move_lead_stage', true)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- LEADS
-- ============================================================
CREATE TYPE sales_stage AS ENUM (
  'new_lead',
  'contacted',
  'visit_scheduled',
  'survey_in_progress',
  'survey_completed',
  'lost'
);

CREATE TYPE lead_source AS ENUM (
  'manual',
  'excel_import',
  'referral',
  'facebook_ads',
  'call',
  'walk_in',
  'website',
  'other'
);

CREATE TYPE lead_temperature AS ENUM ('hot', 'warm', 'cold');

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  alternate_phone VARCHAR(20),
  email VARCHAR(255),
  city VARCHAR(100),
  address TEXT,
  source lead_source NOT NULL DEFAULT 'manual',
  source_detail VARCHAR(255),
  temperature lead_temperature NOT NULL DEFAULT 'warm',
  requirement_notes TEXT,
  sales_stage sales_stage NOT NULL DEFAULT 'new_lead',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  loss_reason VARCHAR(255),
  loss_notes TEXT,
  survey_date DATE,
  visit_scheduled_at TIMESTAMPTZ,
  visit_notes TEXT,
  last_call_at TIMESTAMPTZ,
  last_call_notes TEXT,
  next_followup_at TIMESTAMPTZ,
  next_followup_action VARCHAR(100),
  total_calls INTEGER NOT NULL DEFAULT 0,
  roof_area_sqft NUMERIC(10, 2),
  recommended_system_kw NUMERIC(6, 2),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_stage ON leads(company_id, sales_stage);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_phone ON leads(company_id, phone);
CREATE INDEX idx_leads_followup ON leads(company_id, next_followup_at)
  WHERE next_followup_at IS NOT NULL AND sales_stage <> 'lost';

CREATE TRIGGER tr_leads_updated
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CALL LOGS
-- ============================================================
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  outcome VARCHAR(64) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_logs_lead ON call_logs(lead_id, created_at DESC);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reminder_type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_due ON reminders(company_id, due_at) WHERE resolved_at IS NULL;

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64),
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_lead ON audit_events(lead_id, created_at DESC);
CREATE INDEX idx_audit_company ON audit_events(company_id, created_at DESC);

-- ============================================================
-- LEAD IMPORT
-- ============================================================
CREATE TABLE lead_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  imported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lead_import_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES lead_import_batches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_rows_batch ON lead_import_rows(batch_id);

-- ============================================================
-- RLS HELPERS (extend has_authority)
-- ============================================================
CREATE OR REPLACE FUNCTION has_authority(required_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_authorities ua
    WHERE ua.user_id = auth.uid()
      AND ua.authority_key = required_key
      AND ua.granted = true
  )
  OR EXISTS (
    SELECT 1 FROM user_authorities ua
    WHERE ua.user_id = auth.uid()
      AND ua.authority_key = 'full_access'
      AND ua.granted = true
  )
  OR EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_authorities ra ON ra.role_id = p.role_id
    WHERE p.id = auth.uid()
      AND ra.granted = true
      AND (ra.authority_key = required_key OR ra.authority_key = 'full_access')
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY authorities_select ON authorities FOR SELECT USING (is_active_user());

-- Helper: same company as target user
CREATE OR REPLACE FUNCTION company_id_match_via_user(target UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles me
    JOIN profiles them ON them.id = target
    WHERE me.id = auth.uid() AND me.company_id = them.company_id AND me.is_active
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY user_authorities_select ON user_authorities FOR SELECT
  USING (user_id = auth.uid() OR company_id_match_via_user(user_id));

CREATE POLICY roles_select ON roles FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

CREATE POLICY role_authorities_select ON role_authorities FOR SELECT
  USING (is_active_user());

CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND has_authority('add_edit_leads')
  );

CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY leads_delete ON leads FOR DELETE
  USING (company_id = auth_company_id() AND has_authority('delete_leads'));

CREATE POLICY call_logs_all ON call_logs FOR ALL
  USING (company_id = auth_company_id() AND is_active_user())
  WITH CHECK (company_id = auth_company_id() AND is_active_user());

CREATE POLICY reminders_all ON reminders FOR ALL
  USING (company_id = auth_company_id() AND is_active_user())
  WITH CHECK (company_id = auth_company_id() AND is_active_user());

CREATE POLICY audit_events_select ON audit_events FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

CREATE POLICY audit_events_insert ON audit_events FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND is_active_user());

CREATE POLICY import_batches_all ON lead_import_batches FOR ALL
  USING (company_id = auth_company_id() AND is_active_user())
  WITH CHECK (company_id = auth_company_id() AND has_authority('import_leads'));

CREATE POLICY import_rows_all ON lead_import_rows FOR ALL
  USING (company_id = auth_company_id() AND is_active_user())
  WITH CHECK (company_id = auth_company_id() AND has_authority('import_leads'));


-- ############################################################
-- >>> 003_dual_assignee.sql
-- ############################################################

-- Recare — Phase 2 dual assignee (tele-caller vs surveyor)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_telecaller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_surveyor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Backfill: existing assigned_to becomes tele-caller
UPDATE leads
SET assigned_telecaller_id = assigned_to
WHERE assigned_telecaller_id IS NULL AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_telecaller ON leads(assigned_telecaller_id);
CREATE INDEX IF NOT EXISTS idx_leads_surveyor ON leads(assigned_surveyor_id);

-- Keep assigned_to in sync as "primary owner" for legacy filters:
-- prefer telecaller, else surveyor
CREATE OR REPLACE FUNCTION sync_lead_assigned_to()
RETURNS TRIGGER AS $$
BEGIN
  NEW.assigned_to := COALESCE(NEW.assigned_telecaller_id, NEW.assigned_surveyor_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_leads_sync_assigned_to ON leads;
CREATE TRIGGER tr_leads_sync_assigned_to
  BEFORE INSERT OR UPDATE OF assigned_telecaller_id, assigned_surveyor_id
  ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_assigned_to();

-- Refresh leads SELECT policy for dual assignee visibility
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 004_surveys.sql
-- ############################################################

-- Recare — Phase 3 digital survey stub

CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  surveyed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  total_terrace_sqft NUMERIC(12, 2),
  shadow_free_sqft NUMERIC(12, 2),
  capacity_kw NUMERIC(8, 2),
  feasibility_pass BOOLEAN,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id)
);

CREATE INDEX idx_surveys_company ON surveys(company_id);
CREATE INDEX idx_surveys_lead ON surveys(lead_id);

CREATE TRIGGER tr_surveys_updated
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY surveys_select ON surveys FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = surveys.lead_id
        AND l.company_id = auth_company_id()
        AND (
          l.assigned_telecaller_id = auth.uid()
          OR l.assigned_surveyor_id = auth.uid()
          OR l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
          OR has_authority('view_all_leads')
          OR has_authority('full_access')
        )
    )
  );

CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND has_authority('conduct_survey')
  );

CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND has_authority('conduct_survey')
  );

CREATE POLICY surveys_delete ON surveys FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('full_access') OR has_authority('delete_leads'))
  );


-- ############################################################
-- >>> 005_ingestion.sql
-- ############################################################

-- Recare — Phase 4 lead ingestion (referral + Facebook)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS referrer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS referrer_phone VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_company_external_id
  ON leads(company_id, external_id)
  WHERE external_id IS NOT NULL;

-- Append-only ingest log (idempotency + debugging)
CREATE TABLE lead_ingest_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL, -- referral | facebook_ads
  external_id VARCHAR(128),
  payload JSONB NOT NULL DEFAULT '{}',
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received', -- received | created | duplicate | error
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_channel_external
  ON lead_ingest_events(company_id, channel, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX idx_ingest_company_created ON lead_ingest_events(company_id, created_at DESC);

-- Public referral form codes (optional branded links)
CREATE TABLE referral_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

ALTER TABLE lead_ingest_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingest_events_select ON lead_ingest_events FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('view_all_leads') OR has_authority('import_leads') OR has_authority('full_access'))
  );

CREATE POLICY referral_links_select ON referral_links FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

CREATE POLICY referral_links_write ON referral_links FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('import_leads') OR has_authority('distribute_leads') OR has_authority('full_access'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('import_leads') OR has_authority('distribute_leads') OR has_authority('full_access'))
  );

-- Default referral link for seeded KT tenant
INSERT INTO referral_links (company_id, code, label, is_active)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'kt-default',
  'KT default referral form',
  true
)
ON CONFLICT (company_id, code) DO NOTHING;


-- ############################################################
-- >>> 006_fix_auth_trigger.sql
-- ############################################################

-- Fix auth signup failures caused by fragile handle_new_user casts.
-- Symptom: Supabase Dashboard "Create user" returns empty / Database error creating new user.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_company UUID;
  meta_company UUID;
  meta_role public.user_role;
  meta_name TEXT;
  meta_phone TEXT;
  admin_role_id UUID;
BEGIN
  SELECT id INTO default_company
  FROM public.companies
  ORDER BY created_at ASC
  LIMIT 1;

  -- Safe company_id from metadata
  BEGIN
    IF NEW.raw_user_meta_data ? 'company_id'
       AND NULLIF(TRIM(NEW.raw_user_meta_data->>'company_id'), '') IS NOT NULL THEN
      meta_company := (NEW.raw_user_meta_data->>'company_id')::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    meta_company := NULL;
  END;

  -- Safe role from metadata (invalid values fall back to tele_caller)
  BEGIN
    IF NEW.raw_user_meta_data ? 'role'
       AND NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '') IS NOT NULL THEN
      meta_role := (LOWER(TRIM(NEW.raw_user_meta_data->>'role')))::public.user_role;
    ELSE
      meta_role := 'tele_caller'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    meta_role := 'tele_caller'::public.user_role;
  END;

  meta_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );
  meta_phone := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), '');

  IF COALESCE(meta_company, default_company) IS NULL THEN
    RAISE EXCEPTION 'No company exists. Run 001_init.sql seed before creating users.';
  END IF;

  INSERT INTO public.profiles (id, company_id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(meta_company, default_company),
    meta_name,
    NEW.email,
    meta_phone,
    meta_role
  );

  -- Link RBAC role_id when roles table exists (002_lms.sql)
  BEGIN
    SELECT id INTO admin_role_id
    FROM public.roles
    WHERE company_id = COALESCE(meta_company, default_company)
      AND slug = meta_role::TEXT
    LIMIT 1;

    IF admin_role_id IS NOT NULL THEN
      UPDATE public.profiles
      SET role_id = admin_role_id
      WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- roles not migrated yet
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ############################################################
-- >>> 007_quotations.sql
-- ############################################################

-- Recare — Module 3 quotations (lean catalog + lead-linked quotes)

-- ============================================================
-- EXTEND sales_stage ENUM
-- ============================================================
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'quoted' AFTER 'survey_completed';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'quote_accepted' AFTER 'quoted';

-- ============================================================
-- AUTHORITIES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_quotations', 'View Quotations', 'sales'),
  ('create_quotations', 'Create Quotations', 'sales'),
  ('manage_quotations', 'Manage Quotations', 'sales'),
  ('edit_quotation_pricing', 'Edit Quotation Pricing', 'sales'),
  ('accept_quotations', 'Accept Quotations', 'sales'),
  ('manage_catalog_items', 'Manage Catalog Items', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_mgr UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_mgr FROM roles WHERE company_id = cid AND slug = 'sales_manager';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('view_quotations'),
      ('create_quotations'),
      ('manage_quotations'),
      ('edit_quotation_pricing'),
      ('accept_quotations'),
      ('manage_catalog_items')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_mgr IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_mgr, 'view_quotations', true),
      (r_mgr, 'create_quotations', true),
      (r_mgr, 'manage_quotations', true),
      (r_mgr, 'edit_quotation_pricing', true),
      (r_mgr, 'accept_quotations', true),
      (r_mgr, 'manage_catalog_items', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- CATALOG
-- ============================================================
CREATE TABLE quote_item_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'solar', -- solar | non_solar | both
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE quote_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES quote_brands(id) ON DELETE SET NULL,
  category_id UUID REFERENCES quote_item_categories(id) ON DELETE SET NULL,
  item_name VARCHAR(200) NOT NULL,
  model VARCHAR(120),
  capacity_label VARCHAR(60),
  unit VARCHAR(24) NOT NULL DEFAULT 'pcs',
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  base_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  template_kind VARCHAR(20) NOT NULL DEFAULT 'both', -- solar | non_solar | both
  warranty_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_items_company ON quote_items(company_id);
CREATE INDEX idx_quote_items_kind ON quote_items(company_id, template_kind);

CREATE TABLE quotation_company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  quotation_prefix VARCHAR(24) NOT NULL DEFAULT 'FLR',
  quotation_next_number INT NOT NULL DEFAULT 1,
  quotation_number_padding INT NOT NULL DEFAULT 4,
  quotation_terms TEXT,
  from_name VARCHAR(160),
  from_phone VARCHAR(40),
  from_email VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTATIONS
-- ============================================================
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quotation_no VARCHAR(60) NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  template_kind VARCHAR(20) NOT NULL DEFAULT 'solar', -- solar | non_solar
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(40),
  customer_address TEXT,
  customer_city VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | sent | accepted | rejected
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_till DATE,
  system_size_kw NUMERIC(8,2),
  meter_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  subsidy NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, quotation_no)
);

CREATE INDEX idx_quotations_company ON quotations(company_id);
CREATE INDEX idx_quotations_lead ON quotations(lead_id);
CREATE INDEX idx_quotations_status ON quotations(company_id, status);

CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES quote_items(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  item_name_snapshot VARCHAR(200) NOT NULL,
  brand_snapshot VARCHAR(120),
  model_snapshot VARCHAR(120),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit VARCHAR(24) NOT NULL DEFAULT 'pcs',
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE quote_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_item_categories_select ON quote_item_categories FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_item_categories_manage ON quote_item_categories FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quote_brands_select ON quote_brands FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_brands_manage ON quote_brands FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quote_items_select ON quote_items FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_items_manage ON quote_items FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quotation_settings_select ON quotation_company_settings FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quotation_settings_manage ON quotation_company_settings FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_quotations') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_quotations') OR has_authority('full_access')));

CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_quotations')
      OR has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );

CREATE POLICY quotations_insert ON quotations FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotations_update ON quotations FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('accept_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotation_items_select ON quotation_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (
          has_authority('view_quotations')
          OR has_authority('create_quotations')
          OR has_authority('manage_quotations')
          OR has_authority('full_access')
        )
    )
  );

CREATE POLICY quotation_items_manage ON quotation_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
    )
  );

-- ============================================================
-- SEED KT catalog + settings
-- ============================================================
DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_modules UUID;
  c_inverters UUID;
  c_meter UUID;
  c_nonsolar UUID;
  b_adani UUID;
  b_waaree UUID;
  b_polycab UUID;
  b_generic UUID;
BEGIN
  INSERT INTO quotation_company_settings (company_id, quotation_prefix, quotation_terms, from_name)
  VALUES (
    cid,
    'FLR',
    'Prices inclusive of applicable GST unless noted. Validity 15 days.',
    'Florian'
  )
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'PV Modules', 'solar', 10)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_modules;
  SELECT id INTO c_modules FROM quote_item_categories WHERE company_id = cid AND name = 'PV Modules';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'On-Grid Inverters', 'solar', 20)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_inverters;
  SELECT id INTO c_inverters FROM quote_item_categories WHERE company_id = cid AND name = 'On-Grid Inverters';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'Meter & Discom', 'solar', 30)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_meter;
  SELECT id INTO c_meter FROM quote_item_categories WHERE company_id = cid AND name = 'Meter & Discom';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'Home Appliances', 'non_solar', 40)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_nonsolar;
  SELECT id INTO c_nonsolar FROM quote_item_categories WHERE company_id = cid AND name = 'Home Appliances';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Adani', 'module'),
    (cid, 'Waaree', 'module'),
    (cid, 'Polycab', 'inverter'),
    (cid, 'Generic', 'other')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_generic FROM quote_brands WHERE company_id = cid AND name = 'Generic';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind
  )
  SELECT * FROM (VALUES
    (cid, b_adani, c_modules, 'TopCon Bifacial Module', 'ASF-XXX', '545 Wp', 'pcs', 12::numeric, 12500::numeric, 'solar'),
    (cid, b_waaree, c_modules, 'Mono PERC Module', 'WS-XXX', '540 Wp', 'pcs', 12::numeric, 11800::numeric, 'solar'),
    (cid, b_polycab, c_inverters, 'On-Grid Inverter', 'PC-5K', '5 kW', 'pcs', 18::numeric, 45000::numeric, 'solar'),
    (cid, b_generic, c_meter, 'GEB/MGVCL Meter Charges', 'METER', NULL, 'lot', 18::numeric, 15000::numeric, 'solar'),
    (cid, b_generic, c_nonsolar, 'RO Water Purifier', 'RO-75', '75 LPH', 'pcs', 18::numeric, 18000::numeric, 'non_solar'),
    (cid, b_generic, c_nonsolar, 'Solar Water Heater', 'SWH-200', '200 LPD', 'pcs', 18::numeric, 28000::numeric, 'non_solar')
  ) AS v(company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.company_id = cid AND qi.item_name = v.item_name AND qi.model = v.model
  );
END $$;


-- ############################################################
-- >>> 008_payments.sql
-- ############################################################

-- Recare — Module 4 milestone payments + parallel feasibility

-- ============================================================
-- EXTEND sales_stage ENUM
-- ============================================================
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'token_pending_verification' AFTER 'quote_accepted';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'token_verified_and_feasibility_ok' AFTER 'token_pending_verification';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'pre_dispatch_pending_verification' AFTER 'token_verified_and_feasibility_ok';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'pre_dispatch_verified' AFTER 'pre_dispatch_pending_verification';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'final_pending_verification' AFTER 'pre_dispatch_verified';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'final_verified' AFTER 'final_pending_verification';

-- ============================================================
-- LEAD GATE FLAGS
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS token_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feasibility_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_payment_gates
  ON leads(company_id, token_verified, feasibility_approved);

-- ============================================================
-- AUTHORITIES + ROLES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('record_payment', 'Record Payment', 'sales'),
  ('verify_payment', 'Verify Payment', 'sales'),
  ('upload_feasibility_report', 'Upload Feasibility Report', 'sales'),
  ('approve_feasibility_report', 'Approve Feasibility Report', 'sales'),
  ('view_payment_queues', 'View Payment Queues', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_mgr UUID;
  r_accounts UUID;
  r_feas UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_mgr FROM roles WHERE company_id = cid AND slug = 'sales_manager';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Accounts', 'accounts', 'Verify payments and bank credit', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_accounts;
  SELECT id INTO r_accounts FROM roles WHERE company_id = cid AND slug = 'accounts';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Feasibility', 'feasibility', 'Upload and approve grid feasibility reports', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO r_feas;
  SELECT id INTO r_feas FROM roles WHERE company_id = cid AND slug = 'feasibility';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('record_payment'),
      ('verify_payment'),
      ('upload_feasibility_report'),
      ('approve_feasibility_report'),
      ('view_payment_queues')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_mgr IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_mgr, 'record_payment', true),
      (r_mgr, 'view_payment_queues', true),
      (r_mgr, 'upload_feasibility_report', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_accounts IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_accounts, 'view_all_leads', true),
      (r_accounts, 'view_quotations', true),
      (r_accounts, 'record_payment', true),
      (r_accounts, 'verify_payment', true),
      (r_accounts, 'view_payment_queues', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_feas IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_feas, 'view_all_leads', true),
      (r_feas, 'upload_feasibility_report', true),
      (r_feas, 'approve_feasibility_report', true),
      (r_feas, 'view_payment_queues', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  milestone VARCHAR(32) NOT NULL, -- token | pre_dispatch | final
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  method VARCHAR(40) NOT NULL DEFAULT 'upi',
  transaction_id VARCHAR(120),
  paid_at DATE,
  bank_reference TEXT,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | verified | rejected
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, milestone)
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_lead ON payments(lead_id);
CREATE INDEX idx_payments_status ON payments(company_id, verification_status, milestone);

CREATE TRIGGER tr_payments_updated
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FEASIBILITY REPORTS
-- ============================================================
CREATE TABLE feasibility_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'Grid Feasibility Report',
  notes TEXT,
  file_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted', -- submitted | approved | rejected
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feasibility_lead ON feasibility_reports(lead_id);
CREATE INDEX idx_feasibility_status ON feasibility_reports(company_id, status);

CREATE TRIGGER tr_feasibility_updated
  BEFORE UPDATE ON feasibility_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feasibility_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON payments FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('verify_payment')
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('record_payment') OR has_authority('full_access'))
  );

CREATE POLICY payments_update ON payments FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('record_payment')
      OR has_authority('verify_payment')
      OR has_authority('full_access')
    )
  );

CREATE POLICY payments_delete ON payments FOR DELETE
  USING (company_id = auth_company_id() AND (has_authority('manage_quotations') OR has_authority('full_access')));

CREATE POLICY feasibility_select ON feasibility_reports FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('upload_feasibility_report')
      OR has_authority('approve_feasibility_report')
      OR has_authority('view_payment_queues')
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY feasibility_insert ON feasibility_reports FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('upload_feasibility_report') OR has_authority('full_access'))
  );

CREATE POLICY feasibility_update ON feasibility_reports FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('upload_feasibility_report')
      OR has_authority('approve_feasibility_report')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 009_installation.sql
-- ############################################################

-- Recare — Module 5 installation + barcode proofs

-- ============================================================
-- EXTEND sales_stage ENUM (insert before final payment stages)
-- ============================================================
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'installation_assigned' AFTER 'pre_dispatch_verified';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'installation_in_progress' AFTER 'installation_assigned';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'installation_completed' AFTER 'installation_in_progress';

-- ============================================================
-- LEAD CREW FIELDS
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_crew_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installation_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_panel_count INT;

CREATE INDEX IF NOT EXISTS idx_leads_crew ON leads(company_id, assigned_crew_id);

-- ============================================================
-- AUTHORITIES + ROLES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('assign_installation_crew', 'Assign Installation Crew', 'sales'),
  ('upload_installation_proofs', 'Upload Installation Proofs', 'sales'),
  ('upload_panel_barcodes', 'Upload Panel Barcodes', 'sales'),
  ('complete_installation', 'Complete Installation', 'sales'),
  ('view_installation_queue', 'View Installation Queue', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_ops UUID;
  r_crew UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Ops Coordinator', 'ops_coordinator', 'Assign installation crews after pre-dispatch', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_ops FROM roles WHERE company_id = cid AND slug = 'ops_coordinator';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Installation Crew', 'installation_crew', 'Site photos and panel barcode capture', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_crew FROM roles WHERE company_id = cid AND slug = 'installation_crew';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('assign_installation_crew'),
      ('upload_installation_proofs'),
      ('upload_panel_barcodes'),
      ('complete_installation'),
      ('view_installation_queue')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_ops IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_ops, 'view_all_leads', true),
      (r_ops, 'assign_installation_crew', true),
      (r_ops, 'upload_installation_proofs', true),
      (r_ops, 'upload_panel_barcodes', true),
      (r_ops, 'complete_installation', true),
      (r_ops, 'view_installation_queue', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_crew IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_crew, 'upload_installation_proofs', true),
      (r_crew, 'upload_panel_barcodes', true),
      (r_crew, 'complete_installation', true),
      (r_crew, 'view_installation_queue', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- INSTALLATION PHOTOS
-- ============================================================
CREATE TABLE installation_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  photo_kind VARCHAR(32) NOT NULL, -- site | panel_barcode | other
  file_url TEXT NOT NULL,
  caption TEXT,
  panel_index INT,
  serial_hint VARCHAR(120),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_install_photos_lead ON installation_photos(lead_id, photo_kind);

-- ============================================================
-- NOTIFICATION OUTBOX (stubs)
-- ============================================================
CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  audience VARCHAR(40) NOT NULL, -- accounts | sales | liaison
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notify_outbox_status ON notification_outbox(company_id, status, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE installation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY install_photos_select ON installation_photos FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_installation_queue')
      OR has_authority('upload_installation_proofs')
      OR has_authority('upload_panel_barcodes')
      OR has_authority('assign_installation_crew')
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = installation_photos.lead_id
          AND l.assigned_crew_id = auth.uid()
      )
    )
  );

CREATE POLICY install_photos_insert ON installation_photos FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('upload_installation_proofs')
      OR has_authority('upload_panel_barcodes')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = lead_id AND l.assigned_crew_id = auth.uid()
      )
    )
  );

CREATE POLICY install_photos_delete ON installation_photos FOR DELETE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('complete_installation')
      OR has_authority('assign_installation_crew')
      OR has_authority('full_access')
      OR uploaded_by = auth.uid()
    )
  );

CREATE POLICY notify_outbox_select ON notification_outbox FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('view_installation_queue') OR has_authority('full_access') OR has_authority('view_all_leads'))
  );

CREATE POLICY notify_outbox_insert ON notification_outbox FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('complete_installation') OR has_authority('full_access'))
  );


-- ############################################################
-- >>> 010_discom_portal.sql
-- ############################################################

-- Recare — Module 6 Discom liaison + subsidy timer + portal

-- ============================================================
-- EXTEND sales_stage ENUM
-- ============================================================
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'liaison_in_progress' AFTER 'installation_completed';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'meter_installed' AFTER 'liaison_in_progress';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'subsidy_pending' AFTER 'meter_installed';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'subsidy_received_pending_accounts' AFTER 'subsidy_pending';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'completed' AFTER 'subsidy_received_pending_accounts';

-- Note: final_pending_verification / final_verified already exist after installation_completed
-- in some DBs; app stage order treats liaison after install and allows final payment in parallel.

-- ============================================================
-- LEAD DISCOM / PORTAL FIELDS
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS portal_code VARCHAR(24),
  ADD COLUMN IF NOT EXISTS meter_installed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meter_marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subsidy_timer_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subsidy_timer_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subsidy_followup_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subsidy_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subsidy_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subsidy_verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subsidy_bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS completion_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS liaison_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_portal_code
  ON leads(portal_code)
  WHERE portal_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_subsidy_due
  ON leads(company_id, subsidy_timer_due_at)
  WHERE subsidy_timer_due_at IS NOT NULL AND subsidy_received_at IS NULL;

-- ============================================================
-- PORTAL DOCUMENTS
-- ============================================================
CREATE TABLE portal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  doc_type VARCHAR(40) NOT NULL, -- invoice | self_declaration | quote_pdf | other
  title VARCHAR(200) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visible_to_customer BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portal_docs_lead ON portal_documents(lead_id);

-- ============================================================
-- AUTHORITIES + LIAISON ROLE
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('manage_liaison', 'Manage Liaison Queue', 'sales'),
  ('mark_meter_installed', 'Mark Meter Installed', 'sales'),
  ('mark_subsidy_received', 'Mark Subsidy Received', 'sales'),
  ('verify_subsidy', 'Verify Subsidy Payment', 'sales'),
  ('manage_portal_documents', 'Manage Portal Documents', 'sales'),
  ('view_customer_portal_admin', 'View Portal Admin', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_liaison UUID;
  r_accounts UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_accounts FROM roles WHERE company_id = cid AND slug = 'accounts';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Discom Liaison', 'liaison', 'Meter / subsidy follow-up with customers', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_liaison FROM roles WHERE company_id = cid AND slug = 'liaison';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('manage_liaison'),
      ('mark_meter_installed'),
      ('mark_subsidy_received'),
      ('verify_subsidy'),
      ('manage_portal_documents'),
      ('view_customer_portal_admin')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_liaison IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_liaison, 'view_all_leads', true),
      (r_liaison, 'manage_liaison', true),
      (r_liaison, 'mark_meter_installed', true),
      (r_liaison, 'mark_subsidy_received', true),
      (r_liaison, 'manage_portal_documents', true),
      (r_liaison, 'view_customer_portal_admin', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_accounts IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_accounts, 'verify_subsidy', true),
      (r_accounts, 'view_customer_portal_admin', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE portal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_docs_select ON portal_documents FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('manage_portal_documents')
      OR has_authority('view_customer_portal_admin')
      OR has_authority('manage_liaison')
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY portal_docs_write ON portal_documents FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_portal_documents') OR has_authority('full_access'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_portal_documents') OR has_authority('full_access'))
  );


-- ############################################################
-- >>> 011_maintenance.sql
-- ############################################################

-- Recare — Module 7 maintenance tickets + cleaning reminders

-- ============================================================
-- LEAD CLEANING TIMER
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cleaning_next_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleaning_last_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_cleaning_due
  ON leads(company_id, cleaning_next_due_at)
  WHERE cleaning_next_due_at IS NOT NULL;

-- ============================================================
-- AUTHORITIES + SERVICE ROLES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_service_tickets', 'View Service Tickets', 'sales'),
  ('accept_service_ticket', 'Accept Service Ticket', 'sales'),
  ('resolve_service_ticket', 'Resolve Service Ticket', 'sales'),
  ('force_assign_service_ticket', 'Force Assign Service Ticket', 'sales'),
  ('enqueue_cleaning_reminders', 'Enqueue Cleaning Reminders', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_eng UUID;
  r_sup UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Service Engineer', 'service_engineer', 'Accept and resolve maintenance tickets', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_eng FROM roles WHERE company_id = cid AND slug = 'service_engineer';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (cid, 'Service Supervisor', 'service_supervisor', 'Force-assign and oversee service tickets', true)
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_sup FROM roles WHERE company_id = cid AND slug = 'service_supervisor';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('view_service_tickets'),
      ('accept_service_ticket'),
      ('resolve_service_ticket'),
      ('force_assign_service_ticket'),
      ('enqueue_cleaning_reminders')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_eng IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_eng, 'view_service_tickets', true),
      (r_eng, 'accept_service_ticket', true),
      (r_eng, 'resolve_service_ticket', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_sup IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_sup, 'view_service_tickets', true),
      (r_sup, 'accept_service_ticket', true),
      (r_sup, 'resolve_service_ticket', true),
      (r_sup, 'force_assign_service_ticket', true),
      (r_sup, 'enqueue_cleaning_reminders', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- SERVICE TICKETS
-- ============================================================
CREATE TABLE service_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'raised'
    CHECK (status IN ('raised', 'accepted', 'in_progress', 'closed')),
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  raised_via VARCHAR(16) NOT NULL DEFAULT 'portal'
    CHECK (raised_via IN ('portal', 'staff')),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_tickets_company_status
  ON service_tickets(company_id, status, created_at DESC);
CREATE INDEX idx_service_tickets_lead ON service_tickets(lead_id);
CREATE INDEX idx_service_tickets_assignee ON service_tickets(assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE service_ticket_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'rejected', 'expired')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id, engineer_id)
);

CREATE INDEX idx_ticket_offers_engineer
  ON service_ticket_offers(engineer_id, status);

CREATE TABLE service_ticket_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_photos_ticket ON service_ticket_photos(ticket_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_ticket_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_ticket_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_tickets_select ON service_tickets FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_service_tickets')
      OR has_authority('full_access')
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM service_ticket_offers o
        WHERE o.ticket_id = service_tickets.id
          AND o.engineer_id = auth.uid()
      )
    )
  );

CREATE POLICY service_tickets_write ON service_tickets FOR ALL
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('accept_service_ticket')
      OR has_authority('resolve_service_ticket')
      OR has_authority('force_assign_service_ticket')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('accept_service_ticket')
      OR has_authority('resolve_service_ticket')
      OR has_authority('force_assign_service_ticket')
      OR has_authority('full_access')
    )
  );

CREATE POLICY service_ticket_offers_select ON service_ticket_offers FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_service_tickets')
      OR has_authority('full_access')
      OR engineer_id = auth.uid()
    )
  );

CREATE POLICY service_ticket_offers_write ON service_ticket_offers FOR ALL
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('accept_service_ticket')
      OR has_authority('force_assign_service_ticket')
      OR has_authority('full_access')
      OR engineer_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('accept_service_ticket')
      OR has_authority('force_assign_service_ticket')
      OR has_authority('full_access')
      OR engineer_id = auth.uid()
    )
  );

CREATE POLICY service_ticket_photos_select ON service_ticket_photos FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_service_tickets')
      OR has_authority('full_access')
    )
  );

CREATE POLICY service_ticket_photos_write ON service_ticket_photos FOR ALL
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('resolve_service_ticket')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('resolve_service_ticket')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 012_proofs_storage.sql
-- ############################################################

-- Recare — proofs storage bucket (install / ticket photos)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proofs',
  'proofs',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS proofs_upload ON storage.objects;
DROP POLICY IF EXISTS proofs_update ON storage.objects;
DROP POLICY IF EXISTS proofs_select ON storage.objects;
DROP POLICY IF EXISTS proofs_public_read ON storage.objects;

-- Authenticated company users can upload under {company_id}/...
CREATE POLICY proofs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY proofs_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

-- Public read (public bucket) — allow anon select for proof URLs
CREATE POLICY proofs_public_read ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'proofs');


-- ############################################################
-- >>> 013_team_access.sql
-- ############################################################

-- Recare — Team & Access administration hardening
-- Apply after 012_proofs_storage.sql.

-- Keep role authority reads inside the current tenant. The original policy only
-- checked that the caller was active and therefore exposed every tenant's grants.
DROP POLICY IF EXISTS role_authorities_select ON role_authorities;
CREATE POLICY role_authorities_select ON role_authorities FOR SELECT
  USING (
    is_active_user()
    AND EXISTS (
      SELECT 1
      FROM roles r
      WHERE r.id = role_authorities.role_id
        AND r.company_id = auth_company_id()
    )
  );

-- Profile privilege fields must only be changed by trusted server actions using
-- the service role. The old self-update policy allowed a user to change role,
-- role_id, company_id, and is_active directly through PostgREST.
DROP POLICY IF EXISTS profiles_update_self ON profiles;
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON profiles;

-- Seed roles omitted by the earlier module migrations for every existing tenant.
DO $$
DECLARE
  company_row RECORD;
  sales_role_id UUID;
BEGIN
  FOR company_row IN SELECT id FROM companies LOOP
    INSERT INTO roles (company_id, name, slug, description, is_system)
    VALUES (
      company_row.id,
      'Sales Executive',
      'sales_executive',
      'Prepare quotations, record payments, and advance won opportunities',
      true
    )
    ON CONFLICT (company_id, slug) DO UPDATE
      SET is_system = true
    RETURNING id INTO sales_role_id;

    SELECT id INTO sales_role_id
    FROM roles
    WHERE company_id = company_row.id AND slug = 'sales_executive';

    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT sales_role_id, authority_key, true
    FROM (
      VALUES
        ('view_all_leads'),
        ('add_edit_leads'),
        ('move_lead_stage'),
        ('log_sales_activity'),
        ('view_quotations'),
        ('create_quotations'),
        ('edit_quotation_pricing'),
        ('accept_quotations'),
        ('record_payment'),
        ('view_payment_queues')
    ) defaults(authority_key)
    JOIN authorities a ON a.key = defaults.authority_key
    ON CONFLICT (role_id, authority_key) DO NOTHING;

    INSERT INTO roles (company_id, name, slug, description, is_system)
    VALUES (
      company_row.id,
      'Customer',
      'customer',
      'Customer portal account without staff dashboard authorities',
      true
    )
    ON CONFLICT (company_id, slug) DO UPDATE
      SET is_system = true;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Enforce role invariants in the database as a final guard for future service
-- code and to close the count-then-delete race.
CREATE OR REPLACE FUNCTION protect_team_role()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'System roles cannot be deleted';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = OLD.id) THEN
      RAISE EXCEPTION 'Role is still assigned to one or more users';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_system AND (
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.is_system IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'System role identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_protect_team_role ON roles;
CREATE TRIGGER tr_protect_team_role
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION protect_team_role();


-- ############################################################
-- >>> 014_portal_customer_docs.sql
-- ############################################################

-- Recare — customer portal document uploads + staff Docs tab

ALTER TABLE portal_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_customer BOOLEAN NOT NULL DEFAULT false;

-- Staff who can open the lead can see documents (not only liaison/admin).
DROP POLICY IF EXISTS portal_docs_select ON portal_documents;
CREATE POLICY portal_docs_select ON portal_documents FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND EXISTS (
      SELECT 1
      FROM leads l
      WHERE l.id = portal_documents.lead_id
        AND l.company_id = auth_company_id()
        AND (
          has_authority('view_all_leads')
          OR has_authority('full_access')
          OR has_authority('manage_portal_documents')
          OR has_authority('view_customer_portal_admin')
          OR has_authority('manage_liaison')
          OR l.assigned_telecaller_id = auth.uid()
          OR l.assigned_surveyor_id = auth.uid()
          OR l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
        )
    )
  );


-- ############################################################
-- >>> 015_catalog_item_images.sql
-- ############################################################

-- Recare — catalog item images + premium BOM from materials PDF
-- Apply after 014_portal_customer_docs.sql

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;


-- ############################################################
-- >>> 016_rate_card.sql
-- ############################################################

-- ============================================================
-- 016_rate_card.sql — Rate card packages + quotation snapshots
-- Module type → company → system-size packages (list + min sale)
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_card_module_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  module_family VARCHAR(40) NOT NULL,
  capacity_label VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS rate_card_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_type_id UUID NOT NULL REFERENCES rate_card_module_types(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_type_id, name)
);
CREATE INDEX IF NOT EXISTS idx_rate_card_companies_module ON rate_card_companies(module_type_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_companies_tenant ON rate_card_companies(company_id);

CREATE TABLE IF NOT EXISTS rate_card_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rate_company_id UUID NOT NULL REFERENCES rate_card_companies(id) ON DELETE CASCADE,
  system_size_kw NUMERIC(8,2) NOT NULL,
  panel_count INT NOT NULL CHECK (panel_count > 0),
  list_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rate_company_id, system_size_kw, panel_count)
);
CREATE INDEX IF NOT EXISTS idx_rate_card_packages_rate_co ON rate_card_packages(rate_company_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_packages_tenant ON rate_card_packages(company_id);

-- Quotation package snapshots
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS rate_package_id UUID REFERENCES rate_card_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_type_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_company_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_capacity_label VARCHAR(60),
  ADD COLUMN IF NOT EXISTS system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS panel_count INT,
  ADD COLUMN IF NOT EXISTS system_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS min_sale_price_snapshot NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_quotations_rate_package ON quotations(rate_package_id);

-- RLS
ALTER TABLE rate_card_module_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_card_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_card_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_card_module_types_select ON rate_card_module_types;
CREATE POLICY rate_card_module_types_select ON rate_card_module_types FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_module_types_manage ON rate_card_module_types;
CREATE POLICY rate_card_module_types_manage ON rate_card_module_types FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

DROP POLICY IF EXISTS rate_card_companies_select ON rate_card_companies;
CREATE POLICY rate_card_companies_select ON rate_card_companies FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_companies_manage ON rate_card_companies;
CREATE POLICY rate_card_companies_manage ON rate_card_companies FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

DROP POLICY IF EXISTS rate_card_packages_select ON rate_card_packages;
CREATE POLICY rate_card_packages_select ON rate_card_packages FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_packages_manage ON rate_card_packages;
CREATE POLICY rate_card_packages_manage ON rate_card_packages FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

-- Seed rate card for every tenant company (idempotent by module type name)
DO $$
DECLARE
  c RECORD;
  mt_topcon700 UUID;
  mt_topcon610 UUID;
  mt_mono UUID;
  co_avaada UUID;
  co_adani610 UUID;
  co_waree UUID;
  co_rayzon UUID;
  co_adani_mono UUID;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    -- Skip if already seeded
    IF EXISTS (
      SELECT 1 FROM rate_card_module_types
      WHERE company_id = c.id AND name = 'TOPCON (700/710/720WP)'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'TOPCON (700/710/720WP)', 'TOPCON', '700/710/720WP', 1)
    RETURNING id INTO mt_topcon700;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'TOPCON (610/615/620 WP)', 'TOPCON', '615/620WP', 2)
    RETURNING id INTO mt_topcon610;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'MONO BI FACIAL 540WP', 'MONO_BI_FACIAL', '540WP', 3)
    RETURNING id INTO mt_mono;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon700, 'Avaada', 1) RETURNING id INTO co_avaada;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon610, 'Adani', 1) RETURNING id INTO co_adani610;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon610, 'Waree', 2) RETURNING id INTO co_waree;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_mono, 'Rayzon Solar', 1) RETURNING id INTO co_rayzon;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_mono, 'Adani', 2) RETURNING id INTO co_adani_mono;

    -- Avaada TOPCON 700 packages
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_avaada, 2.88, 4, 132000, 132000, 1),
      (c.id, co_avaada, 3.60, 5, 173000, 173000, 2),
      (c.id, co_avaada, 4.32, 6, 205000, 205000, 3),
      (c.id, co_avaada, 5.04, 7, 233000, 233000, 4),
      (c.id, co_avaada, 5.76, 8, 257000, 257000, 5),
      (c.id, co_avaada, 7.90, 9, 280000, 280000, 6),
      (c.id, co_avaada, 10.00, 13, 436000, 436000, 7);

    -- Adani + Waree TOPCON 610 (shared list prices)
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_adani610, 2.48, 4, 139000, 139000, 1),
      (c.id, co_adani610, 3.10, 5, 163000, 163000, 2),
      (c.id, co_adani610, 3.72, 6, 188000, 188000, 3),
      (c.id, co_adani610, 4.32, 7, 223000, 223000, 4),
      (c.id, co_adani610, 4.96, 8, 254000, 254000, 5),
      (c.id, co_adani610, 5.58, 9, 281000, 281000, 6),
      (c.id, co_adani610, 8.06, 13, 451000, 451000, 7),
      (c.id, co_adani610, 9.92, 16, 529000, 529000, 8),
      (c.id, co_waree, 2.48, 4, 139000, 139000, 1),
      (c.id, co_waree, 3.10, 5, 163000, 163000, 2),
      (c.id, co_waree, 3.72, 6, 188000, 188000, 3),
      (c.id, co_waree, 4.32, 7, 223000, 223000, 4),
      (c.id, co_waree, 4.96, 8, 254000, 254000, 5),
      (c.id, co_waree, 5.58, 9, 281000, 281000, 6),
      (c.id, co_waree, 8.06, 13, 451000, 451000, 7),
      (c.id, co_waree, 9.92, 16, 529000, 529000, 8);

    -- Rayzon Mono
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_rayzon, 2.18, 4, 111000, 111000, 1),
      (c.id, co_rayzon, 3.24, 6, 148000, 148000, 2),
      (c.id, co_rayzon, 3.78, 7, 170000, 170000, 3),
      (c.id, co_rayzon, 4.32, 8, 194000, 194000, 4),
      (c.id, co_rayzon, 4.86, 9, 219000, 219000, 5),
      (c.id, co_rayzon, 5.40, 10, 238000, 238000, 6),
      (c.id, co_rayzon, 5.94, 11, 256000, 256000, 7),
      (c.id, co_rayzon, 8.10, 15, 393000, 393000, 8),
      (c.id, co_rayzon, 9.72, 18, 456000, 456000, 9);

    -- Adani Mono (higher column)
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_adani_mono, 2.18, 4, 121000, 121000, 1),
      (c.id, co_adani_mono, 3.24, 6, 163000, 163000, 2),
      (c.id, co_adani_mono, 3.78, 7, 188000, 188000, 3),
      (c.id, co_adani_mono, 4.32, 8, 214000, 214000, 4),
      (c.id, co_adani_mono, 4.86, 9, 241000, 241000, 5),
      (c.id, co_adani_mono, 5.40, 10, 263000, 263000, 6),
      (c.id, co_adani_mono, 5.94, 11, 284000, 284000, 7),
      (c.id, co_adani_mono, 8.10, 15, 431000, 431000, 8),
      (c.id, co_adani_mono, 9.72, 18, 501000, 501000, 9);
  END LOOP;
END $$;


-- ############################################################
-- >>> 017_quotation_project_type.sql
-- ############################################################

-- Project type on quotations (residential vs commercial).
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'residential';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_project_type_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_project_type_check
      CHECK (project_type IN ('residential', 'commercial'));
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.project_type IS 'Site project type: residential or commercial.';


-- ############################################################
-- >>> 018_quotation_meter_phase.sql
-- ############################################################

-- ============================================================
-- 023_quotation_meter_phase.sql — Selected meter phase + charge
-- ============================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS meter_phase TEXT,
  ADD COLUMN IF NOT EXISTS meter_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS meter_phase_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_meter_phase_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_meter_phase_check
      CHECK (
        meter_phase IS NULL
        OR meter_phase IN ('single_phase_1_6', 'three_phase_1_6', 'three_phase_6_10')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.meter_phase IS
  'Selected net-meter phase tier applied on the quotation.';
COMMENT ON COLUMN public.quotations.meter_charge_amount IS
  'Snapshot of meter / liaisoning charge for the selected phase.';


-- ############################################################
-- >>> 019_quotation_subsidy_scheme.sql
-- ############################################################

-- Quotation subsidy scheme: standard residential vs society common meter (GHS/RWA).
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS subsidy_scheme TEXT NOT NULL DEFAULT 'residential';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_subsidy_scheme_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_subsidy_scheme_check
      CHECK (subsidy_scheme IN ('residential', 'society_common_meter', 'none'));
  END IF;
END $$;

-- Align existing commercial quotes with no residential subsidy scheme.
UPDATE public.quotations
SET subsidy_scheme = 'none'
WHERE project_type = 'commercial'
  AND subsidy_scheme = 'residential'
  AND (subsidy IS NULL OR subsidy = 0);

COMMENT ON COLUMN public.quotations.subsidy_scheme IS
  'Subsidy rule set: residential (PM Surya Ghar slabs), society_common_meter (GHS/RWA ₹18k/kW), or none.';


-- ############################################################
-- >>> 020_commercial_quotation_fields.sql
-- ############################################################

-- Commercial quotation: per-kW excl. GST pricing, GEDA charges, panel mount type
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS price_per_kw_excl_gst NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geda_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS panel_mount_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_panel_mount_type_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_panel_mount_type_check
      CHECK (
        panel_mount_type IS NULL
        OR panel_mount_type IN (
          'rcc_terrace',
          'direct_shed',
          'half_shed_half_terrace'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.price_per_kw_excl_gst IS
  'Commercial: system price per kW exclusive of GST.';
COMMENT ON COLUMN public.quotations.geda_charge_amount IS
  'Commercial: GEDA / liaison charges amount.';
COMMENT ON COLUMN public.quotations.panel_mount_type IS
  'Commercial: panel mounting option (RCC terrace / shed / half-half).';


-- ############################################################
-- >>> 021_quotation_builder_support.sql
-- ############################################################

-- ============================================================
-- 021_quotation_builder_support.sql
-- Columns required by the rate-card solar quotation builder:
-- site charges snapshot, line-item image snapshots, quotation
-- numbering formats, and catalog/brand image storage.
-- ============================================================

-- Site charges (height / floor access) snapshot on the quotation
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS site_charges JSONB;

COMMENT ON COLUMN public.quotations.site_charges IS
  'Snapshot of height / floor access charges configured on the quotation.';

-- Image snapshots printed on the BOM
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS brand_image_url_snapshot TEXT;

-- Catalog item extras used by the item master / image upload actions
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT;

-- Brand logos (BOM "Brand" column)
ALTER TABLE quote_brands
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_storage_path TEXT;

-- Quotation numbering formats + stored template / bank details
ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS quotation_numbering_format VARCHAR(40) NOT NULL DEFAULT 'prefix_year_seq',
  ADD COLUMN IF NOT EXISTS quotation_numbering_period VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quotation_notes_footer TEXT,
  ADD COLUMN IF NOT EXISTS quotation_template JSONB,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS branch VARCHAR(120);


-- ############################################################
-- >>> 022_won_closing_gate.sql
-- ############################################################

-- Phase 0: Won closing hard gate — system details, payment plan, mandatory docs
-- Apply after 021_quotation_builder_support.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS won_panel_name TEXT,
  ADD COLUMN IF NOT EXISTS won_panel_quantity INT,
  ADD COLUMN IF NOT EXISTS won_inverter_company TEXT,
  ADD COLUMN IF NOT EXISTS won_system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS won_token_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_pre_dispatch_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_final_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_closed_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.won_panel_name IS 'Won gate: module brand/capacity label';
COMMENT ON COLUMN leads.won_panel_quantity IS 'Won gate: panel count';
COMMENT ON COLUMN leads.won_inverter_company IS 'Won gate: inverter brand';
COMMENT ON COLUMN leads.won_system_size_kw IS 'Won gate: system size kW';
COMMENT ON COLUMN leads.won_token_amount IS 'Won gate: planned token payment';
COMMENT ON COLUMN leads.won_pre_dispatch_amount IS 'Won gate: planned pre-dispatch payment';
COMMENT ON COLUMN leads.won_final_amount IS 'Won gate: planned final payment';
COMMENT ON COLUMN leads.won_closed_at IS 'When Move to Won hard gate completed';


-- ############################################################
-- >>> 023_report_runs.sql
-- ############################################################

-- Phase 2: daily / employee email report idempotency + optional company recipients
-- Apply after 022_won_closing_gate.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS daily_report_emails TEXT;

COMMENT ON COLUMN companies.daily_report_emails IS
  'Comma-separated evening report recipients (overrides / merges with DAILY_REPORT_TO env).';

CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_type VARCHAR(64) NOT NULL DEFAULT 'daily_evening',
  report_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  recipients TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, report_type, report_date)
);

CREATE INDEX IF NOT EXISTS idx_report_runs_company_date
  ON report_runs (company_id, report_date DESC);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_runs_select ON report_runs FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND (
    has_authority('view_reports') OR has_authority('full_access')
  ));

-- Inserts/updates go through service role (cron), not end users.


-- ############################################################
-- >>> 024_lead_profile_fields.sql
-- ############################################################

-- Phase 5a: Lead / customer profile fields (nullable until Won gate)
-- Apply after 023_report_runs.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS meter_type TEXT,
  ADD COLUMN IF NOT EXISTS meter_ownership TEXT,
  ADD COLUMN IF NOT EXISTS payment_plan TEXT;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_meter_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_meter_type_check
  CHECK (meter_type IS NULL OR meter_type IN ('residential', 'commercial', 'common'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_meter_ownership_check;
ALTER TABLE leads ADD CONSTRAINT leads_meter_ownership_check
  CHECK (
    meter_ownership IS NULL
    OR meter_ownership IN ('self', 'wife', 'husband', 'mother', 'father', 'son', 'daughter')
  );

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_payment_plan_check;
ALTER TABLE leads ADD CONSTRAINT leads_payment_plan_check
  CHECK (payment_plan IS NULL OR payment_plan IN ('loan', 'cash'));

COMMENT ON COLUMN leads.meter_type IS 'Residential | Commercial | Common — drives quote subsidy defaults (Phase 4)';
COMMENT ON COLUMN leads.meter_ownership IS 'Meter name / ownership relation to customer';
COMMENT ON COLUMN leads.payment_plan IS 'Loan | Cash financing plan';


-- ############################################################
-- >>> 025_lead_import_profiles.sql
-- ############################################################

-- Phase 5b: per-company Excel import column mapping
-- Apply after 024_lead_profile_fields.sql

CREATE TABLE IF NOT EXISTS lead_import_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  /** Canonical field → spreadsheet header, e.g. {"name":"Customer Name","phone":"Mobile"} */
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id)
);

COMMENT ON TABLE lead_import_profiles IS 'Saved Excel/CSV column map for lead import (Phase 5b)';
COMMENT ON COLUMN lead_import_profiles.mapping IS 'Keys: name, phone, address, city, requirement → header labels from sample file';

ALTER TABLE lead_import_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_import_profiles_select ON lead_import_profiles FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('import_leads')
      OR has_authority('full_access')
    )
  );

CREATE POLICY lead_import_profiles_write ON lead_import_profiles FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('import_leads')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('import_leads')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 026_grievances.sql
-- ############################################################

-- Recare — Phase 3c internal grievances (company issues, not service tickets)

-- ============================================================
-- AUTHORITIES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_grievances', 'View Grievances', 'general'),
  ('raise_grievance', 'Raise Grievance', 'general'),
  ('escalate_grievance', 'Escalate Grievance', 'general'),
  ('resolve_grievance', 'Resolve Grievance', 'general')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r RECORD;
BEGIN
  -- Admin + sales_manager: full grievance lifecycle
  FOR r IN
    SELECT id, slug FROM roles
    WHERE company_id = cid AND slug IN ('admin', 'sales_manager')
  LOOP
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r.id, key, true FROM (VALUES
      ('view_grievances'),
      ('raise_grievance'),
      ('escalate_grievance'),
      ('resolve_grievance')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- All other active system roles: view + raise only
  FOR r IN
    SELECT id FROM roles
    WHERE company_id = cid
      AND slug NOT IN ('admin', 'sales_manager')
  LOOP
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r.id, key, true FROM (VALUES
      ('view_grievances'),
      ('raise_grievance')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS grievances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'operations'
    CHECK (category IN (
      'hr', 'operations', 'payroll', 'facilities', 'it', 'compliance', 'other'
    )),
  priority VARCHAR(16) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'escalated', 'resolved')),
  raised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grievances_company_status
  ON grievances(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grievances_assignee
  ON grievances(assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grievances_raiser
  ON grievances(raised_by);

CREATE TABLE IF NOT EXISTS grievance_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grievance_attachments_grievance
  ON grievance_attachments(grievance_id);

DROP TRIGGER IF EXISTS grievances_updated_at ON grievances;
CREATE TRIGGER grievances_updated_at
  BEFORE UPDATE ON grievances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY grievances_select ON grievances FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_grievances')
      OR has_authority('raise_grievance')
      OR has_authority('full_access')
      OR raised_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

CREATE POLICY grievances_insert ON grievances FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND raised_by = auth.uid()
    AND (
      has_authority('raise_grievance')
      OR has_authority('full_access')
    )
  );

CREATE POLICY grievances_update ON grievances FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('escalate_grievance')
      OR has_authority('resolve_grievance')
      OR has_authority('full_access')
      OR assigned_to = auth.uid()
      OR raised_by = auth.uid()
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('escalate_grievance')
      OR has_authority('resolve_grievance')
      OR has_authority('full_access')
      OR assigned_to = auth.uid()
      OR raised_by = auth.uid()
    )
  );

CREATE POLICY grievance_attachments_select ON grievance_attachments FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_grievances')
      OR has_authority('raise_grievance')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1 FROM grievances g
        WHERE g.id = grievance_attachments.grievance_id
          AND (g.raised_by = auth.uid() OR g.assigned_to = auth.uid())
      )
    )
  );

CREATE POLICY grievance_attachments_write ON grievance_attachments FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('raise_grievance')
      OR has_authority('escalate_grievance')
      OR has_authority('resolve_grievance')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('raise_grievance')
      OR has_authority('escalate_grievance')
      OR has_authority('resolve_grievance')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 027_dealer_role.sql
-- ############################################################

-- Phase 6a — add dealer enums.
-- Must run before 028. Do not reference new enum values elsewhere in this file
-- (Postgres cannot use a new enum value in the same transaction).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dealer';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'dealer';


-- ############################################################
-- >>> 028_dealer_commissions.sql
-- ############################################################

-- Phase 6b — dealer ownership + commission form (not Type A/B ledger)
-- Requires 027_dealer_role.sql (user_role + lead_source dealer values).

-- ============================================================
-- DEALER LINK ON LEADS
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_dealer
  ON leads(company_id, dealer_id)
  WHERE dealer_id IS NOT NULL;

-- ============================================================
-- AUTHORITIES + DEALER ROLE
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('submit_dealer_commission', 'Submit Dealer Commission', 'sales'),
  ('approve_dealer_commission', 'Approve Dealer Commission', 'sales'),
  ('assign_dealer', 'Assign Dealer on Lead', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_mgr UUID;
  r_acct UUID;
  r_dealer UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_mgr FROM roles WHERE company_id = cid AND slug = 'sales_manager';
  SELECT id INTO r_acct FROM roles WHERE company_id = cid AND slug = 'accounts';

  INSERT INTO roles (company_id, name, slug, description, is_system)
  VALUES (
    cid,
    'Dealer',
    'dealer',
    'Sees only own referred files; may submit commission on completed files',
    true
  )
  ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO r_dealer FROM roles WHERE company_id = cid AND slug = 'dealer';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('submit_dealer_commission'),
      ('approve_dealer_commission'),
      ('assign_dealer')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_mgr IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_mgr, key, true FROM (VALUES
      ('submit_dealer_commission'),
      ('approve_dealer_commission'),
      ('assign_dealer')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_acct IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_acct, key, true FROM (VALUES
      ('submit_dealer_commission'),
      ('approve_dealer_commission')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_dealer IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_dealer, key, true FROM (VALUES
      ('add_edit_leads'),
      ('log_sales_activity'),
      ('view_quotations'),
      ('submit_dealer_commission')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- DEALER COMMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS dealer_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_inr NUMERIC(14, 2),
  percent NUMERIC(7, 3),
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_commissions_amount_or_percent CHECK (
    amount_inr IS NOT NULL OR percent IS NOT NULL
  ),
  CONSTRAINT dealer_commissions_lead_unique UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_dealer_commissions_company_status
  ON dealer_commissions(company_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dealer_commissions_dealer
  ON dealer_commissions(dealer_id);

DROP TRIGGER IF EXISTS dealer_commissions_updated_at ON dealer_commissions;
CREATE TRIGGER dealer_commissions_updated_at
  BEFORE UPDATE ON dealer_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dealer_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_commissions_select ON dealer_commissions FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR has_authority('approve_dealer_commission')
      OR has_authority('submit_dealer_commission')
      OR dealer_id = auth.uid()
      OR submitted_by = auth.uid()
    )
  );

CREATE POLICY dealer_commissions_insert ON dealer_commissions FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('submit_dealer_commission')
      OR has_authority('full_access')
      OR dealer_id = auth.uid()
    )
  );

CREATE POLICY dealer_commissions_update ON dealer_commissions FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('approve_dealer_commission')
      OR has_authority('full_access')
      OR (
        has_authority('submit_dealer_commission')
        AND status = 'pending'
        AND (dealer_id = auth.uid() OR submitted_by = auth.uid())
      )
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (
      has_authority('approve_dealer_commission')
      OR has_authority('full_access')
      OR has_authority('submit_dealer_commission')
    )
  );


-- ############################################################
-- >>> 029_commercial_gst_percent.sql
-- ############################################################

-- Commercial: editable GST % on system base price (default 8.9).
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS commercial_gst_percent NUMERIC(5,2);

COMMENT ON COLUMN public.quotations.commercial_gst_percent IS
  'Commercial: GST percent applied to base system price (default 8.9).';


-- ############################################################
-- >>> 029_proofs_upload_hardening.sql
-- ############################################################

-- ============================================================
-- 029_proofs_upload_hardening.sql
-- Wider MIME allow-list for phone photos + surveyor portal doc writes
-- ============================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ],
  file_size_limit = 10485760
WHERE id = 'proofs';

-- Surveyors / sales completing digital survey need to write site-photo docs
-- without requiring the service-role key.
DROP POLICY IF EXISTS portal_docs_write ON portal_documents;
CREATE POLICY portal_docs_write ON portal_documents FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('manage_portal_documents')
      OR has_authority('full_access')
      OR has_authority('conduct_survey')
      OR has_authority('move_lead_stage')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('manage_portal_documents')
      OR has_authority('full_access')
      OR has_authority('conduct_survey')
      OR has_authority('move_lead_stage')
    )
  );


-- ############################################################
-- >>> 030_service_ticket_video.sql
-- ############################################################

-- ============================================================
-- 030_service_ticket_video.sql
-- Allow short service-ticket videos in the existing proofs bucket.
-- Duration is validated in the browser and by the server action for portal
-- uploads (maximum 59 seconds).
-- ============================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ],
  -- Staff videos upload directly to Storage; keep the bucket at the existing 10 MB limit.
  file_size_limit = 10485760
WHERE id = 'proofs';


-- ############################################################
-- >>> 031_team_profile_pictures.sql
-- ############################################################

-- Recare — team profile pictures
-- Apply after 030_service_ticket_video.sql.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- Profile pictures are public because the team directory renders them in the
-- authenticated dashboard and the stored URL must remain usable in the UI.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_upload ON storage.objects;
DROP POLICY IF EXISTS avatars_update ON storage.objects;
DROP POLICY IF EXISTS avatars_select ON storage.objects;
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;

CREATE POLICY avatars_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY avatars_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY avatars_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY avatars_public_read ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'avatars');


-- ############################################################
-- >>> 032_premium_quotation_template.sql
-- ############################################################

-- Recare — tag premium / regular BOM catalogue rows for new quotation templates

UPDATE quote_items
SET template_kind = 'premium', updated_at = NOW()
WHERE model LIKE 'PREMIUM-BOM-%'
  AND template_kind IS DISTINCT FROM 'premium';

UPDATE quote_items
SET template_kind = 'non_solar', updated_at = NOW()
WHERE model LIKE 'REGULAR-BOM-%'
  AND template_kind IS DISTINCT FROM 'non_solar';

UPDATE quote_item_categories
SET kind = 'premium'
WHERE name LIKE 'Premium — %'
  AND kind IS DISTINCT FROM 'premium';

UPDATE quote_item_categories
SET kind = 'non_solar'
WHERE name LIKE 'Regular — %'
  AND kind IS DISTINCT FROM 'non_solar';


-- ############################################################
-- >>> 033_quotation_item_image_snapshots.sql
-- ############################################################

-- Ensure quotation line-item image snapshots exist (required for premium/general BOM quotes).
-- Safe to re-run if migration 021 was skipped or partially applied.

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS brand_image_url_snapshot TEXT;


-- ############################################################
-- >>> 034_quotation_per_kw_rate_card.sql
-- ############################################################

-- ============================================================
-- 034_quotation_per_kw_rate_card.sql
-- Per-kW turnkey rates on rate card companies + quotation tier
-- ============================================================

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_wattage INT,
  ADD COLUMN IF NOT EXISTS residential_regular_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS residential_premium_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commercial_regular_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commercial_premium_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS use_per_kw_pricing BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS tier_type VARCHAR(20) NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS rate_per_kw_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(14,2);

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_tier_type_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_tier_type_check CHECK (tier_type IN ('premium', 'regular'));

-- Backfill panel wattage from module type capacity label
UPDATE rate_card_companies rc
SET panel_wattage = sub.wattage
FROM (
  SELECT
    rc2.id,
    CASE
      WHEN mt.capacity_label ~* '540' THEN 540
      WHEN mt.capacity_label ~* '545' THEN 545
      WHEN mt.capacity_label ~* '550' THEN 550
      WHEN mt.capacity_label ~* '610|615|620' THEN 615
      WHEN mt.capacity_label ~* '700|710|720' THEN 720
      ELSE 540
    END AS wattage
  FROM rate_card_companies rc2
  JOIN rate_card_module_types mt ON mt.id = rc2.module_type_id
  WHERE rc2.panel_wattage IS NULL
) sub
WHERE rc.id = sub.id;

-- Backfill per-kW rates from existing lump-sum packages (avg list / kW)
UPDATE rate_card_companies rc
SET
  residential_regular_rate_per_kw = ROUND(sub.avg_rate, 0),
  residential_premium_rate_per_kw = ROUND(sub.avg_rate * 1.08, 0),
  commercial_regular_rate_per_kw = ROUND(sub.avg_rate * 0.94, 0),
  commercial_premium_rate_per_kw = ROUND(sub.avg_rate * 1.02, 0)
FROM (
  SELECT
    rc2.id,
    AVG(p.list_price / NULLIF(p.system_size_kw, 0)) AS avg_rate
  FROM rate_card_companies rc2
  JOIN rate_card_packages p ON p.rate_company_id = rc2.id AND p.is_active = true
  GROUP BY rc2.id
  HAVING AVG(p.list_price / NULLIF(p.system_size_kw, 0)) > 0
) sub
WHERE rc.id = sub.id
  AND rc.residential_regular_rate_per_kw IS NULL;

-- Spec-aligned overrides for common panel brands (when present)
UPDATE rate_card_companies rc
SET
  panel_wattage = 540,
  residential_regular_rate_per_kw = 48000,
  residential_premium_rate_per_kw = 52000,
  commercial_regular_rate_per_kw = 45000,
  commercial_premium_rate_per_kw = 49000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%adani%'
  AND mt.capacity_label ~* '540';

UPDATE rate_card_companies rc
SET
  panel_wattage = 545,
  residential_regular_rate_per_kw = 50000,
  residential_premium_rate_per_kw = 55000,
  commercial_regular_rate_per_kw = 47000,
  commercial_premium_rate_per_kw = 51000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%waaree%'
  AND mt.capacity_label ~* '540|545';

UPDATE rate_card_companies rc
SET
  panel_wattage = 550,
  residential_regular_rate_per_kw = 52000,
  residential_premium_rate_per_kw = 57000,
  commercial_regular_rate_per_kw = 49000,
  commercial_premium_rate_per_kw = 53000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%goldi%';


-- ############################################################
-- >>> 035_rate_card_flat_panels.sql
-- ############################################################

-- ============================================================
-- 035_rate_card_flat_panels.sql
-- Flat panel rows on rate_card_companies (panel_name free text)
-- ============================================================

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_name VARCHAR(200);

-- Backfill panel name from module type + brand
UPDATE rate_card_companies rc
SET panel_name = TRIM(
  CASE
    WHEN mt.name IS NOT NULL AND rc.name IS NOT NULL AND mt.name <> rc.name
      THEN mt.name || ' — ' || rc.name
    WHEN mt.name IS NOT NULL THEN mt.name
    ELSE rc.name
  END
)
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND (rc.panel_name IS NULL OR rc.panel_name = '');

UPDATE rate_card_companies
SET panel_name = name
WHERE panel_name IS NULL OR panel_name = '';

ALTER TABLE rate_card_companies
  ALTER COLUMN module_type_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_card_companies_tenant_panel_name
  ON rate_card_companies (company_id, panel_name)
  WHERE panel_name IS NOT NULL AND is_active = true;


-- ############################################################
-- >>> 036_quotation_company_settings_builder.sql
-- ############################################################

-- Ensure quotation builder settings columns exist (safe if 021 was skipped).

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS quotation_numbering_format VARCHAR(40) NOT NULL DEFAULT 'prefix_year_seq',
  ADD COLUMN IF NOT EXISTS quotation_numbering_period VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quotation_notes_footer TEXT,
  ADD COLUMN IF NOT EXISTS quotation_template JSONB,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS branch VARCHAR(120);


-- ############################################################
-- >>> 037_quotations_schema_catchup.sql
-- ############################################################

-- Catch-up: quotation columns required by the solar builder (safe if earlier migrations were skipped).

-- Rate-card package snapshots (016)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS rate_package_id UUID,
  ADD COLUMN IF NOT EXISTS module_type_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_company_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_capacity_label VARCHAR(60),
  ADD COLUMN IF NOT EXISTS system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS panel_count INT,
  ADD COLUMN IF NOT EXISTS system_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS min_sale_price_snapshot NUMERIC(14,2);

-- Project type (017)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'residential';

-- Meter phase (018)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS meter_phase TEXT,
  ADD COLUMN IF NOT EXISTS meter_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS meter_phase_label TEXT;

-- Subsidy scheme (019)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS subsidy_scheme TEXT NOT NULL DEFAULT 'residential';

-- Commercial fields (020)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS price_per_kw_excl_gst NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geda_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS panel_mount_type TEXT;

-- Site charges snapshot (021)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS site_charges JSONB;

-- Commercial GST % (029)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS commercial_gst_percent NUMERIC(5,2);

-- Per-kW tier snapshots (034)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS tier_type VARCHAR(20) NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS rate_per_kw_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(14,2);

-- Optional FK for rate_package_id (only if rate_card_packages exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_card_packages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_rate_package_id_fkey'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_rate_package_id_fkey
      FOREIGN KEY (rate_package_id) REFERENCES rate_card_packages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_project_type_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_project_type_check
      CHECK (project_type IN ('residential', 'commercial'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_meter_phase_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_meter_phase_check
      CHECK (
        meter_phase IS NULL
        OR meter_phase IN ('single_phase_1_6', 'three_phase_1_6', 'three_phase_6_10')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_subsidy_scheme_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_subsidy_scheme_check
      CHECK (subsidy_scheme IN ('residential', 'society_common_meter', 'none'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_panel_mount_type_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_panel_mount_type_check
      CHECK (
        panel_mount_type IS NULL
        OR panel_mount_type IN ('rcc_terrace', 'direct_shed', 'half_shed_half_terrace')
      );
  END IF;
END $$;

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_tier_type_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_tier_type_check CHECK (tier_type IN ('premium', 'regular'));

COMMENT ON COLUMN public.quotations.commercial_gst_percent IS
  'Commercial: GST percent applied to base system price (default 8.9).';


-- ############################################################
-- >>> 038_rename_non_solar_category_labels.sql
-- ############################################################

-- Rename legacy "Appliances — …" category labels to cleaner non-solar names.

UPDATE quote_item_categories
SET name = 'Heat Pumps'
WHERE name = 'Appliances — Heat Pumps';

UPDATE quote_item_categories
SET name = 'Solar Water Heaters'
WHERE name = 'Appliances — Solar Water Heaters';

UPDATE quote_item_categories
SET name = 'Commercial RO'
WHERE name = 'Appliances — Commercial RO';


-- ############################################################
-- >>> 039_rename_home_appliances_category.sql
-- ############################################################

-- Rename legacy "Home Appliances" category to cleaner non-solar label.

UPDATE quote_item_categories
SET name = 'Allied Products'
WHERE name = 'Home Appliances';


-- ############################################################
-- >>> 040_rate_card_panel_watt_peak.sql
-- ############################################################

-- Free-text watt peak label on rate card panels (display + parse for kW math).

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_watt_peak VARCHAR(100);

UPDATE rate_card_companies
SET panel_watt_peak = panel_wattage::text || 'W'
WHERE panel_watt_peak IS NULL
  AND panel_wattage IS NOT NULL
  AND panel_wattage > 0;


-- ############################################################
-- >>> 041_rate_card_inverters.sql
-- ############################################################

-- Inverter catalog (name + free-text size) for solar BOM / system package PDF.

CREATE TABLE IF NOT EXISTS rate_card_inverters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inverter_name VARCHAR(200) NOT NULL,
  inverter_size VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_card_inverters_company
  ON rate_card_inverters (company_id, sort_order, inverter_name);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS inverter_type_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS inverter_size_label VARCHAR(100);

COMMENT ON TABLE rate_card_inverters IS 'Solar inverter BOM options (brand/name + size label) for quotations';
COMMENT ON COLUMN quotations.inverter_type_name IS 'Snapshot: inverter brand/name from rate card';
COMMENT ON COLUMN quotations.inverter_size_label IS 'Snapshot: inverter size label from rate card (free text)';


-- ############################################################
-- >>> 047_won_structure_legs.sql
-- ############################################################

-- Recare Phase A — structure legs at Won + JSON heights.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS structure_leg_count INT,
  ADD COLUMN IF NOT EXISTS structure_leg_heights JSONB;

COMMENT ON COLUMN public.leads.structure_leg_count IS
  'Total mounting structure legs captured at Won (2–24).';
COMMENT ON COLUMN public.leads.structure_leg_heights IS
  'Two rows of leg heights in mm: { "rows": [[...], [...]] }.';


-- ############################################################
-- >>> 048_feasibility_pdf_and_docs.sql
-- ############################################################

-- Recare Phase B — feasibility PDF path + Documentation (liaison) may upload from Won.

ALTER TABLE feasibility_reports
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN public.feasibility_reports.storage_path IS
  'Object key in the proofs bucket for the uploaded grid feasibility PDF.';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug IN ('liaison', 'feasibility', 'admin', 'sales_manager')
ON CONFLICT DO NOTHING;

UPDATE roles
SET description = 'Discom liaison, customer documents, and pre-install feasibility PDF'
WHERE slug = 'liaison';


-- ############################################################
-- >>> 049_quotation_discount_caps.sql
-- ############################################################

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


-- ############################################################
-- >>> 050_catalog_available_for_sales.sql
-- ############################################################

-- Recare Phase F: Owner flag — panels available for sales quotations.
-- Sales builder lists available_for_sales = true; Owner catalogue still sees all.

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS available_for_sales BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN rate_card_companies.available_for_sales IS
  'When false, Sales cannot pick this panel on new/edit quotes. Owner still sees it on the rate card.';


-- ############################################################
-- >>> 051_role_authority_recare_ops.sql
-- ############################################################

-- Recare Phase E — Owner-only delete, liaison feasibility, Team group labels.

UPDATE authorities SET authority_group = 'accounts'
WHERE key IN (
  'record_payment',
  'verify_payment',
  'view_payment_queues',
  'verify_subsidy',
  'submit_dealer_commission',
  'approve_dealer_commission'
);

UPDATE authorities SET authority_group = 'documentation'
WHERE key IN (
  'upload_feasibility_report',
  'approve_feasibility_report',
  'manage_liaison',
  'mark_meter_installed',
  'mark_subsidy_received',
  'manage_portal_documents',
  'view_customer_portal_admin'
);

UPDATE authorities SET authority_group = 'installation'
WHERE key IN (
  'assign_installation_crew',
  'upload_installation_proofs',
  'upload_panel_barcodes',
  'complete_installation',
  'view_installation_queue'
);

UPDATE authorities
SET label = 'Delete Leads (Owner)'
WHERE key = 'delete_leads';

-- delete_leads: keep only admin roles
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'delete_leads'
  AND r.slug <> 'admin';

DELETE FROM user_authorities ua
USING profiles p
WHERE ua.user_id = p.id
  AND ua.authority_key = 'delete_leads'
  AND p.role <> 'admin';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_leads', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- liaison may upload feasibility (idempotent; also in 048)
INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug IN ('liaison', 'feasibility', 'admin', 'sales_manager')
ON CONFLICT DO NOTHING;

-- approve_feasibility unused on happy path — revoke from non-admin
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'approve_feasibility_report'
  AND r.slug <> 'admin';

-- install assign: not sales_manager by default
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'assign_installation_crew'
  AND r.slug = 'sales_manager';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'assign_installation_crew', true
FROM roles r
WHERE r.slug IN ('admin', 'ops_coordinator')
ON CONFLICT DO NOTHING;


-- ############################################################
-- >>> 052_daily_report_alerts.sql
-- ############################################################

-- Recare Phase G: evening digest failures can alert Owner without a lead.

ALTER TABLE reminders
  ALTER COLUMN lead_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_open_daily_report_failed
  ON reminders (company_id)
  WHERE reminder_type = 'daily_report_failed' AND resolved_at IS NULL;

COMMENT ON COLUMN reminders.lead_id IS
  'Nullable for company-level alerts such as daily_report_failed.';


-- ############################################################
-- >>> 053_survey_discount_visibility.sql
-- ############################################################

-- Recare — digital survey grant, View All Leads defaults, lead RLS alignment.
-- Apply after 052_daily_report_alerts.sql.

UPDATE authorities
SET label = 'Complete digital survey'
WHERE key = 'conduct_survey';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'conduct_survey', true
FROM roles r
WHERE r.slug IN ('sales_executive', 'surveyor', 'sales_manager', 'admin')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Keep View All Leads as a Team checkbox; default on only for Owner / Sales Manager.
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND r.slug NOT IN ('admin', 'sales_manager');

-- Extra user_authorities grants are left in place (Owner may have given one person).

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR dealer_id = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR dealer_id = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
    )
  );


-- ############################################################
-- >>> 054_frs_brand_seed.sql
-- ############################################################

-- Florian — tenant name, slug, and quotation prefix (fresh or leftover Recare seed).
UPDATE companies
SET
  name = 'Florian',
  slug = 'florian-sales',
  email = 'admin@florian-sales.local'
WHERE id = 'a0000000-0000-4000-8000-000000000001';

UPDATE quotation_company_settings
SET
  quotation_prefix = 'FLR',
  from_name = 'Florian'
WHERE company_id = 'a0000000-0000-4000-8000-000000000001';


-- ############################################################
-- >>> 055_account_code.sql
-- ############################################################

-- FRS Phase 2 — alphanumeric account codes (FLR29) unique per company.

CREATE TABLE IF NOT EXISTS company_account_code_seq (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_n INTEGER NOT NULL DEFAULT 1 CHECK (next_n >= 1)
);

ALTER TABLE company_account_code_seq ENABLE ROW LEVEL SECURITY;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_account_code_uidx
  ON leads (company_id, lower(account_code))
  WHERE account_code IS NOT NULL AND btrim(account_code) <> '';

CREATE INDEX IF NOT EXISTS idx_leads_account_code
  ON leads (company_id, account_code);

CREATE OR REPLACE FUNCTION next_frs_account_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE company_account_code_seq
  SET next_n = next_n + 1
  WHERE company_id = p_company_id
  RETURNING next_n - 1 INTO n;

  RETURN 'FLR' || n::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION leads_assign_account_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw TEXT;
  n INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_code IS NOT DISTINCT FROM OLD.account_code THEN
    RETURN NEW;
  END IF;

  raw := NULLIF(btrim(NEW.account_code), '');
  IF raw IS NULL THEN
    NEW.account_code := next_frs_account_code(NEW.company_id);
    RETURN NEW;
  END IF;

  raw := upper(regexp_replace(raw, '\s+', '', 'g'));
  IF raw ~ '^\d+$' THEN
    raw := 'FLR' || raw;
  END IF;
  IF raw !~ '^FLR[0-9]+$' THEN
    RAISE EXCEPTION 'Account code must look like FLR29';
  END IF;
  NEW.account_code := raw;

  n := substring(raw FROM 4)::INTEGER;
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (NEW.company_id, n + 1)
  ON CONFLICT (company_id) DO UPDATE
    SET next_n = GREATEST(company_account_code_seq.next_n, EXCLUDED.next_n);

  RETURN NEW;
END;
$$;

-- Backfill existing rows before the trigger is attached.
DO $$
DECLARE
  cid UUID;
  lid UUID;
  n INTEGER;
BEGIN
  FOR cid IN SELECT DISTINCT company_id FROM leads LOOP
    n := 0;
    FOR lid IN
      SELECT id FROM leads
      WHERE company_id = cid
        AND (account_code IS NULL OR btrim(account_code) = '')
      ORDER BY created_at, id
    LOOP
      n := n + 1;
      UPDATE leads SET account_code = 'FLR' || n::TEXT WHERE id = lid;
    END LOOP;

    SELECT COALESCE(MAX(substring(account_code FROM 4)::INTEGER), 0)
      INTO n
    FROM leads
    WHERE company_id = cid
      AND account_code ~ '^FLR[0-9]+$';

    INSERT INTO company_account_code_seq (company_id, next_n)
    VALUES (cid, n + 1)
    ON CONFLICT (company_id) DO UPDATE
      SET next_n = GREATEST(company_account_code_seq.next_n, EXCLUDED.next_n);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tr_leads_account_code ON leads;
CREATE TRIGGER tr_leads_account_code
  BEFORE INSERT OR UPDATE OF account_code ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_assign_account_code();

GRANT EXECUTE ON FUNCTION next_frs_account_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION leads_assign_account_code() TO authenticated, service_role;


-- ############################################################
-- >>> 056_calling_cycle.sql
-- ############################################################

-- FRS Phase 3 — circular calling cycle.
-- next_followup_at = next call; last_call_at = last outreach; temperature = Hot/Warm/Cold.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS cycle_bucket SMALLINT
  CHECK (cycle_bucket IS NULL OR cycle_bucket BETWEEN 1 AND 4);

CREATE INDEX IF NOT EXISTS idx_leads_calling_queue
  ON leads (company_id, temperature, next_followup_at)
  WHERE sales_stage <> 'lost';

CREATE INDEX IF NOT EXISTS idx_leads_last_call
  ON leads (company_id, last_call_at)
  WHERE sales_stage <> 'lost';

CREATE OR REPLACE FUNCTION recycle_frs_calling_cycle(p_company_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER := 0;
BEGIN
  UPDATE leads
  SET
    next_followup_at = NOW(),
    next_followup_action = COALESCE(NULLIF(btrim(next_followup_action), ''), 'Calling cycle'),
    cycle_bucket = 1 + (ABS(HASHTEXT(id::TEXT)) % 4)
  WHERE sales_stage <> 'lost'
    AND temperature IN ('cold', 'warm')
    AND (p_company_id IS NULL OR company_id = p_company_id)
    AND COALESCE(last_call_at, created_at) <= NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION recycle_frs_calling_cycle(UUID) TO service_role;


-- ############################################################
-- >>> 057_trade_ledger.sql
-- ############################################################

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


-- ############################################################
-- >>> 058_trade_score.sql
-- ############################################################

-- FRS Phase 5 — denormalized last trade dates + 30-day outward qty for list pins.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outward_on DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inward_on DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outward_qty_30d NUMERIC(14, 3) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_inactive_alerted_on DATE;

CREATE INDEX IF NOT EXISTS idx_leads_trade_score
  ON leads (company_id, last_outward_on, outward_qty_30d)
  WHERE sales_stage <> 'lost';

CREATE OR REPLACE FUNCTION refresh_lead_trade_score(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_today DATE := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  UPDATE leads l
  SET
    last_outward_on = s.last_outward_on,
    last_inward_on = s.last_inward_on,
    outward_qty_30d = COALESCE(s.outward_qty_30d, 0)
  FROM (
    SELECT
      e.lead_id,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'outward') AS last_outward_on,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'inward') AS last_inward_on,
      COALESCE(
        SUM(e.qty) FILTER (
          WHERE e.direction = 'outward'
            AND e.occurred_on >= ist_today - 30
        ),
        0
      ) AS outward_qty_30d
    FROM trade_entries e
    WHERE e.lead_id = p_lead_id
    GROUP BY e.lead_id
  ) s
  WHERE l.id = p_lead_id
    AND l.id = s.lead_id;

  UPDATE leads
  SET
    last_outward_on = NULL,
    last_inward_on = NULL,
    outward_qty_30d = 0
  WHERE id = p_lead_id
    AND NOT EXISTS (SELECT 1 FROM trade_entries e WHERE e.lead_id = p_lead_id);
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_lead_trade_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_lead_trade_score(OLD.lead_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_lead_trade_score(NEW.lead_id);
  IF TG_OP = 'UPDATE' AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    PERFORM refresh_lead_trade_score(OLD.lead_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_trade_entries_score ON trade_entries;
CREATE TRIGGER tr_trade_entries_score
  AFTER INSERT OR UPDATE OR DELETE ON trade_entries
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_lead_trade_score();

DO $$
DECLARE
  lid UUID;
BEGIN
  FOR lid IN SELECT DISTINCT lead_id FROM trade_entries LOOP
    PERFORM refresh_lead_trade_score(lid);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION refresh_lead_trade_score(UUID) TO service_role;


-- ############################################################
-- >>> 059_b2b_quote_skus.sql
-- ############################################################

-- Florian Sales: quotation catalogue starts empty.
-- Staff add line items in Catalogue. No seeded combo-box or panel SKUs.


-- ############################################################
-- >>> 060_discovery_lock.sql
-- ############################################################

-- FRS discovery lock (2026-09-25): account-code start, named items,
-- rupee + conversion rollups, optional vehicle/transporter.

ALTER TABLE trade_entries
  ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(80),
  ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(160);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS outward_conversions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outward_earnings_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inward_purchases INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inward_spend_inr NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_trade_money
  ON leads (company_id, outward_conversions, outward_earnings_inr)
  WHERE sales_stage <> 'lost';

CREATE OR REPLACE FUNCTION next_frs_account_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
  code TEXT;
BEGIN
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  LOOP
    UPDATE company_account_code_seq
    SET next_n = next_n + 1
    WHERE company_id = p_company_id
    RETURNING next_n - 1 INTO n;

    code := 'FLR' || n::TEXT;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM leads
      WHERE company_id = p_company_id
        AND upper(btrim(account_code)) = code
    );
  END LOOP;

  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION get_frs_account_code_seq()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := auth_company_id();
  n INTEGER;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (cid, 1)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT next_n INTO n FROM company_account_code_seq WHERE company_id = cid;
  RETURN COALESCE(n, 1);
END;
$$;

CREATE OR REPLACE FUNCTION set_frs_account_code_start(p_next INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := auth_company_id();
  applied INTEGER;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_next IS NULL OR p_next < 1 THEN
    RAISE EXCEPTION 'Start number must be at least 1';
  END IF;
  IF NOT (
    is_admin_user()
    OR has_authority('manage_settings')
    OR has_authority('full_access')
  ) THEN
    RAISE EXCEPTION 'Only Admin can change the account code start';
  END IF;

  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (cid, p_next)
  ON CONFLICT (company_id) DO UPDATE
    SET next_n = EXCLUDED.next_n
  RETURNING next_n INTO applied;
  RETURN applied;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_lead_trade_score(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_today DATE := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  UPDATE leads l
  SET
    last_outward_on = s.last_outward_on,
    last_inward_on = s.last_inward_on,
    outward_qty_30d = COALESCE(s.outward_qty_30d, 0),
    outward_conversions = COALESCE(s.outward_conversions, 0),
    outward_earnings_inr = COALESCE(s.outward_earnings_inr, 0),
    inward_purchases = COALESCE(s.inward_purchases, 0),
    inward_spend_inr = COALESCE(s.inward_spend_inr, 0)
  FROM (
    SELECT
      e.lead_id,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'outward') AS last_outward_on,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'inward') AS last_inward_on,
      COALESCE(
        SUM(e.qty) FILTER (
          WHERE e.direction = 'outward'
            AND e.occurred_on >= ist_today - 30
        ),
        0
      ) AS outward_qty_30d,
      COUNT(*) FILTER (WHERE e.direction = 'outward') AS outward_conversions,
      COALESCE(SUM(e.amount_inr) FILTER (WHERE e.direction = 'outward'), 0) AS outward_earnings_inr,
      COUNT(*) FILTER (WHERE e.direction = 'inward') AS inward_purchases,
      COALESCE(SUM(e.amount_inr) FILTER (WHERE e.direction = 'inward'), 0) AS inward_spend_inr
    FROM trade_entries e
    WHERE e.lead_id = p_lead_id
    GROUP BY e.lead_id
  ) s
  WHERE l.id = p_lead_id
    AND l.id = s.lead_id;

  UPDATE leads
  SET
    last_outward_on = NULL,
    last_inward_on = NULL,
    outward_qty_30d = 0,
    outward_conversions = 0,
    outward_earnings_inr = 0,
    inward_purchases = 0,
    inward_spend_inr = 0
  WHERE id = p_lead_id
    AND NOT EXISTS (SELECT 1 FROM trade_entries e WHERE e.lead_id = p_lead_id);
END;
$$;

GRANT EXECUTE ON FUNCTION next_frs_account_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_frs_account_code_seq() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_frs_account_code_start(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_lead_trade_score(UUID) TO service_role;

DO $$
DECLARE
  lid UUID;
BEGIN
  FOR lid IN SELECT DISTINCT lead_id FROM trade_entries LOOP
    PERFORM refresh_lead_trade_score(lid);
  END LOOP;
END $$;


-- ############################################################
-- >>> 061_view_profit.sql
-- ############################################################

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
