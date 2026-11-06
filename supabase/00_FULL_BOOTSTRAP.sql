-- ============================================================
-- RK Bhabhor — FULL BOOTSTRAP (one-shot)
-- Generated from Apps/RK-Solar/supabase/migrations/*.sql in name order.
-- Run once on a NEW empty Supabase project (SQL Editor).
--
-- Includes Admin bootstrap:
--   email:    admin@dyzensolar.com
--   password: test@123
--   role:     admin
--   company:  RK Bhabhor (a0000000-0000-4000-8000-000000000001)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ############################################################################
-- BEGIN 001_init.sql
-- ############################################################################

-- RK Solar — Phase 0 bootstrap schema
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
-- SEED TENANT (RK Bhabhor)
-- ============================================================
INSERT INTO companies (id, name, slug, email)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'RK Bhabhor',
  'rk-solar',
  'admin@dyzensolar.com'
)
ON CONFLICT (slug) DO NOTHING;


-- END 001_init.sql

-- ############################################################################
-- BEGIN 002_lms.sql
-- ############################################################################

-- RK Solar — Phase 1 LMS schema
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


-- END 002_lms.sql

-- ############################################################################
-- BEGIN 003_dual_assignee.sql
-- ############################################################################

-- RK Solar — Phase 2 dual assignee (tele-caller vs surveyor)

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


-- END 003_dual_assignee.sql

-- ############################################################################
-- BEGIN 004_surveys.sql
-- ############################################################################

-- RK Solar — Phase 3 digital survey stub

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


-- END 004_surveys.sql

-- ############################################################################
-- BEGIN 005_ingestion.sql
-- ############################################################################

-- RK Solar — Phase 4 lead ingestion (referral + Facebook)

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


-- END 005_ingestion.sql

-- ############################################################################
-- BEGIN 006_fix_auth_trigger.sql
-- ############################################################################

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


-- END 006_fix_auth_trigger.sql

-- ############################################################################
-- BEGIN 007_quotations.sql
-- ############################################################################

-- RK Solar — Module 3 quotations (lean catalog + lead-linked quotes)

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
  quotation_prefix VARCHAR(24) NOT NULL DEFAULT 'RKS',
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
    'RKS',
    'Prices inclusive of applicable GST unless noted. Validity 15 days. Payment as per agreed milestones.',
    'RK Bhabhor'
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


-- END 007_quotations.sql

-- ############################################################################
-- BEGIN 008_payments.sql
-- ############################################################################

-- RK Solar — Module 4 milestone payments + parallel feasibility

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


-- END 008_payments.sql

-- ############################################################################
-- BEGIN 009_installation.sql
-- ############################################################################

-- RK Solar — Module 5 installation + barcode proofs

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


-- END 009_installation.sql

-- ############################################################################
-- BEGIN 010_discom_portal.sql
-- ############################################################################

-- RK Solar — Module 6 Discom liaison + subsidy timer + portal

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


-- END 010_discom_portal.sql

-- ############################################################################
-- BEGIN 011_maintenance.sql
-- ############################################################################

-- RK Solar — Module 7 maintenance tickets + cleaning reminders

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


-- END 011_maintenance.sql

-- ############################################################################
-- BEGIN 012_proofs_storage.sql
-- ############################################################################

-- RK Solar — proofs storage bucket (install / ticket photos)

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


-- END 012_proofs_storage.sql

-- ############################################################################
-- BEGIN 013_team_access.sql
-- ############################################################################

-- RK Solar — Team & Access administration hardening
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


-- END 013_team_access.sql

-- ############################################################################
-- BEGIN 014_portal_customer_docs.sql
-- ############################################################################

-- RK Solar — customer portal document uploads + staff Docs tab

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


-- END 014_portal_customer_docs.sql

-- ############################################################################
-- BEGIN 015_catalog_item_images.sql
-- ############################################################################

-- RK Solar — catalog item images + premium BOM from materials PDF
-- Apply after 014_portal_customer_docs.sql

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;


-- END 015_catalog_item_images.sql

-- ############################################################################
-- BEGIN 016_rate_card.sql
-- ############################################################################

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


-- END 016_rate_card.sql

-- ############################################################################
-- BEGIN 017_quotation_project_type.sql
-- ############################################################################

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


-- END 017_quotation_project_type.sql

-- ############################################################################
-- BEGIN 018_quotation_meter_phase.sql
-- ############################################################################

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


-- END 018_quotation_meter_phase.sql

-- ############################################################################
-- BEGIN 019_quotation_subsidy_scheme.sql
-- ############################################################################

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


-- END 019_quotation_subsidy_scheme.sql

-- ############################################################################
-- BEGIN 020_commercial_quotation_fields.sql
-- ############################################################################

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


-- END 020_commercial_quotation_fields.sql

-- ############################################################################
-- BEGIN 021_quotation_builder_support.sql
-- ############################################################################

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


-- END 021_quotation_builder_support.sql

-- ############################################################################
-- BEGIN 022_won_closing_gate.sql
-- ############################################################################

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


-- END 022_won_closing_gate.sql

-- ############################################################################
-- BEGIN 023_report_runs.sql
-- ############################################################################

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


-- END 023_report_runs.sql

-- ############################################################################
-- BEGIN 024_lead_profile_fields.sql
-- ############################################################################

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


-- END 024_lead_profile_fields.sql

-- ############################################################################
-- BEGIN 025_lead_import_profiles.sql
-- ############################################################################

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


-- END 025_lead_import_profiles.sql

-- ############################################################################
-- BEGIN 026_grievances.sql
-- ############################################################################

-- RK Solar — Phase 3c internal grievances (company issues, not service tickets)

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


-- END 026_grievances.sql

-- ############################################################################
-- BEGIN 027_dealer_role.sql
-- ############################################################################

-- Phase 6a — add dealer enums.
-- Must run before 028. Do not reference new enum values elsewhere in this file
-- (Postgres cannot use a new enum value in the same transaction).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dealer';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'dealer';


-- END 027_dealer_role.sql

-- ############################################################################
-- BEGIN 028_dealer_commissions.sql
-- ############################################################################

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


-- END 028_dealer_commissions.sql

-- ############################################################################
-- BEGIN 029_commercial_gst_percent.sql
-- ############################################################################

-- Commercial: editable GST % on system base price (default 8.9).
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS commercial_gst_percent NUMERIC(5,2);

COMMENT ON COLUMN public.quotations.commercial_gst_percent IS
  'Commercial: GST percent applied to base system price (default 8.9).';


-- END 029_commercial_gst_percent.sql

-- ############################################################################
-- BEGIN 029_proofs_upload_hardening.sql
-- ############################################################################

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


-- END 029_proofs_upload_hardening.sql

-- ############################################################################
-- BEGIN 030_service_ticket_video.sql
-- ############################################################################

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


-- END 030_service_ticket_video.sql

-- ############################################################################
-- BEGIN 031_team_profile_pictures.sql
-- ############################################################################

-- RK Solar — team profile pictures
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


-- END 031_team_profile_pictures.sql

-- ############################################################################
-- BEGIN 032_premium_quotation_template.sql
-- ############################################################################

-- RK Solar — tag premium / regular BOM catalogue rows for new quotation templates

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


-- END 032_premium_quotation_template.sql

-- ############################################################################
-- BEGIN 033_quotation_item_image_snapshots.sql
-- ############################################################################

-- Ensure quotation line-item image snapshots exist (required for premium/general BOM quotes).
-- Safe to re-run if migration 021 was skipped or partially applied.

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS brand_image_url_snapshot TEXT;


-- END 033_quotation_item_image_snapshots.sql

-- ############################################################################
-- BEGIN 034_quotation_per_kw_rate_card.sql
-- ############################################################################

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


-- END 034_quotation_per_kw_rate_card.sql

-- ############################################################################
-- BEGIN 035_rate_card_flat_panels.sql
-- ############################################################################

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


-- END 035_rate_card_flat_panels.sql

-- ############################################################################
-- BEGIN 036_quotation_company_settings_builder.sql
-- ############################################################################

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


-- END 036_quotation_company_settings_builder.sql

-- ############################################################################
-- BEGIN 037_quotations_schema_catchup.sql
-- ############################################################################

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


-- END 037_quotations_schema_catchup.sql

-- ############################################################################
-- BEGIN 038_rename_non_solar_category_labels.sql
-- ############################################################################

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


-- END 038_rename_non_solar_category_labels.sql

-- ############################################################################
-- BEGIN 039_rename_home_appliances_category.sql
-- ############################################################################

-- Rename legacy "Home Appliances" category to cleaner non-solar label.

UPDATE quote_item_categories
SET name = 'Allied Products'
WHERE name = 'Home Appliances';


-- END 039_rename_home_appliances_category.sql

-- ############################################################################
-- BEGIN 040_rate_card_panel_watt_peak.sql
-- ############################################################################

-- Free-text watt peak label on rate card panels (display + parse for kW math).

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_watt_peak VARCHAR(100);

UPDATE rate_card_companies
SET panel_watt_peak = panel_wattage::text || 'W'
WHERE panel_watt_peak IS NULL
  AND panel_wattage IS NOT NULL
  AND panel_wattage > 0;


-- END 040_rate_card_panel_watt_peak.sql

-- ############################################################################
-- BEGIN 041_rate_card_inverters.sql
-- ############################################################################

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


-- END 041_rate_card_inverters.sql

-- ############################################################################
-- BEGIN 042_proofs_storage_delete.sql
-- ############################################################################

-- Allow authenticated users to delete their company's objects in proofs
-- (needed when replacing quotation template images).

DROP POLICY IF EXISTS proofs_delete ON storage.objects;

CREATE POLICY proofs_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );


-- END 042_proofs_storage_delete.sql

-- ############################################################################
-- BEGIN 043_quotation_settings_bank_field_lengths.sql
-- ############################################################################

-- Multi-bank IFSC / account strings used in RK brand defaults exceed old limits.

ALTER TABLE quotation_company_settings
  ALTER COLUMN ifsc_code TYPE VARCHAR(80),
  ALTER COLUMN account_number TYPE VARCHAR(160),
  ALTER COLUMN bank_name TYPE VARCHAR(200),
  ALTER COLUMN branch TYPE VARCHAR(200);


-- END 043_quotation_settings_bank_field_lengths.sql

-- ############################################################################
-- BEGIN 044_leads_update_verify_payment.sql
-- ############################################################################

-- Allow Accounts (verify_payment) to update leads so payment verification can advance sales_stage.
-- Without this, payments can be marked verified while the lead stays on *_pending_verification.

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
      OR has_authority('verify_payment')
      OR has_authority('full_access')
    )
  );


-- END 044_leads_update_verify_payment.sql

-- ############################################################################
-- BEGIN 045_won_consumer_subsidy.sql
-- ############################################################################

-- Won closing: consumer number + company-borne subsidy flag for Accounts receivables.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consumer_number TEXT,
  ADD COLUMN IF NOT EXISTS company_bears_subsidy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subsidy_amount_at_won NUMERIC(14, 2);

COMMENT ON COLUMN public.leads.consumer_number IS
  'Electricity consumer / GEB number — captured when moving to Won';
COMMENT ON COLUMN public.leads.company_bears_subsidy IS
  'When true, company bears/recovers subsidy — Accounts treats subsidy_amount_at_won as pending until subsidy_verified_at';
COMMENT ON COLUMN public.leads.subsidy_amount_at_won IS
  'Snapshot of quotation subsidy at Won when company_bears_subsidy is true';

CREATE INDEX IF NOT EXISTS idx_leads_consumer_number
  ON leads (company_id, consumer_number)
  WHERE consumer_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company_bears_subsidy
  ON leads (company_id)
  WHERE company_bears_subsidy = true;


-- END 045_won_consumer_subsidy.sql

-- ############################################################################
-- BEGIN 046_installation_supervisor_proofs.sql
-- ############################################################################

-- Installation Supervisor (ops_coordinator display), richer proofs, feasibility PDF path.

UPDATE roles
SET name = 'Installation Supervisor',
    description = 'Receives finalized (pre-dispatch verified) files first and assigns installation crew'
WHERE slug = 'ops_coordinator';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS inverter_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS install_geo_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS install_geo_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS install_geo_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_serial_count INT;

COMMENT ON COLUMN public.leads.inverter_serial_number IS
  'Inverter serial captured on site (OCR assist + manual confirm)';

CREATE TABLE IF NOT EXISTS installation_panel_serials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  panel_index INT NOT NULL,
  serial_text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'ocr', 'barcode')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, panel_index)
);

CREATE INDEX IF NOT EXISTS idx_install_panel_serials_lead
  ON installation_panel_serials (lead_id);

ALTER TABLE feasibility_reports
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE installation_panel_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS install_serials_select ON installation_panel_serials;
CREATE POLICY install_serials_select ON installation_panel_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS install_serials_write ON installation_panel_serials;
CREATE POLICY install_serials_write ON installation_panel_serials FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('upload_installation_proofs')
      OR has_authority('upload_panel_barcodes')
      OR has_authority('assign_installation_crew')
      OR has_authority('complete_installation')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
  );


-- END 046_installation_supervisor_proofs.sql

-- ############################################################################
-- BEGIN 047_leads_select_accounts_payments.sql
-- ############################################################################

-- Accounts can see payment rows but not the linked customer (leads_select
-- required view_all_leads / assignee). The embed then returns null ("—") and
-- verifyPayment's lead .single() fails — production shows a generic RSC error.
-- Mirror 044 (verify_payment on UPDATE) for SELECT.

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
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
    )
  );


-- END 047_leads_select_accounts_payments.sql

-- ############################################################################
-- BEGIN 048_payments_owner_delete.sql
-- ############################################################################

-- Owner (admin / full_access) may delete a mistaken or duplicate payment row.

DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR has_authority('manage_quotations')
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active
      )
    )
  );


-- END 048_payments_owner_delete.sql

-- ############################################################################
-- BEGIN 049_crew_lead_and_survey_select.sql
-- ############################################################################

-- Assigned installation crew can SELECT their jobs, digital surveys, and
-- survey site photos. 047 leads_select omitted assigned_crew_id (Accounts
-- clauses kept). Crew remains read-only on surveys.

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
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS surveys_select ON surveys;
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
          OR l.assigned_crew_id = auth.uid()
          OR l.created_by = auth.uid()
          OR has_authority('view_all_leads')
          OR has_authority('full_access')
        )
    )
  );

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
          OR l.assigned_crew_id = auth.uid()
          OR l.created_by = auth.uid()
        )
    )
  );


-- END 049_crew_lead_and_survey_select.sql

-- ############################################################################
-- BEGIN 050_lock_crew_install_photo_delete.sql
-- ############################################################################

-- Evidence lock: installation crew cannot delete proofs after upload.
-- Supervisor (assign_installation_crew), complete_installation, or full_access may still remove.

DROP POLICY IF EXISTS install_photos_delete ON installation_photos;
CREATE POLICY install_photos_delete ON installation_photos FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('complete_installation')
      OR has_authority('assign_installation_crew')
      OR has_authority('full_access')
    )
  );


-- END 050_lock_crew_install_photo_delete.sql

-- ############################################################################
-- BEGIN 051_delete_leads_customers_authority.sql
-- ############################################################################

-- Keep Delete Leads / Customers in the catalog. Owner (admin) already
-- passes has_authority() for every key. Other roles only get it when
-- ticked in Team & Access — revoke the old sales_manager seed default.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'delete_leads',
  'Delete Leads / Customers',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_leads', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

UPDATE role_authorities ra
SET granted = false
FROM roles r
WHERE ra.role_id = r.id
  AND r.slug = 'sales_manager'
  AND ra.authority_key = 'delete_leads';


-- END 051_delete_leads_customers_authority.sql

-- ############################################################################
-- BEGIN 052_lead_visibility_assigned_only.sql
-- ############################################################################

-- Leads / customers: only Admin (or a role that still has view_all_leads)
-- sees the company list. Assignment is not a company-wide unlock.
-- Seeds in 002/008/009/010 granted view_all_leads to Sales Manager, Sales Exec,
-- Accounts, Ops, Feasibility, and Liaison — so every staff user saw every file.

DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND COALESCE(r.slug, '') <> 'admin';


-- END 052_lead_visibility_assigned_only.sql

-- ############################################################################
-- BEGIN 053_docs_feasibility_liaison.sql
-- ############################################################################

-- Documentation (liaison) uploads the pre-install feasibility PDF.
-- Role `feasibility` already has this key; keep it as an alias.

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug = 'liaison'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;


-- END 053_docs_feasibility_liaison.sql

-- ############################################################################
-- BEGIN 054_quotation_bank_icici_only.sql
-- ############################################################################

-- RK Solar: do not seed another company's bank details.
-- Clear any SBI/ICICI letterhead leftovers so quotes start blank until letterhead is set.

UPDATE public.quotation_company_settings
SET
  bank_name = NULL,
  account_number = NULL,
  ifsc_code = NULL,
  branch = NULL,
  bank_account_name = NULL
WHERE bank_name ILIKE '%SBI%'
   OR account_number ILIKE '%SBI%'
   OR ifsc_code ILIKE '%SBIN%'
   OR bank_name ILIKE '%ICICI%'
   OR account_number = '200905500146'
   OR ifsc_code = 'ICIC0002009'
   OR bank_account_name ILIKE '%RENEWABLE%';


-- END 054_quotation_bank_icici_only.sql

-- ############################################################################
-- BEGIN 055_delete_quotations_authority.sql
-- ############################################################################

-- Delete Quotations authority. Owner (admin) passes has_authority() for every
-- key; other roles get it only when ticked in Team & Access. Manage Quotations
-- and Full Access keep delete rights. Accepted / paid quotes are blocked in the app.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'delete_quotations',
  'Delete Quotations',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_quotations', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

DROP POLICY IF EXISTS quotations_delete ON quotations;
CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('delete_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );


-- END 055_delete_quotations_authority.sql

-- ############################################################################
-- BEGIN 056_liaison_customer_visibility.sql
-- ############################################################################

-- Documentation / Discom liaison lost all lead rows after 052 removed
-- view_all_leads from non-admin roles: leads_select / leads_update had no
-- liaison clause, so Dashboard and Documentation queues came back empty.
-- Liaison authorities now see and update Won-or-later customer files only
-- (not the sales pipeline).

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
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
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
      OR has_authority('verify_payment')
      OR has_authority('full_access')
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );


-- END 056_liaison_customer_visibility.sql

-- ############################################################################
-- BEGIN 057_quotation_recycle_bin.sql
-- ############################################################################

-- Quotation recycle bin. Delete now moves a quote to the bin (deleted_at);
-- RLS hides bin rows from every normal read (quotation_items follow through
-- their EXISTS policy). Bin list / soft delete / restore / purge go through
-- SECURITY DEFINER functions because a plain UPDATE that sets deleted_at
-- would fail the SELECT / UPDATE policies on the new row.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_quotations_deleted
  ON quotations(company_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

INSERT INTO authorities (key, label, authority_group)
VALUES ('restore_quotations', 'Restore Quotations', 'sales')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'restore_quotations', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- ------------------------------------------------------------
-- Policies: live rows only
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_select ON quotations;
CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND deleted_at IS NULL
    AND (
      has_authority('view_quotations')
      OR has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS quotations_update ON quotations;
CREATE POLICY quotations_update ON quotations FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND deleted_at IS NULL
    AND (
      has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('accept_quotations')
      OR has_authority('full_access')
    )
  );

-- Hard delete only for rows already in the bin (purge goes through purge_quotation).
DROP POLICY IF EXISTS quotations_delete ON quotations;
CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND deleted_at IS NOT NULL
    AND has_authority('full_access')
  );

-- ------------------------------------------------------------
-- Functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION soft_delete_quotation(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_status TEXT;
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (has_authority('delete_quotations') OR has_authority('manage_quotations')) THEN
    RAISE EXCEPTION 'Missing authority: delete_quotations';
  END IF;

  SELECT status INTO v_status
  FROM quotations
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_status = 'accepted' THEN
    RAISE EXCEPTION 'Accepted quotations cannot be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE accepted_quotation_id = p_id) THEN
    RAISE EXCEPTION 'Quotation is linked as a lead''s accepted quotation';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE quotation_id = p_id) THEN
    RAISE EXCEPTION 'Quotation has recorded payments';
  END IF;

  UPDATE quotations
  SET deleted_at = NOW(),
      deleted_by = auth.uid(),
      delete_reason = NULLIF(BTRIM(p_reason), '')
  WHERE id = p_id AND company_id = v_company;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION list_deleted_quotations()
RETURNS TABLE (
  id UUID,
  quotation_no TEXT,
  status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  grand_total NUMERIC,
  lead_id UUID,
  lead_name TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_name TEXT,
  delete_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_company_id() IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (
    has_authority('restore_quotations')
    OR has_authority('delete_quotations')
    OR has_authority('manage_quotations')
  ) THEN
    RAISE EXCEPTION 'Missing authority: restore_quotations';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.quotation_no::TEXT,
    q.status::TEXT,
    q.customer_name::TEXT,
    q.customer_phone::TEXT,
    q.grand_total::NUMERIC,
    q.lead_id,
    l.name::TEXT,
    q.deleted_at,
    q.deleted_by,
    p.name::TEXT,
    q.delete_reason
  FROM quotations q
  LEFT JOIN leads l ON l.id = q.lead_id
  LEFT JOIN profiles p ON p.id = q.deleted_by
  WHERE q.company_id = auth_company_id()
    AND q.deleted_at IS NOT NULL
  ORDER BY q.deleted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION restore_quotation(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (has_authority('restore_quotations') OR has_authority('manage_quotations')) THEN
    RAISE EXCEPTION 'Missing authority: restore_quotations';
  END IF;

  UPDATE quotations
  SET deleted_at = NULL,
      deleted_by = NULL,
      delete_reason = NULL
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation is not in the recycle bin';
  END IF;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION purge_quotation(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT has_authority('full_access') THEN
    RAISE EXCEPTION 'Only admins can delete quotations permanently';
  END IF;

  DELETE FROM quotations
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation is not in the recycle bin';
  END IF;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_quotation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION list_deleted_quotations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION restore_quotation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION purge_quotation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soft_delete_quotation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION list_deleted_quotations() TO authenticated;
GRANT EXECUTE ON FUNCTION restore_quotation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION purge_quotation(UUID) TO authenticated;


-- END 057_quotation_recycle_bin.sql

-- ############################################################################
-- BEGIN 058_settlement_discount.sql
-- ############################################################################

-- Accounts settlement discount: amount waived after the Won confirmation
-- (e.g. confirmed 1,85,000, customer paid 1,84,000 after a 1,000 discount).
-- Pending = planned − verified − discount (discount comes off Final, then
-- Pre-dispatch, then Token). leads_update already allows verify_payment.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS settlement_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS settlement_discount_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_discount_at TIMESTAMPTZ;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_settlement_discount_nonneg;
ALTER TABLE leads
  ADD CONSTRAINT leads_settlement_discount_nonneg CHECK (settlement_discount_amount >= 0);


-- END 058_settlement_discount.sql

-- ############################################################################
-- BEGIN 059_accounts_role_customer_rls.sql
-- ############################################################################

-- Accounts staff often have profiles.role = 'accounts' without explicit
-- user_authorities rows. has_authority('verify_payment') was false, so
-- leads_select / payments_select returned nothing (empty Customers, no alerts).

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_accounts_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'accounts'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

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
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
      OR (
        is_accounts_staff()
        AND sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
      )
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
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
      OR has_authority('verify_payment')
      OR has_authority('full_access')
      OR is_accounts_staff()
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );

DROP POLICY IF EXISTS payments_select ON payments;
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
      OR is_accounts_staff()
    )
  );

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('record_payment')
      OR has_authority('verify_payment')
      OR has_authority('full_access')
      OR is_accounts_staff()
    )
  );


-- END 059_accounts_role_customer_rls.sql

-- ############################################################################
-- BEGIN 060_proofs_no_file_size_limit.sql
-- ############################################################################

-- Remove 10 MB ceiling on the proofs bucket so install photos/videos
-- are not rejected by storage after the app stopped enforcing MB caps.
-- Duration limits for videos remain in application code.

UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'proofs';


-- END 060_proofs_no_file_size_limit.sql

-- ############################################################################
-- BEGIN 061_grievance_meter_install_category.sql
-- ############################################################################

-- Add Meter Install to grievance category dropdown.

ALTER TABLE grievances
  DROP CONSTRAINT IF EXISTS grievances_category_check;

ALTER TABLE grievances
  ADD CONSTRAINT grievances_category_check
  CHECK (category IN (
    'hr',
    'operations',
    'payroll',
    'facilities',
    'it',
    'compliance',
    'meter_install',
    'other'
  ));


-- END 061_grievance_meter_install_category.sql

-- ############################################################################
-- BEGIN 062_sales_assigned_only_leads.sql
-- ############################################################################

-- Sales must only see assigned / own leads & customers.
-- Root causes:
--   1) leads_select granted company-wide SELECT via record_payment (Sales has it).
--   2) App canSeeAllCustomers treated upload_feasibility_report as company-wide
--      (Sales Manager is seeded with that key for historical reasons).
-- Fix: assignee-only for sales; Accounts/liaison/verify/docs lanes keep customer-wide.

-- 1) Role defaults: only admin keeps view_all_leads
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND COALESCE(r.slug, '') <> 'admin';

-- 2) Sales roles must not carry docs-lane keys that unlock every customer file
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'upload_feasibility_report'
  AND COALESCE(r.slug, '') IN ('sales_manager', 'sales_executive', 'tele_caller', 'surveyor');

-- 3) leads_select: assignees + admin/full/view_all + accounts/liaison roles
--    + payment verify / liaison / docs authorities on customer stages only.
--    record_payment / view_payment_queues alone do NOT unlock all leads.

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_accounts_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'accounts'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_liaison_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'liaison'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

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
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          is_accounts_staff()
          OR is_liaison_staff()
          OR has_authority('verify_payment')
          OR has_authority('verify_subsidy')
          OR has_authority('manage_liaison')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
          OR has_authority('upload_feasibility_report')
        )
      )
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
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
      OR is_accounts_staff()
      OR has_authority('verify_payment')
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          is_liaison_staff()
          OR has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );


-- END 062_sales_assigned_only_leads.sql

-- ############################################################################
-- BEGIN 063_role_assignment_pools.sql
-- ############################################################################

-- Which Team roles appear in assignment pickers (Field surveyor, Tele-caller,
-- Installation crew, Dealer, Service engineer). Custom roles can opt in.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS assignment_pools text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN roles.assignment_pools IS
  'Picker pools this role appears in: telecaller, surveyor, installation_crew, dealer, service_engineer';

-- Seed system roles to match prior hardcoded filters (telecaller newly constrained)
UPDATE roles
SET assignment_pools = ARRAY['telecaller', 'surveyor', 'service_engineer']
WHERE slug = 'admin';

UPDATE roles
SET assignment_pools = ARRAY['telecaller', 'surveyor']
WHERE slug = 'sales_manager';

UPDATE roles
SET assignment_pools = ARRAY['telecaller']
WHERE slug IN ('tele_caller', 'sales_executive');

UPDATE roles
SET assignment_pools = ARRAY['surveyor']
WHERE slug = 'surveyor';

UPDATE roles
SET assignment_pools = ARRAY['installation_crew']
WHERE slug = 'installation_crew';

UPDATE roles
SET assignment_pools = ARRAY['dealer']
WHERE slug = 'dealer';

UPDATE roles
SET assignment_pools = ARRAY['service_engineer']
WHERE slug IN ('service_engineer', 'service_supervisor');


-- END 063_role_assignment_pools.sql

-- ############################################################################
-- BEGIN 064_view_all_quotations.sql
-- ############################################################################

-- Quotes list: company-wide only with view_all_quotations
-- (else assigned leads + quotes the user created). Mirrors assigned-only leads.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'view_all_quotations',
  'View All Quotations',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

-- Admin + Accounts (company-wide money/quotes). Sales roles stay assigned-only.
INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_all_quotations', true
FROM roles r
WHERE COALESCE(r.slug, '') IN ('admin', 'accounts')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;


-- END 064_view_all_quotations.sql

-- ############################################################################
-- BEGIN 065_view_sales_rep_report.sql
-- ############################################################################

-- Sales rep monthly report page (/reports/sales-reps).

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'view_sales_rep_report',
  'Sales Rep Monthly Report',
  'general'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_sales_rep_report', true
FROM roles r
WHERE COALESCE(r.slug, '') IN ('admin', 'sales_manager')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;


-- END 065_view_sales_rep_report.sql

-- ############################################################################
-- BEGIN 066_dealer_leads_quotations_scope.sql
-- ############################################################################

-- Dealers: leads via dealer_id / created_by; quotations ownership-scoped.
-- Fixes quotations_select granting every company quote to view_quotations
-- (dealers are seeded with that key) and leads_select omitting dealer_id.

-- Strip company-wide keys from Dealer role if ever granted
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND COALESCE(r.slug, '') = 'dealer'
  AND ra.authority_key IN (
    'view_all_leads',
    'view_all_quotations',
    'full_access',
    'manage_quotations'
  );

-- ------------------------------------------------------------
-- Leads: include dealer_id ownership
-- ------------------------------------------------------------
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
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          is_accounts_staff()
          OR is_liaison_staff()
          OR has_authority('verify_payment')
          OR has_authority('verify_subsidy')
          OR has_authority('manage_liaison')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
          OR has_authority('upload_feasibility_report')
        )
      )
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
      OR is_accounts_staff()
      OR has_authority('verify_payment')
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          is_liaison_staff()
          OR has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );

-- ------------------------------------------------------------
-- Quotations: company-wide only with view_all_quotations / full_access.
-- Otherwise: created_by me OR lead I own (incl. dealer_id).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_select ON quotations;
CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND deleted_at IS NULL
    AND (
      has_authority('full_access')
      OR has_authority('view_all_quotations')
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = quotations.lead_id
          AND l.company_id = quotations.company_id
          AND (
            l.assigned_to = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_surveyor_id = auth.uid()
            OR l.assigned_crew_id = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );


-- END 066_dealer_leads_quotations_scope.sql

-- ############################################################################
-- BEGIN 067_purge_lead_completely.sql
-- ############################################################################

-- Complete lead wipe for Admin / delete_leads (demo + test files through
-- survey / install). Cascades children; hard-deletes related quotations.

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'demo';

CREATE OR REPLACE FUNCTION purge_lead_completely(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_name TEXT;
  v_stage TEXT;
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT has_authority('delete_leads') THEN
    RAISE EXCEPTION 'Missing authority: delete_leads';
  END IF;

  SELECT name, sales_stage::text
    INTO v_name, v_stage
  FROM leads
  WHERE id = p_lead_id
    AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Break quote ↔ lead links first
  UPDATE leads
  SET accepted_quotation_id = NULL
  WHERE id = p_lead_id
    AND company_id = v_company;

  UPDATE payments
  SET quotation_id = NULL
  WHERE lead_id = p_lead_id
    AND company_id = v_company;

  -- Remove quotations for this lead (incl. soft-deleted bin rows)
  DELETE FROM quotations
  WHERE company_id = v_company
    AND lead_id = p_lead_id;

  INSERT INTO audit_events (
    company_id, lead_id, actor_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    v_company,
    p_lead_id,
    auth.uid(),
    'lead_purged',
    'lead',
    p_lead_id,
    jsonb_build_object('name', v_name, 'sales_stage', v_stage)
  );

  DELETE FROM leads
  WHERE id = p_lead_id
    AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  RETURN p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION purge_lead_completely(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_lead_completely(UUID) TO authenticated;

-- Keep DELETE policy aligned (admin already passes has_authority)
DROP POLICY IF EXISTS leads_delete ON leads;
CREATE POLICY leads_delete ON leads FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('delete_leads')
      OR has_authority('full_access')
    )
  );


-- END 067_purge_lead_completely.sql

-- ############################################################################
-- BEGIN 068_dealer_rbac_hard_scope.sql
-- ############################################################################

-- Dealer RBAC hard scope: dealers ONLY see leads/quotes they created or
-- own via dealer_id. Company-wide keys (view_all_*, full_access) never unlock
-- other tenants' files for role = dealer — even if Team Permissions granted them.
-- Idempotent re-assert of 066 + stricter exclusion.

-- ------------------------------------------------------------
-- Strip company-wide grants from Dealer role + dealer users
-- ------------------------------------------------------------
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND COALESCE(r.slug, '') = 'dealer'
  AND ra.authority_key IN (
    'view_all_leads',
    'view_all_quotations',
    'full_access',
    'manage_quotations'
  );

DELETE FROM user_authorities ua
USING profiles p
WHERE ua.user_id = p.id
  AND p.role::text = 'dealer'
  AND ua.authority_key IN (
    'view_all_leads',
    'view_all_quotations',
    'full_access',
    'manage_quotations'
  );

-- ------------------------------------------------------------
-- Helper: active dealer session
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_dealer_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.role::text = 'dealer'
  );
$$;

REVOKE ALL ON FUNCTION is_dealer_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_dealer_user() TO authenticated;

-- ------------------------------------------------------------
-- Leads SELECT / UPDATE
-- Dealers: created_by OR dealer_id only.
-- Everyone else: prior 066 ownership + company-wide / ops lanes.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      (
        is_dealer_user()
        AND (
          created_by = auth.uid()
          OR dealer_id = auth.uid()
        )
      )
      OR (
        NOT is_dealer_user()
        AND (
          assigned_to = auth.uid()
          OR assigned_telecaller_id = auth.uid()
          OR assigned_surveyor_id = auth.uid()
          OR assigned_crew_id = auth.uid()
          OR created_by = auth.uid()
          OR dealer_id = auth.uid()
          OR has_authority('view_all_leads')
          OR has_authority('full_access')
          OR (
            sales_stage IN (
              'quote_accepted',
              'token_pending_verification',
              'token_verified_and_feasibility_ok',
              'pre_dispatch_pending_verification',
              'pre_dispatch_verified',
              'installation_assigned',
              'installation_in_progress',
              'installation_completed',
              'final_pending_verification',
              'final_verified',
              'liaison_in_progress',
              'meter_installed',
              'subsidy_pending',
              'subsidy_received_pending_accounts',
              'completed'
            )
            AND (
              is_accounts_staff()
              OR is_liaison_staff()
              OR has_authority('verify_payment')
              OR has_authority('verify_subsidy')
              OR has_authority('manage_liaison')
              OR has_authority('mark_meter_installed')
              OR has_authority('mark_subsidy_received')
              OR has_authority('upload_feasibility_report')
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      (
        is_dealer_user()
        AND (
          created_by = auth.uid()
          OR dealer_id = auth.uid()
        )
      )
      OR (
        NOT is_dealer_user()
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
          OR is_accounts_staff()
          OR has_authority('verify_payment')
          OR (
            sales_stage IN (
              'quote_accepted',
              'token_pending_verification',
              'token_verified_and_feasibility_ok',
              'pre_dispatch_pending_verification',
              'pre_dispatch_verified',
              'installation_assigned',
              'installation_in_progress',
              'installation_completed',
              'final_pending_verification',
              'final_verified',
              'liaison_in_progress',
              'meter_installed',
              'subsidy_pending',
              'subsidy_received_pending_accounts',
              'completed'
            )
            AND (
              is_liaison_staff()
              OR has_authority('manage_liaison')
              OR has_authority('upload_feasibility_report')
              OR has_authority('mark_meter_installed')
              OR has_authority('mark_subsidy_received')
            )
          )
        )
      )
    )
  );

-- ------------------------------------------------------------
-- Quotations SELECT: dealers only own creates + owned leads
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_select ON quotations;
CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND deleted_at IS NULL
    AND (
      (
        is_dealer_user()
        AND (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM leads l
            WHERE l.id = quotations.lead_id
              AND l.company_id = quotations.company_id
              AND (
                l.created_by = auth.uid()
                OR l.dealer_id = auth.uid()
              )
          )
        )
      )
      OR (
        NOT is_dealer_user()
        AND (
          has_authority('full_access')
          OR has_authority('view_all_quotations')
          OR created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM leads l
            WHERE l.id = quotations.lead_id
              AND l.company_id = quotations.company_id
              AND (
                l.assigned_to = auth.uid()
                OR l.assigned_telecaller_id = auth.uid()
                OR l.assigned_surveyor_id = auth.uid()
                OR l.assigned_crew_id = auth.uid()
                OR l.created_by = auth.uid()
                OR l.dealer_id = auth.uid()
              )
          )
        )
      )
    )
  );


-- END 068_dealer_rbac_hard_scope.sql

-- ############################################################################
-- BEGIN 069_view_dealer_monthly_report.sql
-- ############################################################################

-- Dealer monthly report (/reports/dealers): leads & files by external dealer.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'view_dealer_monthly_report',
  'Dealer Monthly Report',
  'general'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_dealer_monthly_report', true
FROM roles r
WHERE COALESCE(r.slug, '') IN ('admin', 'sales_manager', 'accounts')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;


-- END 069_view_dealer_monthly_report.sql

-- ############################################################################
-- BEGIN 070_survey_assignee_capture.sql
-- ############################################################################

-- Digital survey: assignees / lead owners can capture, not only conduct_survey holders.
-- Matches product: anyone who can see or is assigned the lead can open the digital form.

DROP POLICY IF EXISTS surveys_insert ON surveys;
CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('conduct_survey')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = surveys.lead_id
          AND l.company_id = surveys.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );

DROP POLICY IF EXISTS surveys_update ON surveys;
CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('conduct_survey')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = surveys.lead_id
          AND l.company_id = surveys.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );

-- Survey site photos: lead owners can write without conduct_survey / move_lead_stage
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
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = portal_documents.lead_id
          AND l.company_id = portal_documents.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
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
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = portal_documents.lead_id
          AND l.company_id = portal_documents.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );


-- END 070_survey_assignee_capture.sql

-- ############################################################################
-- BEGIN 071_grievance_meter_install_and_raise_fix.sql
-- ############################################################################




-- END 071_grievance_meter_install_and_raise_fix.sql

-- ############################################################################
-- BEGIN 072_quotation_number_allocate.sql
-- ############################################################################




-- END 072_quotation_number_allocate.sql

-- ############################################################################
-- BEGIN 073_inventory_core.sql
-- ############################################################################

-- ============================================================
-- 048_inventory_core.sql  (RK Solar inventory port from Sumeru)
-- Inventory + serial tracking: enums, tables, helpers, views, RLS.
-- Stock tables have no write policies: all stock changes go through
-- the SECURITY DEFINER RPCs in 049_inventory_rpcs.sql.
-- Plan: docs/plan-inventory-serials-2026.md
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE inventory_unit AS ENUM ('nos', 'kg', 'm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_movement_type AS ENUM (
    'inward', 'dispatch', 'return', 'service_issue', 'adjustment', 'reversal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE serial_status AS ENUM ('in_stock', 'dispatched', 'defective', 'scrapped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE serial_scan_mode AS ENUM ('whole', 'extract');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_return_condition AS ENUM ('good', 'defective');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Trim, drop control characters and inner whitespace, uppercase.
CREATE OR REPLACE FUNCTION normalize_serial(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(
    upper(regexp_replace(regexp_replace(COALESCE(p_value, ''), '[[:cntrl:]]', '', 'g'), '\s+', '', 'g')),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION is_company_admin_grantor()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
$$;

-- Pricing access is role-based only: Owner, or a role the Owner granted the key to.
-- Deliberately ignores user_authorities, full_access and the has_authority enum fallback.
CREATE OR REPLACE FUNCTION role_grants_purchase_cost(p_role_id UUID, p_manage_only BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_role_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM role_authorities ra
    WHERE ra.role_id = p_role_id
      AND ra.granted = true
      AND ra.authority_key = ANY (
        CASE WHEN p_manage_only
          THEN ARRAY['manage_purchase_cost']
          ELSE ARRAY['view_purchase_cost', 'manage_purchase_cost']
        END
      )
  )
$$;

CREATE OR REPLACE FUNCTION can_view_purchase_cost()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_company_admin_grantor() OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND role_grants_purchase_cost(p.role_id, false)
  )
$$;

CREATE OR REPLACE FUNCTION can_manage_purchase_cost()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_company_admin_grantor() OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND role_grants_purchase_cost(p.role_id, true)
  )
$$;

-- ------------------------------------------------------------
-- Item master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(80),
  category_id UUID REFERENCES quote_item_categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES quote_brands(id) ON DELETE SET NULL,
  quote_item_id UUID REFERENCES quote_items(id) ON DELETE SET NULL,
  unit_type inventory_unit NOT NULL DEFAULT 'nos',
  track_serials BOOLEAN NOT NULL DEFAULT false,
  serial_mode serial_scan_mode NOT NULL DEFAULT 'whole',
  serial_pattern TEXT,
  low_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_items_serial_unit CHECK (NOT track_serials OR unit_type = 'nos'),
  CONSTRAINT inventory_items_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_name_uq
  ON inventory_items (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_sku_uq
  ON inventory_items (company_id, lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_company_idx
  ON inventory_items (company_id, is_active);

-- ------------------------------------------------------------
-- Movements (one ledger for every stock change)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movement_counters (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, movement_type, year)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  movement_no VARCHAR(40) NOT NULL,
  is_opening_stock BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID REFERENCES leads(id) ON DELETE RESTRICT,
  ticket_id UUID REFERENCES service_tickets(id) ON DELETE SET NULL,
  supplier_name VARCHAR(200),
  supplier_invoice_no VARCHAR(100),
  supplier_invoice_date DATE,
  vehicle_no VARCHAR(40),
  delivered_by VARCHAR(120),
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  notes TEXT,
  reverses_id UUID REFERENCES inventory_movements(id) ON DELETE RESTRICT,
  reversed_by_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, movement_no),
  CONSTRAINT inventory_movements_lead_required CHECK (
    movement_type NOT IN ('dispatch', 'return', 'service_issue') OR lead_id IS NOT NULL
  ),
  CONSTRAINT inventory_movements_reversal_link CHECK (
    (movement_type = 'reversal') = (reverses_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS inventory_movements_company_date_idx
  ON inventory_movements (company_id, movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_lead_idx
  ON inventory_movements (company_id, lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  -- Signed: + inward/return, - dispatch/service. Serial items: +/- number of serials.
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  -- Return lines (and their reversals). Defective bulk returns do not count as stock.
  return_condition inventory_return_condition,
  -- Serial adjustments: scrap / defective / restore.
  serial_action VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movement_lines_movement_idx
  ON inventory_movement_lines (movement_id);
CREATE INDEX IF NOT EXISTS inventory_movement_lines_item_idx
  ON inventory_movement_lines (company_id, item_id);

-- ------------------------------------------------------------
-- Serials (one row per physical unit)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  serial_no VARCHAR(120) NOT NULL,
  status serial_status NOT NULL DEFAULT 'in_stock',
  current_lead_id UUID REFERENCES leads(id) ON DELETE RESTRICT,
  inward_line_id UUID REFERENCES inventory_movement_lines(id) ON DELETE SET NULL,
  raw_scan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, serial_no),
  CONSTRAINT inventory_serials_normalized CHECK (serial_no = normalize_serial(serial_no)),
  CONSTRAINT inventory_serials_lead_when_dispatched CHECK (
    (status = 'dispatched') = (current_lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS inventory_serials_item_status_idx
  ON inventory_serials (item_id, status);
CREATE INDEX IF NOT EXISTS inventory_serials_lead_idx
  ON inventory_serials (current_lead_id) WHERE current_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movement_line_serials (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES inventory_movement_lines(id) ON DELETE CASCADE,
  serial_id UUID NOT NULL REFERENCES inventory_serials(id) ON DELETE RESTRICT,
  PRIMARY KEY (line_id, serial_id)
);

CREATE INDEX IF NOT EXISTS inventory_movement_line_serials_serial_idx
  ON inventory_movement_line_serials (serial_id);

-- ------------------------------------------------------------
-- Purchase cost (view_purchase_cost / manage_purchase_cost only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_item_costs (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  default_unit_cost NUMERIC(14,2) CHECK (default_unit_cost IS NULL OR default_unit_cost >= 0),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_inward_costs (
  line_id UUID PRIMARY KEY REFERENCES inventory_movement_lines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  gst_percent NUMERIC(5,2) CHECK (gst_percent IS NULL OR (gst_percent >= 0 AND gst_percent <= 100)),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Item write rules: serial tracking follows the category
-- (Panel / Inverter only), same-company references, and the
-- serial/bulk type and unit are frozen once stock exists.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO v_category_name
    FROM quote_item_categories
    WHERE id = NEW.category_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found.';
    END IF;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Brand not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  NEW.track_serials := COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
  IF NEW.track_serials THEN
    NEW.unit_type := 'nos';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.track_serials IS DISTINCT FROM OLD.track_serials OR NEW.unit_type IS DISTINCT FROM OLD.unit_type)
     AND EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = NEW.id)
  THEN
    RAISE EXCEPTION 'This item already has stock entries, so its type (serial or bulk) and unit cannot change.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_before_write ON inventory_items;
CREATE TRIGGER inventory_items_before_write
  BEFORE INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION inventory_items_before_write();

DROP TRIGGER IF EXISTS inventory_serials_updated_at ON inventory_serials;
CREATE TRIGGER inventory_serials_updated_at
  BEFORE UPDATE ON inventory_serials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- Stock helpers (used by RPCs)
-- ------------------------------------------------------------

-- Bulk on-hand: all lines except defective returns (and their reversals).
CREATE OR REPLACE FUNCTION inventory_bulk_on_hand(p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(quantity_delta) FILTER (WHERE return_condition IS DISTINCT FROM 'defective'), 0)
  FROM inventory_movement_lines
  WHERE item_id = p_item_id
$$;

-- Used at a customer = dispatched - returned, ignoring reversed movements.
CREATE OR REPLACE FUNCTION inventory_customer_used(p_lead_id UUID, p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(-SUM(ml.quantity_delta), 0)
  FROM inventory_movements m
  JOIN inventory_movement_lines ml ON ml.movement_id = m.id
  WHERE m.lead_id = p_lead_id
    AND ml.item_id = p_item_id
    AND m.movement_type IN ('dispatch', 'service_issue', 'return')
    AND m.reversed_by_id IS NULL
$$;

-- ------------------------------------------------------------
-- Views (security_invoker: caller's RLS applies)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW inventory_stock_on_hand
WITH (security_invoker = true) AS
SELECT
  x.*,
  (x.on_hand <= 0) AS is_out,
  (x.on_hand > 0 AND x.low_stock_threshold > 0 AND x.on_hand <= x.low_stock_threshold) AS is_low
FROM (
  SELECT
    i.id AS item_id,
    i.company_id,
    i.name,
    i.sku,
    i.category_id,
    i.brand_id,
    i.unit_type,
    i.track_serials,
    i.low_stock_threshold,
    i.image_path,
    i.is_active,
    COALESCE(CASE WHEN i.track_serials THEN s.in_stock ELSE b.qty END, 0)::NUMERIC(14,3) AS on_hand,
    COALESCE(s.dispatched, 0) AS serials_dispatched,
    COALESCE(s.defective, 0) AS serials_defective
  FROM inventory_items i
  LEFT JOIN LATERAL (
    SELECT SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS qty
    FROM inventory_movement_lines ml
    WHERE ml.item_id = i.id
  ) b ON NOT i.track_serials
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE st.status = 'in_stock') AS in_stock,
      COUNT(*) FILTER (WHERE st.status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE st.status = 'defective') AS defective
    FROM inventory_serials st
    WHERE st.item_id = i.id
  ) s ON i.track_serials
) x;

CREATE OR REPLACE VIEW inventory_customer_material
WITH (security_invoker = true) AS
SELECT
  m.company_id,
  m.lead_id,
  ml.item_id,
  SUM(CASE WHEN m.movement_type IN ('dispatch', 'service_issue') THEN -ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS dispatched,
  SUM(CASE WHEN m.movement_type = 'return' THEN ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS returned,
  (-SUM(ml.quantity_delta))::NUMERIC(14,3) AS used,
  MAX(m.movement_date) AS last_movement_date
FROM inventory_movements m
JOIN inventory_movement_lines ml ON ml.movement_id = m.id
WHERE m.lead_id IS NOT NULL
  AND m.movement_type IN ('dispatch', 'service_issue', 'return')
  AND m.reversed_by_id IS NULL
GROUP BY m.company_id, m.lead_id, ml.item_id;

-- Serial items: sum of the inward cost of each in-stock unit.
-- Bulk items: on-hand x weighted average inward cost (fallback: default cost).
CREATE OR REPLACE VIEW inventory_stock_value
WITH (security_invoker = true) AS
SELECT
  oh.company_id,
  oh.item_id,
  oh.on_hand,
  CASE
    WHEN oh.track_serials THEN sv.total_value
    ELSE oh.on_hand * COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(16,2) AS stock_value,
  CASE
    WHEN oh.track_serials THEN CASE WHEN oh.on_hand > 0 THEN sv.total_value / oh.on_hand END
    ELSE COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(14,2) AS unit_cost,
  CASE
    WHEN oh.track_serials THEN COALESCE(sv.missing_cost, 0)
    ELSE CASE WHEN oh.on_hand > 0 AND avgc.avg_cost IS NULL AND ic.default_unit_cost IS NULL THEN 1 ELSE 0 END
  END AS missing_cost_count
FROM inventory_stock_on_hand oh
LEFT JOIN inventory_item_costs ic ON ic.item_id = oh.item_id
LEFT JOIN LATERAL (
  SELECT SUM(ml.quantity_delta * c.unit_cost) / NULLIF(SUM(ml.quantity_delta), 0) AS avg_cost
  FROM inventory_movement_lines ml
  JOIN inventory_movements m ON m.id = ml.movement_id
  JOIN inventory_inward_costs c ON c.line_id = ml.id
  WHERE ml.item_id = oh.item_id
    AND m.movement_type = 'inward'
    AND m.reversed_by_id IS NULL
) avgc ON NOT oh.track_serials
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(c.unit_cost, ic.default_unit_cost, 0)) AS total_value,
    COUNT(*) FILTER (WHERE c.unit_cost IS NULL AND ic.default_unit_cost IS NULL) AS missing_cost
  FROM inventory_serials s
  LEFT JOIN inventory_inward_costs c ON c.line_id = s.inward_line_id
  WHERE s.item_id = oh.item_id
    AND s.status = 'in_stock'
) sv ON oh.track_serials
WHERE can_view_purchase_cost();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_line_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_inward_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_select ON inventory_items;
CREATE POLICY inventory_items_select ON inventory_items FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('view_inventory') OR has_authority('manage_inventory_items'))
  );

DROP POLICY IF EXISTS inventory_items_insert ON inventory_items;
CREATE POLICY inventory_items_insert ON inventory_items FOR INSERT
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  );

DROP POLICY IF EXISTS inventory_items_update ON inventory_items;
CREATE POLICY inventory_items_update ON inventory_items FOR UPDATE
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  );

DROP POLICY IF EXISTS inventory_movements_select ON inventory_movements;
CREATE POLICY inventory_movements_select ON inventory_movements FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_movement_lines_select ON inventory_movement_lines;
CREATE POLICY inventory_movement_lines_select ON inventory_movement_lines FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_serials_select ON inventory_serials;
CREATE POLICY inventory_serials_select ON inventory_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_movement_line_serials_select ON inventory_movement_line_serials;
CREATE POLICY inventory_movement_line_serials_select ON inventory_movement_line_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

-- inventory_movement_counters: no policies (RPC only).

DROP POLICY IF EXISTS inventory_item_costs_select ON inventory_item_costs;
CREATE POLICY inventory_item_costs_select ON inventory_item_costs FOR SELECT
  USING (company_id = auth_company_id() AND can_view_purchase_cost());

DROP POLICY IF EXISTS inventory_item_costs_insert ON inventory_item_costs;
CREATE POLICY inventory_item_costs_insert ON inventory_item_costs FOR INSERT
  WITH CHECK (
    company_id = auth_company_id() AND can_manage_purchase_cost()
    AND EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = item_id AND i.company_id = auth_company_id())
  );

DROP POLICY IF EXISTS inventory_item_costs_update ON inventory_item_costs;
CREATE POLICY inventory_item_costs_update ON inventory_item_costs FOR UPDATE
  USING (company_id = auth_company_id() AND can_manage_purchase_cost())
  WITH CHECK (company_id = auth_company_id() AND can_manage_purchase_cost());

DROP POLICY IF EXISTS inventory_item_costs_delete ON inventory_item_costs;
CREATE POLICY inventory_item_costs_delete ON inventory_item_costs FOR DELETE
  USING (company_id = auth_company_id() AND can_manage_purchase_cost());

DROP POLICY IF EXISTS inventory_inward_costs_select ON inventory_inward_costs;
CREATE POLICY inventory_inward_costs_select ON inventory_inward_costs FOR SELECT
  USING (company_id = auth_company_id() AND can_view_purchase_cost());

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE ALL ON inventory_stock_on_hand, inventory_customer_material, inventory_stock_value FROM anon;
GRANT SELECT ON inventory_stock_on_hand, inventory_customer_material, inventory_stock_value TO authenticated;

REVOKE ALL ON FUNCTION inventory_bulk_on_hand(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_customer_used(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION role_grants_purchase_cost(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_company_admin_grantor() TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_purchase_cost() TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_purchase_cost() TO authenticated;


-- END 073_inventory_core.sql

-- ############################################################################
-- BEGIN 074_inventory_rpcs.sql
-- ############################################################################

-- ============================================================
-- 049_inventory_rpcs.sql  (RK Solar inventory port from Sumeru)
-- Atomic stock RPCs. Each call validates, locks and writes in one
-- transaction; any error rolls the whole call back.
-- SECURITY DEFINER bypasses RLS, so every query filters company_id.
-- Requires 048_inventory_core.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory__require(p_key TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Your account is not linked to a company.' USING ERRCODE = '42501';
  END IF;
  IF NOT has_authority(p_key) THEN
    RAISE EXCEPTION 'You do not have permission for this (%).', p_key USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION inventory__serial_text(p_entry JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT normalize_serial(
    CASE jsonb_typeof(p_entry)
      WHEN 'string' THEN p_entry #>> '{}'
      WHEN 'object' THEN p_entry ->> 'serial_no'
      ELSE NULL
    END
  )
$$;

CREATE OR REPLACE FUNCTION inventory__serial_raw(p_entry JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p_entry) = 'object' THEN NULLIF(p_entry ->> 'raw_scan', '') END
$$;

-- Normalized serials of one payload line, in order.
CREATE OR REPLACE FUNCTION inventory__line_serials(p_line JSONB)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(inventory__serial_text(e) ORDER BY ord), '{}')
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_line -> 'serials') = 'array' THEN p_line -> 'serials' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS t(e, ord)
$$;

CREATE OR REPLACE FUNCTION inventory__next_no(p_company UUID, p_type inventory_movement_type)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
  v_no INT;
  v_prefix TEXT;
BEGIN
  INSERT INTO inventory_movement_counters (company_id, movement_type, year, last_no)
  VALUES (p_company, p_type, v_year, 1)
  ON CONFLICT (company_id, movement_type, year)
  DO UPDATE SET last_no = inventory_movement_counters.last_no + 1
  RETURNING last_no INTO v_no;

  v_prefix := CASE p_type
    WHEN 'inward' THEN 'IN'
    WHEN 'dispatch' THEN 'DC'
    WHEN 'return' THEN 'RT'
    WHEN 'service_issue' THEN 'SV'
    WHEN 'adjustment' THEN 'ADJ'
    ELSE 'RV'
  END;
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_no::TEXT, GREATEST(4, length(v_no::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION inventory__lines(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_payload IS NULL
     OR jsonb_typeof(p_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'lines') = 0
  THEN
    RAISE EXCEPTION 'Add at least one item.';
  END IF;
  RETURN p_payload -> 'lines';
END;
$$;

CREATE OR REPLACE FUNCTION inventory__audit(
  p_company UUID, p_lead UUID, p_event TEXT, p_entity UUID, p_meta JSONB
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_events (company_id, lead_id, actor_id, event_type, entity_type, entity_id, metadata)
  VALUES (p_company, p_lead, auth.uid(), p_event, 'inventory_movement', p_entity, COALESCE(p_meta, '{}'::jsonb))
$$;

-- Lock the item rows referenced by a payload (id order avoids deadlocks).
CREATE OR REPLACE FUNCTION inventory__lock_items(p_company UUID, p_lines JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM inventory_items
  WHERE company_id = p_company
    AND id IN (
      SELECT (l ->> 'item_id')::UUID FROM jsonb_array_elements(p_lines) l WHERE l ? 'item_id'
    )
  ORDER BY id
  FOR UPDATE;
END;
$$;

-- Shared inward writer (inward RPC + opening stock import).
-- Validates everything first, then writes set-based.
CREATE OR REPLACE FUNCTION inventory__post_inward(
  p_company UUID, p_header JSONB, p_lines JSONB, p_opening BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_cost NUMERIC;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_can_cost BOOLEAN := can_manage_purchase_cost();
  v_serial_count INT := 0;
BEGIN
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = p_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is inactive.', v_item.name;
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Serial numbers are required for % (one per unit).', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;
      IF NULLIF(v_line ->> 'quantity', '') IS NOT NULL
         AND (v_line ->> 'quantity')::NUMERIC <> cardinality(v_serials) THEN
        RAISE EXCEPTION '%: quantity % does not match % serial numbers.',
          v_item.name, v_line ->> 'quantity', cardinality(v_serials);
      END IF;
      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
    END IF;

    v_cost := NULLIF(v_line ->> 'unit_cost', '')::NUMERIC;
    IF v_cost IS NOT NULL AND v_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost cannot be negative (%).', v_item.name;
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  SELECT serial_no INTO v_dup FROM inventory_serials
  WHERE company_id = p_company AND serial_no = ANY (v_all_serials) LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is already in inventory.', v_dup;
  END IF;

  v_no := inventory__next_no(p_company, 'inward');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, is_opening_stock,
    supplier_name, supplier_invoice_no, supplier_invoice_date,
    movement_date, notes, created_by
  ) VALUES (
    p_company, 'inward', v_no, COALESCE(p_opening, false),
    NULLIF(btrim(p_header ->> 'supplier_name'), ''),
    NULLIF(btrim(p_header ->> 'supplier_invoice_no'), ''),
    NULLIF(p_header ->> 'supplier_invoice_date', '')::DATE,
    COALESCE(NULLIF(p_header ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(p_header ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
    VALUES (p_company, v_movement_id, v_item.id, v_qty, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_serials (company_id, item_id, serial_no, status, inward_line_id, raw_scan)
      SELECT p_company, v_item.id, inventory__serial_text(e), 'in_stock', v_line_id, inventory__serial_raw(e)
      FROM jsonb_array_elements(v_line -> 'serials') e;

      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT p_company, v_line_id, id FROM inventory_serials WHERE inward_line_id = v_line_id;

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;

    v_cost := NULLIF(v_line ->> 'unit_cost', '')::NUMERIC;
    IF v_can_cost AND v_cost IS NOT NULL THEN
      INSERT INTO inventory_inward_costs (line_id, company_id, unit_cost, gst_percent, created_by)
      VALUES (v_line_id, p_company, v_cost, NULLIF(v_line ->> 'gst_percent', '')::NUMERIC, auth.uid());
    END IF;
  END LOOP;

  PERFORM inventory__audit(p_company, NULL,
    CASE WHEN p_opening THEN 'inventory_opening_stock' ELSE 'inventory_inward' END,
    v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(p_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Public RPCs
-- ------------------------------------------------------------

-- payload: { movement_date?, supplier_name?, supplier_invoice_no?, supplier_invoice_date?, notes?,
--            is_opening_stock?, lines: [{ item_id, quantity?, serials?: [text | {serial_no, raw_scan}],
--            unit_cost?, gst_percent?, notes? }] }
CREATE OR REPLACE FUNCTION inventory_post_inward(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
BEGIN
  RETURN inventory__post_inward(
    v_company, payload, v_lines, COALESCE((payload ->> 'is_opening_stock')::BOOLEAN, false)
  );
END;
$$;

-- payload: { lead_id, movement_date?, vehicle_no?, delivered_by?, notes?,
--            lines: [{ item_id, quantity?, serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_dispatch(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_dispatch');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_on_hand NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
BEGIN
  SELECT * INTO v_lead FROM leads
  WHERE id = NULLIF(payload ->> 'lead_id', '')::UUID AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;
  IF v_lead.sales_stage::TEXT NOT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed') THEN
    RAISE EXCEPTION 'Material can only be dispatched to a customer (Won or Project Completed).';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is inactive.', v_item.name;
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit. Serial numbers are required for dispatch.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;
      IF NULLIF(v_line ->> 'quantity', '') IS NOT NULL
         AND (v_line ->> 'quantity')::NUMERIC <> cardinality(v_serials) THEN
        RAISE EXCEPTION '%: quantity % does not match % serial numbers.',
          v_item.name, v_line ->> 'quantity', cardinality(v_serials);
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (SELECT 1 FROM inventory_serials s WHERE s.company_id = v_company AND s.serial_no = x)
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % is not in inventory. Record it on an inward first.', v_bad.serial_no;
      END IF;

      SELECT s.serial_no, i.name AS item_name INTO v_bad
      FROM inventory_serials s JOIN inventory_items i ON i.id = s.item_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.item_id <> v_item.id
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % belongs to %, not %.', v_bad.serial_no, v_bad.item_name, v_item.name;
      END IF;

      SELECT s.serial_no, s.status, l.name AS lead_name INTO v_bad
      FROM inventory_serials s LEFT JOIN leads l ON l.id = s.current_lead_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.status <> 'in_stock'
      LIMIT 1;
      IF FOUND THEN
        IF v_bad.status = 'dispatched' THEN
          RAISE EXCEPTION 'Serial % is already dispatched to %.', v_bad.serial_no, v_bad.lead_name;
        END IF;
        RAISE EXCEPTION 'Serial % is marked %, so it cannot be dispatched.', v_bad.serial_no, v_bad.status;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_on_hand := inventory_bulk_on_hand(v_total.item_id);
    IF v_on_hand < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'Only % % of % in stock (asked for %).',
        trim_scale(v_on_hand), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'dispatch');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, vehicle_no, delivered_by, movement_date, notes, created_by
  ) VALUES (
    v_company, 'dispatch', v_no, v_lead.id,
    NULLIF(btrim(payload ->> 'vehicle_no'), ''),
    NULLIF(btrim(payload ->> 'delivered_by'), ''),
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
    VALUES (v_company, v_movement_id, v_item.id, -v_qty, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = 'dispatched', current_lead_id = v_lead.id
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead.id, 'inventory_dispatch', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- payload: { lead_id, movement_date?, notes?,
--            lines: [{ item_id, quantity?, condition?: 'good'|'defective', serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_return(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_return');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_condition inventory_return_condition;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_used NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
BEGIN
  SELECT * INTO v_lead FROM leads
  WHERE id = NULLIF(payload ->> 'lead_id', '')::UUID AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;

    IF COALESCE(v_line ->> 'condition', 'good') NOT IN ('good', 'defective') THEN
      RAISE EXCEPTION 'Return condition must be good or defective.';
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit being returned.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_serials s
        WHERE s.company_id = v_company AND s.serial_no = x AND s.item_id = v_item.id
          AND s.status = 'dispatched' AND s.current_lead_id = v_lead.id
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) is not at this customer.', v_bad.serial_no, v_item.name;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_used := inventory_customer_used(v_lead.id, v_total.item_id);
    IF v_used < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'This customer has only % % of % (asked to return %).',
        trim_scale(v_used), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'return');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, lead_id, movement_date, notes, created_by)
  VALUES (
    v_company, 'return', v_no, v_lead.id,
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_condition := COALESCE(v_line ->> 'condition', 'good')::inventory_return_condition;
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, return_condition, notes)
    VALUES (v_company, v_movement_id, v_item.id, v_qty, v_condition, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = CASE WHEN v_condition = 'good' THEN 'in_stock'::serial_status ELSE 'defective'::serial_status END,
          current_lead_id = NULL
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead.id, 'inventory_return', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- payload: { reason, movement_date?, notes?,
--            lines: [{ item_id, quantity_delta? (bulk, signed),
--                      serial_action?: 'scrap'|'defective'|'restore', serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_adjustment(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_lines JSONB := inventory__lines(payload);
  v_reason TEXT := NULLIF(btrim(payload ->> 'reason'), '');
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_action TEXT;
  v_allowed serial_status[];
  v_delta NUMERIC;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_on_hand NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required for stock adjustments.';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      v_action := v_line ->> 'serial_action';
      v_allowed := CASE v_action
        WHEN 'scrap' THEN ARRAY['in_stock', 'defective']::serial_status[]
        WHEN 'defective' THEN ARRAY['in_stock']::serial_status[]
        WHEN 'restore' THEN ARRAY['defective', 'scrapped']::serial_status[]
        ELSE NULL
      END;
      IF v_allowed IS NULL THEN
        RAISE EXCEPTION 'Choose scrap, defective or restore for %.', v_item.name;
      END IF;
      IF cardinality(v_serials) = 0 OR array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Scan the serial numbers to adjust for %.', v_item.name;
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_serials s
        WHERE s.company_id = v_company AND s.serial_no = x AND s.item_id = v_item.id AND s.status = ANY (v_allowed)
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) cannot be marked % from its current status.', v_bad.serial_no, v_item.name, v_action;
      END IF;
      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_delta := NULLIF(v_line ->> 'quantity_delta', '')::NUMERIC;
      IF v_delta IS NULL OR v_delta = 0 THEN
        RAISE EXCEPTION 'Enter a quantity to add or remove for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_delta <> trunc(v_delta) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_delta));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_on_hand := inventory_bulk_on_hand(v_total.item_id);
    IF v_on_hand + v_total.qty < 0 THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'Stock of % cannot go below zero (on hand %).', v_item.name, trim_scale(v_on_hand);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'adjustment');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, movement_date, reason, notes, created_by)
  VALUES (
    v_company, 'adjustment', v_no,
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    v_reason, NULLIF(btrim(payload ->> 'notes'), ''), auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);

    IF v_item.track_serials THEN
      v_action := v_line ->> 'serial_action';
      INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, serial_action, notes)
      VALUES (
        v_company, v_movement_id, v_item.id,
        CASE WHEN v_action = 'restore' THEN cardinality(v_serials) ELSE -cardinality(v_serials) END,
        v_action, NULLIF(btrim(v_line ->> 'notes'), '')
      ) RETURNING id INTO v_line_id;

      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = CASE v_action
            WHEN 'scrap' THEN 'scrapped'::serial_status
            WHEN 'defective' THEN 'defective'::serial_status
            ELSE 'in_stock'::serial_status
          END
      WHERE company_id = v_company AND serial_no = ANY (v_serials);
    ELSE
      INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
      VALUES (
        v_company, v_movement_id, v_item.id,
        (v_line ->> 'quantity_delta')::NUMERIC, NULLIF(btrim(v_line ->> 'notes'), '')
      );
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_adjustment', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'reason', v_reason, 'lines', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no);
END;
$$;

-- Undo an inward, dispatch or return by recording a reversal.
-- Blocked when a serial on it has moved since, or when stock would go negative.
CREATE OR REPLACE FUNCTION inventory_reverse_movement(p_movement_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_m inventory_movements%ROWTYPE;
  v_line RECORD;
  v_bad RECORD;
  v_item inventory_items%ROWTYPE;
  v_new_id UUID;
  v_new_line_id UUID;
  v_no TEXT;
  v_removed TEXT[] := '{}';
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse an entry.';
  END IF;

  SELECT * INTO v_m FROM inventory_movements
  WHERE id = p_movement_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;
  IF v_m.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already reversed.', v_m.movement_no;
  END IF;
  IF v_m.movement_type NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Only inward, dispatch and return entries can be reversed. Record an adjustment instead.';
  END IF;

  PERFORM 1 FROM inventory_items
  WHERE id IN (SELECT item_id FROM inventory_movement_lines WHERE movement_id = v_m.id)
  ORDER BY id FOR UPDATE;

  PERFORM 1 FROM inventory_serials
  WHERE id IN (
    SELECT ls.serial_id FROM inventory_movement_line_serials ls
    JOIN inventory_movement_lines ml ON ml.id = ls.line_id
    WHERE ml.movement_id = v_m.id
  )
  ORDER BY id FOR UPDATE;

  -- Every serial on this entry must not have moved since
  -- (later entries that are already reversed, and reversal entries, cancel out).
  SELECT s.serial_no INTO v_bad
  FROM inventory_movement_line_serials ls
  JOIN inventory_movement_lines ml ON ml.id = ls.line_id
  JOIN inventory_serials s ON s.id = ls.serial_id
  WHERE ml.movement_id = v_m.id
    AND EXISTS (
      SELECT 1
      FROM inventory_movement_line_serials ls2
      JOIN inventory_movement_lines ml2 ON ml2.id = ls2.line_id
      JOIN inventory_movements m2 ON m2.id = ml2.movement_id
      WHERE ls2.serial_id = ls.serial_id
        AND m2.id <> v_m.id
        AND m2.created_at > v_m.created_at
        AND m2.reversed_by_id IS NULL
        AND m2.movement_type <> 'reversal'
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Serial % has moved since %. Reverse the later entries first.', v_bad.serial_no, v_m.movement_no;
  END IF;

  -- Bulk stock / customer balance checks.
  FOR v_line IN
    SELECT ml.item_id, SUM(ml.quantity_delta) AS delta,
           SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS stock_delta
    FROM inventory_movement_lines ml
    JOIN inventory_items i ON i.id = ml.item_id
    WHERE ml.movement_id = v_m.id AND NOT i.track_serials
    GROUP BY ml.item_id
  LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = v_line.item_id;
    IF COALESCE(v_line.stock_delta, 0) > 0
       AND inventory_bulk_on_hand(v_line.item_id) - v_line.stock_delta < 0 THEN
      RAISE EXCEPTION 'Not enough % left in stock to reverse %.', v_item.name, v_m.movement_no;
    END IF;
    IF v_m.movement_type = 'dispatch'
       AND inventory_customer_used(v_m.lead_id, v_line.item_id) + v_line.delta < 0 THEN
      RAISE EXCEPTION 'Some % from % was already returned. Reverse the return first.', v_item.name, v_m.movement_no;
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'reversal');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, movement_date, reason, notes, reverses_id, created_by
  ) VALUES (
    v_company, 'reversal', v_no, v_m.lead_id, CURRENT_DATE, v_reason,
    'Reversal of ' || v_m.movement_no, v_m.id, auth.uid()
  ) RETURNING id INTO v_new_id;

  FOR v_line IN SELECT * FROM inventory_movement_lines WHERE movement_id = v_m.id LOOP
    INSERT INTO inventory_movement_lines (
      company_id, movement_id, item_id, quantity_delta, return_condition, serial_action, notes
    ) VALUES (
      v_company, v_new_id, v_line.item_id, -v_line.quantity_delta, v_line.return_condition, v_line.serial_action,
      'Reversal of ' || v_m.movement_no
    ) RETURNING id INTO v_new_line_id;

    IF v_m.movement_type = 'inward' THEN
      -- Undo a wrong inward: free the serial numbers so they can be entered again.
      SELECT v_removed || COALESCE(array_agg(s.serial_no::TEXT), '{}'::TEXT[]) INTO v_removed
      FROM inventory_movement_line_serials ls JOIN inventory_serials s ON s.id = ls.serial_id
      WHERE ls.line_id = v_line.id;

      -- Any later history of these serials is reversed pairs (checked above); drop those links too.
      DELETE FROM inventory_movement_line_serials
      WHERE serial_id IN (SELECT id FROM inventory_serials WHERE inward_line_id = v_line.id);
      DELETE FROM inventory_serials WHERE inward_line_id = v_line.id;
    ELSE
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_new_line_id, ls.serial_id
      FROM inventory_movement_line_serials ls WHERE ls.line_id = v_line.id;

      IF v_m.movement_type = 'dispatch' THEN
        UPDATE inventory_serials SET status = 'in_stock', current_lead_id = NULL
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      ELSE
        UPDATE inventory_serials SET status = 'dispatched', current_lead_id = v_m.lead_id
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      END IF;
    END IF;
  END LOOP;

  UPDATE inventory_movements SET reversed_by_id = v_new_id WHERE id = v_m.id;

  PERFORM inventory__audit(v_company, v_m.lead_id, 'inventory_reversal', v_new_id,
    jsonb_build_object('movement_no', v_no, 'reverses', v_m.movement_no, 'reason', v_reason,
                       'removed_serials', to_jsonb(v_removed)));

  RETURN jsonb_build_object('id', v_new_id, 'movement_no', v_no);
END;
$$;

-- Opening stock from Excel. One transaction for the whole batch.
-- payload: { file_name?, movement_date?,
--            new_items?: [{ key, name, category_id?, brand_id?, sku?, unit_type?, low_stock_threshold?, specifications? }],
--            lines: [{ item_id? | item_key?, quantity?, serials?: [...], unit_cost? }] }
CREATE OR REPLACE FUNCTION inventory_import_opening_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
  v_new JSONB;
  v_map JSONB := '{}'::jsonb;
  v_item_id UUID;
  v_resolved JSONB := '[]'::jsonb;
  v_line JSONB;
  v_group RECORD;
  v_result JSONB;
  v_all_serials TEXT[] := '{}';
  v_dup TEXT;
  v_movements INT := 0;
  v_serials INT := 0;
  v_items_created INT := 0;
  v_header JSONB;
BEGIN
  IF jsonb_typeof(payload -> 'new_items') = 'array' AND jsonb_array_length(payload -> 'new_items') > 0 THEN
    IF NOT has_authority('manage_inventory_items') THEN
      RAISE EXCEPTION 'Creating new items needs the Manage Inventory Items permission.' USING ERRCODE = '42501';
    END IF;
    FOR v_new IN SELECT * FROM jsonb_array_elements(payload -> 'new_items') LOOP
      IF NULLIF(btrim(v_new ->> 'name'), '') IS NULL OR NULLIF(v_new ->> 'key', '') IS NULL THEN
        RAISE EXCEPTION 'Each new item needs a name.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM inventory_items
        WHERE company_id = v_company AND lower(name) = lower(btrim(v_new ->> 'name'))
      ) THEN
        RAISE EXCEPTION 'Item "%" already exists. Map the rows to it instead of creating it.', btrim(v_new ->> 'name');
      END IF;
      INSERT INTO inventory_items (
        company_id, name, sku, category_id, brand_id, unit_type, low_stock_threshold, specifications, created_by
      ) VALUES (
        v_company,
        btrim(v_new ->> 'name'),
        NULLIF(btrim(v_new ->> 'sku'), ''),
        NULLIF(v_new ->> 'category_id', '')::UUID,
        NULLIF(v_new ->> 'brand_id', '')::UUID,
        COALESCE(NULLIF(v_new ->> 'unit_type', ''), 'nos')::inventory_unit,
        COALESCE(NULLIF(v_new ->> 'low_stock_threshold', '')::NUMERIC, 0),
        COALESCE(v_new -> 'specifications', '{}'::jsonb),
        auth.uid()
      ) RETURNING id INTO v_item_id;
      v_map := jsonb_set(v_map, ARRAY[v_new ->> 'key'], to_jsonb(v_item_id::TEXT));
      v_items_created := v_items_created + 1;
    END LOOP;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line ->> 'item_id', '') IS NULL THEN
      IF NOT v_map ? COALESCE(v_line ->> 'item_key', '') THEN
        RAISE EXCEPTION 'A row is not matched to an item.';
      END IF;
      v_line := jsonb_set(v_line, '{item_id}', v_map -> (v_line ->> 'item_key'));
    END IF;
    v_resolved := v_resolved || jsonb_build_array(v_line);
    v_all_serials := v_all_serials || inventory__line_serials(v_line);
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s WHERE s IS NOT NULL GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % appears more than once in the file.', v_dup;
  END IF;

  v_header := jsonb_build_object(
    'supplier_name', 'Opening stock',
    'movement_date', payload ->> 'movement_date',
    'notes', 'Excel import' || COALESCE(': ' || NULLIF(btrim(payload ->> 'file_name'), ''), '')
  );

  FOR v_group IN
    SELECT l ->> 'item_id' AS item_id, jsonb_agg(l) AS lines
    FROM jsonb_array_elements(v_resolved) l
    GROUP BY l ->> 'item_id'
  LOOP
    v_result := inventory__post_inward(v_company, v_header, v_group.lines, true);
    v_movements := v_movements + 1;
    v_serials := v_serials + COALESCE((v_result ->> 'serials')::INT, 0);
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_opening_import', NULL,
    jsonb_build_object('file_name', payload ->> 'file_name', 'movements', v_movements,
                       'serials', v_serials, 'items_created', v_items_created,
                       'rows', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object(
    'movements', v_movements, 'serials', v_serials, 'items_created', v_items_created
  );
END;
$$;

-- Live scan validation for the serial input (read only).
-- p_mode: 'inward' | 'dispatch' | 'return' (return needs p_lead_id).
CREATE OR REPLACE FUNCTION inventory_check_serials(
  p_item_id UUID, p_serials TEXT[], p_mode TEXT, p_lead_id UUID DEFAULT NULL
)
RETURNS TABLE (input TEXT, serial_no TEXT, ok BOOLEAN, message TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('view_inventory');
BEGIN
  IF p_mode NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Unknown check mode.';
  END IF;

  RETURN QUERY
  SELECT
    t.raw,
    normalize_serial(t.raw),
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN false
      WHEN p_mode = 'inward' THEN s.id IS NULL
      WHEN s.id IS NULL THEN false
      WHEN s.item_id <> p_item_id THEN false
      WHEN p_mode = 'dispatch' THEN s.status = 'in_stock'
      ELSE s.status = 'dispatched' AND s.current_lead_id = p_lead_id
    END,
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN 'Empty scan'
      WHEN p_mode = 'inward' AND s.id IS NOT NULL THEN
        'Already in inventory (' || i.name || ', ' || replace(s.status::TEXT, '_', ' ') || ')'
      WHEN p_mode = 'inward' THEN NULL
      WHEN s.id IS NULL THEN 'Not in inventory'
      WHEN s.item_id <> p_item_id THEN 'Belongs to ' || i.name
      WHEN p_mode = 'dispatch' AND s.status = 'dispatched' THEN 'Already dispatched to ' || COALESCE(l.name, 'a customer')
      WHEN p_mode = 'dispatch' AND s.status <> 'in_stock' THEN 'Marked ' || s.status::TEXT
      WHEN p_mode = 'return' AND (s.status <> 'dispatched' OR s.current_lead_id IS DISTINCT FROM p_lead_id) THEN
        'Not at this customer'
      ELSE NULL
    END
  FROM unnest(p_serials) WITH ORDINALITY AS t(raw, ord)
  LEFT JOIN inventory_serials s ON s.company_id = v_company AND s.serial_no = normalize_serial(t.raw)
  LEFT JOIN inventory_items i ON i.id = s.item_id
  LEFT JOIN leads l ON l.id = s.current_lead_id
  ORDER BY t.ord;
END;
$$;

-- ------------------------------------------------------------
-- Grants: public RPCs for signed-in users only; helpers private.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION inventory__require(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__next_no(UUID, inventory_movement_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__audit(UUID, UUID, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__lock_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__post_inward(UUID, JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION inventory_post_inward(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_dispatch(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_return(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_adjustment(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_reverse_movement(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_import_opening_stock(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_post_inward(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_dispatch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_return(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_reverse_movement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_import_opening_stock(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID) TO authenticated;


-- END 074_inventory_rpcs.sql

-- ############################################################################
-- BEGIN 075_inventory_authorities.sql
-- ############################################################################

-- ============================================================
-- 050_inventory_authorities.sql  (RK Solar inventory port from Sumeru)
-- Inventory permissions, Inventory Person role, and Owner-only
-- control of pricing access (view_purchase_cost / manage_purchase_cost).
-- Requires 048_inventory_core.sql.
-- ============================================================

INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_inventory', 'View Inventory', 'inventory'),
  ('manage_inventory_items', 'Manage Inventory Items', 'inventory'),
  ('inventory_inward', 'Stock Inward', 'inventory'),
  ('inventory_dispatch', 'Dispatch to Customers', 'inventory'),
  ('inventory_return', 'Customer Returns', 'inventory'),
  ('inventory_adjust', 'Stock Adjustments & Reversals', 'inventory'),
  ('view_purchase_cost', 'View Purchase Cost & Stock Value', 'inventory'),
  ('manage_purchase_cost', 'Set Purchase Cost', 'inventory')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  authority_group = EXCLUDED.authority_group;

-- ------------------------------------------------------------
-- Inventory Person system role (every company)
-- ------------------------------------------------------------
INSERT INTO roles (company_id, name, slug, description, is_system)
SELECT id, 'Inventory Person', 'inventory-person', 'Item master, stock inward, dispatch and returns', true
FROM companies
ON CONFLICT (company_id, slug) DO NOTHING;

-- ------------------------------------------------------------
-- Role grants (pricing keys only for the Owner role)
-- ------------------------------------------------------------
-- Admin: inventory ops without cost keys in role_authorities (cost via is_company_admin_grantor only)

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return'), ('inventory_adjust')
) AS k(key)
WHERE r.slug = 'admin' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES ('view_inventory'), ('inventory_dispatch'), ('inventory_return')) AS k(key)
WHERE r.slug = 'sales_manager' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return')
) AS k(key)
WHERE r.slug = 'inventory-person' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Users with explicit user_authorities rows are checked there first,
-- so mirror their role's new inventory grants (never the pricing keys).
INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, ra.authority_key, true
FROM profiles p
JOIN role_authorities ra ON ra.role_id = p.role_id AND ra.granted = true
WHERE ra.authority_key IN (
    'view_inventory', 'manage_inventory_items', 'inventory_inward',
    'inventory_dispatch', 'inventory_return', 'inventory_adjust'
  )
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, k.key, true
FROM profiles p
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return'), ('inventory_adjust')
) AS k(key)
WHERE p.role_id IS NULL
  AND p.role = 'admin'
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, k.key, true
FROM profiles p
CROSS JOIN (VALUES ('view_inventory'), ('inventory_dispatch'), ('inventory_return')) AS k(key)
WHERE p.role_id IS NULL
  AND p.role = 'sales_manager'
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

-- ------------------------------------------------------------
-- has_authority (KT-compatible): keep LMS checks; admin/full_access
-- never imply purchase-cost keys (those use can_view/manage_purchase_cost
-- + is_company_admin_grantor).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_authority(required_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT
  -- Explicit user grant for this key
  EXISTS (
    SELECT 1 FROM user_authorities ua
    WHERE ua.user_id = auth.uid()
      AND ua.authority_key = required_key
      AND ua.granted = true
  )
  -- full_access user grant (never implies purchase cost)
  OR (
    required_key NOT IN ('view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1 FROM user_authorities ua
      WHERE ua.user_id = auth.uid()
        AND ua.authority_key = 'full_access'
        AND ua.granted = true
    )
  )
  -- Role grant for this key
  OR EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_authorities ra ON ra.role_id = p.role_id
    WHERE p.id = auth.uid()
      AND ra.granted = true
      AND ra.authority_key = required_key
  )
  -- Role full_access (never implies purchase cost)
  OR (
    required_key NOT IN ('view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_authorities ra ON ra.role_id = p.role_id
      WHERE p.id = auth.uid()
        AND ra.granted = true
        AND ra.authority_key = 'full_access'
    )
  )
  -- Admin enum fallback (never implies purchase cost or full_access key itself)
  OR (
    required_key NOT IN ('full_access', 'view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin'
    )
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- Owner-only guards. Requests without a signed-in user
-- (SQL editor, migrations, service role) are allowed.
-- ------------------------------------------------------------

-- Only an Admin can grant or remove the pricing keys on a role.
CREATE OR REPLACE FUNCTION guard_pricing_role_authorities()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keys TEXT[] := ARRAY['view_purchase_cost', 'manage_purchase_cost'];
BEGIN
  IF auth.uid() IS NULL OR is_company_admin_grantor() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.authority_key = ANY (v_keys) AND NEW.granted THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.authority_key = ANY (v_keys) OR OLD.authority_key = ANY (v_keys))
     AND (NEW.granted IS DISTINCT FROM OLD.granted OR NEW.authority_key IS DISTINCT FROM OLD.authority_key)
  THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.authority_key = ANY (v_keys) AND OLD.granted THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_authorities_guard_pricing ON role_authorities;
CREATE TRIGGER role_authorities_guard_pricing
  BEFORE INSERT OR UPDATE OR DELETE ON role_authorities
  FOR EACH ROW EXECUTE FUNCTION guard_pricing_role_authorities();

-- Only an Admin can give/remove the Owner role, or move someone
-- onto or off a role that has pricing access.
CREATE OR REPLACE FUNCTION guard_owner_and_pricing_roles()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_company_admin_grantor() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
    RAISE EXCEPTION 'Only an Admin can give or remove the Owner role.' USING ERRCODE = '42501';
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     AND (role_grants_purchase_cost(OLD.role_id) OR role_grants_purchase_cost(NEW.role_id))
  THEN
    RAISE EXCEPTION 'Only an Admin can assign or remove a role that has pricing access.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_owner_pricing ON profiles;
CREATE TRIGGER profiles_guard_owner_pricing
  BEFORE UPDATE OF role, role_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_owner_and_pricing_roles();


-- END 075_inventory_authorities.sql

-- ############################################################################
-- BEGIN 076_inventory_reverse_fix.sql
-- ############################################################################

-- ============================================================
-- 051_inventory_reverse_fix.sql  (RK Solar inventory port from Sumeru)
-- Fix inventory_reverse_movement:
--  * Entries can be reversed newest-first (return, then dispatch,
--    then inward); reversed entries and reversal rows no longer
--    count as "moved since".
--  * Reversing an inward frees serials that had reversed history.
-- Requires 049_inventory_rpcs.sql. Safe to re-run.
-- ============================================================
-- Undo an inward, dispatch or return by recording a reversal.
-- Blocked when a serial on it has moved since, or when stock would go negative.
CREATE OR REPLACE FUNCTION inventory_reverse_movement(p_movement_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_m inventory_movements%ROWTYPE;
  v_line RECORD;
  v_bad RECORD;
  v_item inventory_items%ROWTYPE;
  v_new_id UUID;
  v_new_line_id UUID;
  v_no TEXT;
  v_removed TEXT[] := '{}';
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse an entry.';
  END IF;

  SELECT * INTO v_m FROM inventory_movements
  WHERE id = p_movement_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;
  IF v_m.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already reversed.', v_m.movement_no;
  END IF;
  IF v_m.movement_type NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Only inward, dispatch and return entries can be reversed. Record an adjustment instead.';
  END IF;

  PERFORM 1 FROM inventory_items
  WHERE id IN (SELECT item_id FROM inventory_movement_lines WHERE movement_id = v_m.id)
  ORDER BY id FOR UPDATE;

  PERFORM 1 FROM inventory_serials
  WHERE id IN (
    SELECT ls.serial_id FROM inventory_movement_line_serials ls
    JOIN inventory_movement_lines ml ON ml.id = ls.line_id
    WHERE ml.movement_id = v_m.id
  )
  ORDER BY id FOR UPDATE;

  -- Every serial on this entry must not have moved since
  -- (later entries that are already reversed, and reversal entries, cancel out).
  SELECT s.serial_no INTO v_bad
  FROM inventory_movement_line_serials ls
  JOIN inventory_movement_lines ml ON ml.id = ls.line_id
  JOIN inventory_serials s ON s.id = ls.serial_id
  WHERE ml.movement_id = v_m.id
    AND EXISTS (
      SELECT 1
      FROM inventory_movement_line_serials ls2
      JOIN inventory_movement_lines ml2 ON ml2.id = ls2.line_id
      JOIN inventory_movements m2 ON m2.id = ml2.movement_id
      WHERE ls2.serial_id = ls.serial_id
        AND m2.id <> v_m.id
        AND m2.created_at > v_m.created_at
        AND m2.reversed_by_id IS NULL
        AND m2.movement_type <> 'reversal'
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Serial % has moved since %. Reverse the later entries first.', v_bad.serial_no, v_m.movement_no;
  END IF;

  -- Bulk stock / customer balance checks.
  FOR v_line IN
    SELECT ml.item_id, SUM(ml.quantity_delta) AS delta,
           SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS stock_delta
    FROM inventory_movement_lines ml
    JOIN inventory_items i ON i.id = ml.item_id
    WHERE ml.movement_id = v_m.id AND NOT i.track_serials
    GROUP BY ml.item_id
  LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = v_line.item_id;
    IF COALESCE(v_line.stock_delta, 0) > 0
       AND inventory_bulk_on_hand(v_line.item_id) - v_line.stock_delta < 0 THEN
      RAISE EXCEPTION 'Not enough % left in stock to reverse %.', v_item.name, v_m.movement_no;
    END IF;
    IF v_m.movement_type = 'dispatch'
       AND inventory_customer_used(v_m.lead_id, v_line.item_id) + v_line.delta < 0 THEN
      RAISE EXCEPTION 'Some % from % was already returned. Reverse the return first.', v_item.name, v_m.movement_no;
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'reversal');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, movement_date, reason, notes, reverses_id, created_by
  ) VALUES (
    v_company, 'reversal', v_no, v_m.lead_id, CURRENT_DATE, v_reason,
    'Reversal of ' || v_m.movement_no, v_m.id, auth.uid()
  ) RETURNING id INTO v_new_id;

  FOR v_line IN SELECT * FROM inventory_movement_lines WHERE movement_id = v_m.id LOOP
    INSERT INTO inventory_movement_lines (
      company_id, movement_id, item_id, quantity_delta, return_condition, serial_action, notes
    ) VALUES (
      v_company, v_new_id, v_line.item_id, -v_line.quantity_delta, v_line.return_condition, v_line.serial_action,
      'Reversal of ' || v_m.movement_no
    ) RETURNING id INTO v_new_line_id;

    IF v_m.movement_type = 'inward' THEN
      -- Undo a wrong inward: free the serial numbers so they can be entered again.
      SELECT v_removed || COALESCE(array_agg(s.serial_no::TEXT), '{}'::TEXT[]) INTO v_removed
      FROM inventory_movement_line_serials ls JOIN inventory_serials s ON s.id = ls.serial_id
      WHERE ls.line_id = v_line.id;

      -- Any later history of these serials is reversed pairs (checked above); drop those links too.
      DELETE FROM inventory_movement_line_serials
      WHERE serial_id IN (SELECT id FROM inventory_serials WHERE inward_line_id = v_line.id);
      DELETE FROM inventory_serials WHERE inward_line_id = v_line.id;
    ELSE
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_new_line_id, ls.serial_id
      FROM inventory_movement_line_serials ls WHERE ls.line_id = v_line.id;

      IF v_m.movement_type = 'dispatch' THEN
        UPDATE inventory_serials SET status = 'in_stock', current_lead_id = NULL
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      ELSE
        UPDATE inventory_serials SET status = 'dispatched', current_lead_id = v_m.lead_id
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      END IF;
    END IF;
  END LOOP;

  UPDATE inventory_movements SET reversed_by_id = v_new_id WHERE id = v_m.id;

  PERFORM inventory__audit(v_company, v_m.lead_id, 'inventory_reversal', v_new_id,
    jsonb_build_object('movement_no', v_no, 'reverses', v_m.movement_no, 'reason', v_reason,
                       'removed_serials', to_jsonb(v_removed)));

  RETURN jsonb_build_object('id', v_new_id, 'movement_no', v_no);
END;
$$;


-- END 076_inventory_reverse_fix.sql

-- ############################################################################
-- BEGIN 077_inventory_customer_lookup.sql
-- ############################################################################

-- ============================================================
-- 052_inventory_customer_lookup.sql  (RK Solar inventory port from Sumeru)
-- Read-only helpers for the dispatch / challan screens.
-- Inventory staff often lack view_all_leads, so leads RLS hides
-- customers from them. These SECURITY DEFINER functions expose only
-- delivery details (name, phone, address, meter name) of customers,
-- and a price-free material suggestion from their quotation.
-- Requires 048–050.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory__can_view()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
$$;

-- Search customers (Won / Project Completed) by name, phone or city,
-- or fetch specific leads by id (only customers or leads that already
-- have stock movements, e.g. for challans).
CREATE OR REPLACE FUNCTION inventory_customer_lookup(
  p_query TEXT DEFAULT NULL,
  p_lead_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  city TEXT,
  address TEXT,
  meter_name TEXT,
  sales_stage TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF v_company IS NULL OR NOT inventory__can_view() THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF p_lead_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT l.id, l.name::TEXT, l.phone::TEXT, l.city::TEXT, l.address::TEXT, NULL::TEXT, l.sales_stage::TEXT
    FROM leads l
    WHERE l.company_id = v_company
      AND l.id = ANY (p_lead_ids)
      AND (
        l.sales_stage::TEXT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed')
        OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.company_id = v_company AND m.lead_id = l.id)
      )
    LIMIT 500;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.name::TEXT, l.phone::TEXT, l.city::TEXT, l.address::TEXT, NULL::TEXT, l.sales_stage::TEXT
  FROM leads l
  WHERE l.company_id = v_company
    AND l.sales_stage::TEXT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed')
    AND (
      v_q IS NULL
      OR l.name ILIKE '%' || v_q || '%'
      OR l.phone ILIKE '%' || v_q || '%'
      OR COALESCE(l.alternate_phone, '') ILIKE '%' || v_q || '%'
      OR COALESCE(l.city, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY COALESCE(l.won_closed_at, l.updated_at) DESC NULLS LAST, l.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

-- Suggested dispatch lines from the customer's accepted quotation
-- (else the latest one). Maps quotation rows to inventory items by the
-- catalog link, then by exact name. Quantities only; no prices.
CREATE OR REPLACE FUNCTION inventory_quotation_suggestion(p_lead_id UUID)
RETURNS TABLE (
  quotation_no TEXT,
  item_id UUID,
  quantity NUMERIC,
  source_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_quote RECORD;
BEGIN
  IF v_company IS NULL OR NOT inventory__can_view() THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  SELECT q.id, q.quotation_no INTO v_quote
  FROM quotations q
  WHERE q.company_id = v_company AND q.lead_id = p_lead_id AND q.status <> 'rejected'
  ORDER BY (q.status = 'accepted') DESC, q.quote_date DESC, q.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_quote.quotation_no::TEXT,
    COALESCE(by_link.id, by_name.id),
    qi.quantity,
    qi.item_name_snapshot::TEXT
  FROM quotation_items qi
  LEFT JOIN LATERAL (
    SELECT i.id FROM inventory_items i
    WHERE i.company_id = v_company AND i.is_active AND qi.item_id IS NOT NULL AND i.quote_item_id = qi.item_id
    ORDER BY i.name LIMIT 1
  ) by_link ON true
  LEFT JOIN LATERAL (
    SELECT i.id FROM inventory_items i
    WHERE i.company_id = v_company AND i.is_active AND lower(i.name) = lower(qi.item_name_snapshot)
    LIMIT 1
  ) by_name ON true
  WHERE qi.quotation_id = v_quote.id
  ORDER BY qi.created_at;
END;
$$;

REVOKE ALL ON FUNCTION inventory__can_view() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_customer_lookup(TEXT, UUID[], INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_quotation_suggestion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_customer_lookup(TEXT, UUID[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_quotation_suggestion(UUID) TO authenticated;


-- END 077_inventory_customer_lookup.sql

-- ############################################################################
-- BEGIN 078_inventory_delete_item.sql
-- ############################################################################

-- ============================================================
-- 053_inventory_delete_item.sql  (RK Solar inventory port from Sumeru)
-- Delete an inventory item that was never used. Items with any
-- stock entry or serial keep their history and can only be marked
-- inactive. Requires 048–050.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_delete_item(p_item_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT is_active_user() OR NOT has_authority('manage_inventory_items') THEN
    RAISE EXCEPTION 'You do not have permission to delete inventory items.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name
  FROM inventory_items
  WHERE id = p_item_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found.';
  END IF;

  IF EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM inventory_serials WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'ITEM_HAS_HISTORY: % has stock entries, so it cannot be deleted. Mark it inactive instead.', v_name;
  END IF;

  DELETE FROM inventory_items WHERE id = p_item_id AND company_id = v_company;
  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION inventory_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_delete_item(UUID) TO authenticated;


-- END 078_inventory_delete_item.sql

-- ############################################################################
-- BEGIN 079_inventory_movement_search.sql
-- ############################################################################

-- ============================================================
-- 057_inventory_movement_search.sql  (RK Solar inventory port from Sumeru)
-- Search stock movements by movement number, serial (partial),
-- or item name / SKU / specifications (e.g. 540W).
-- Requires 048–050 (and 052 for inventory__can_view if present).
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_search_movements(
  p_query TEXT,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  movement_no TEXT,
  movement_type TEXT,
  movement_date DATE,
  created_at TIMESTAMPTZ,
  is_opening_stock BOOLEAN,
  lead_id UUID,
  customer_name TEXT,
  supplier_name TEXT,
  reversed BOOLEAN,
  line_count BIGINT,
  serial_count BIGINT,
  match_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_serial TEXT;
  v_type TEXT := NULLIF(btrim(COALESCE(p_type, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_company IS NULL OR NOT (
    auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF v_q IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) > 80 THEN
    v_q := left(v_q, 80);
  END IF;

  v_serial := normalize_serial(v_q);

  RETURN QUERY
  WITH matched AS (
    SELECT
      m.id AS mid,
      CASE
        WHEN m.movement_no ILIKE '%' || v_q || '%' THEN 'movement_no'
        WHEN EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        ) THEN 'serial'
        ELSE 'item_spec'
      END AS reason
    FROM inventory_movements m
    WHERE m.company_id = v_company
      AND (v_type IS NULL OR m.movement_type::TEXT = v_type)
      AND (
        m.movement_no ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_items i ON i.id = ml.item_id
          WHERE ml.movement_id = m.id
            AND (
              i.name ILIKE '%' || v_q || '%'
              OR COALESCE(i.sku, '') ILIKE '%' || v_q || '%'
              OR i.specifications::TEXT ILIKE '%' || v_q || '%'
            )
        )
      )
  )
  SELECT
    m.id,
    m.movement_no::TEXT,
    m.movement_type::TEXT,
    m.movement_date,
    m.created_at,
    m.is_opening_stock,
    m.lead_id,
    l.name::TEXT AS customer_name,
    m.supplier_name::TEXT,
    (m.reversed_by_id IS NOT NULL) AS reversed,
    (SELECT count(*)::BIGINT FROM inventory_movement_lines ml WHERE ml.movement_id = m.id) AS line_count,
    (
      SELECT count(*)::BIGINT
      FROM inventory_movement_lines ml
      JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
      WHERE ml.movement_id = m.id
    ) AS serial_count,
    matched.reason::TEXT AS match_reason
  FROM matched
  JOIN inventory_movements m ON m.id = matched.mid
  LEFT JOIN leads l ON l.id = m.lead_id
  ORDER BY m.movement_date DESC, m.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE INDEX IF NOT EXISTS inventory_serials_company_serial_idx
  ON inventory_serials (company_id, serial_no);

REVOKE ALL ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) TO authenticated;


-- END 079_inventory_movement_search.sql

-- ############################################################################
-- BEGIN 080_inventory_item_masters.sql
-- ############################################################################

-- ============================================================
-- 059_inventory_item_masters.sql  (RK Solar inventory port from Sumeru)
-- Master Group → Category → Sub-Category hierarchy on inventory items.
-- Reuses quote_item_categories / quote_brands. Requires 048 (013).
-- ============================================================

-- ------------------------------------------------------------
-- Master groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_master_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_master_groups_company_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_master_groups_company
  ON inventory_master_groups (company_id, sort_order, name);

ALTER TABLE quote_item_categories
  ADD COLUMN IF NOT EXISTS master_group_id UUID REFERENCES inventory_master_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_item_categories_master_group
  ON quote_item_categories (company_id, master_group_id);

-- ------------------------------------------------------------
-- Sub-categories (under quote_item_categories)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES quote_item_categories(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_subcategories_company_cat_name UNIQUE (company_id, category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_subcategories_category
  ON inventory_subcategories (company_id, category_id, sort_order, name);

-- ------------------------------------------------------------
-- Item FKs
-- ------------------------------------------------------------
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS master_group_id UUID REFERENCES inventory_master_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES inventory_subcategories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_master_group
  ON inventory_items (company_id, master_group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_subcategory
  ON inventory_items (company_id, subcategory_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE inventory_master_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_master_groups_select ON inventory_master_groups;
CREATE POLICY inventory_master_groups_select ON inventory_master_groups FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('manage_catalog_items')
      OR has_authority('view_quotations')
    )
  );

DROP POLICY IF EXISTS inventory_subcategories_select ON inventory_subcategories;
CREATE POLICY inventory_subcategories_select ON inventory_subcategories FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('manage_catalog_items')
      OR has_authority('view_quotations')
    )
  );

-- Direct table writes stay catalog-gated; inventory creates via RPCs below.
DROP POLICY IF EXISTS inventory_master_groups_manage ON inventory_master_groups;
CREATE POLICY inventory_master_groups_manage ON inventory_master_groups FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  );

DROP POLICY IF EXISTS inventory_subcategories_manage ON inventory_subcategories;
CREATE POLICY inventory_subcategories_manage ON inventory_subcategories FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  );

-- Allow inventory managers to insert/update categories & brands (shared masters)
DROP POLICY IF EXISTS quote_item_categories_manage ON quote_item_categories;
CREATE POLICY quote_item_categories_manage ON quote_item_categories FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  );

DROP POLICY IF EXISTS quote_brands_manage ON quote_brands;
CREATE POLICY quote_brands_manage ON quote_brands FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  );

-- ------------------------------------------------------------
-- Item write trigger: hierarchy consistency
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
  v_cat_master UUID;
  v_sub_cat UUID;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.master_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_master_groups
    WHERE id = NEW.master_group_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT name, master_group_id INTO v_category_name, v_cat_master
    FROM quote_item_categories
    WHERE id = NEW.category_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found.';
    END IF;
    -- Auto-fill master group from category when category is linked
    IF v_cat_master IS NOT NULL THEN
      IF NEW.master_group_id IS NULL THEN
        NEW.master_group_id := v_cat_master;
      ELSIF NEW.master_group_id IS DISTINCT FROM v_cat_master THEN
        RAISE EXCEPTION 'Category belongs to a different master group.';
      END IF;
    END IF;
  ELSE
    v_category_name := NULL;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Brand not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  IF NEW.subcategory_id IS NOT NULL THEN
    SELECT category_id INTO v_sub_cat
    FROM inventory_subcategories
    WHERE id = NEW.subcategory_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-category not found.';
    END IF;
    IF NEW.category_id IS NULL THEN
      RAISE EXCEPTION 'Choose a category before a sub-category.';
    END IF;
    IF v_sub_cat IS DISTINCT FROM NEW.category_id THEN
      RAISE EXCEPTION 'Sub-category does not belong to the selected category.';
    END IF;
  END IF;

  NEW.track_serials := COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
  IF NEW.track_serials THEN
    NEW.unit_type := 'nos';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.track_serials IS DISTINCT FROM OLD.track_serials OR NEW.unit_type IS DISTINCT FROM OLD.unit_type)
     AND EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = NEW.id)
  THEN
    RAISE EXCEPTION 'This item already has stock entries, so its type (serial or bulk) and unit cannot change.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Stock view: expose new FKs
-- CREATE OR REPLACE cannot insert/rename columns mid-list (42P16).
-- Drop dependents first, then recreate both views.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS inventory_stock_value CASCADE;
DROP VIEW IF EXISTS inventory_stock_on_hand CASCADE;

CREATE VIEW inventory_stock_on_hand
WITH (security_invoker = true) AS
SELECT
  x.*,
  (x.on_hand <= 0) AS is_out,
  (x.on_hand > 0 AND x.low_stock_threshold > 0 AND x.on_hand <= x.low_stock_threshold) AS is_low
FROM (
  SELECT
    i.id AS item_id,
    i.company_id,
    i.name,
    i.sku,
    i.category_id,
    i.brand_id,
    i.master_group_id,
    i.subcategory_id,
    i.unit_type,
    i.track_serials,
    i.low_stock_threshold,
    i.image_path,
    i.is_active,
    COALESCE(CASE WHEN i.track_serials THEN s.in_stock ELSE b.qty END, 0)::NUMERIC(14,3) AS on_hand,
    COALESCE(s.dispatched, 0) AS serials_dispatched,
    COALESCE(s.defective, 0) AS serials_defective
  FROM inventory_items i
  LEFT JOIN LATERAL (
    SELECT SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS qty
    FROM inventory_movement_lines ml
    WHERE ml.item_id = i.id
  ) b ON NOT i.track_serials
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE st.status = 'in_stock') AS in_stock,
      COUNT(*) FILTER (WHERE st.status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE st.status = 'defective') AS defective
    FROM inventory_serials st
    WHERE st.item_id = i.id
  ) s ON i.track_serials
) x;

CREATE VIEW inventory_stock_value
WITH (security_invoker = true) AS
SELECT
  oh.company_id,
  oh.item_id,
  oh.on_hand,
  CASE
    WHEN oh.track_serials THEN sv.total_value
    ELSE oh.on_hand * COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(16,2) AS stock_value,
  CASE
    WHEN oh.track_serials THEN CASE WHEN oh.on_hand > 0 THEN sv.total_value / oh.on_hand END
    ELSE COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(14,2) AS unit_cost,
  CASE
    WHEN oh.track_serials THEN COALESCE(sv.missing_cost, 0)
    ELSE CASE WHEN oh.on_hand > 0 AND avgc.avg_cost IS NULL AND ic.default_unit_cost IS NULL THEN 1 ELSE 0 END
  END AS missing_cost_count
FROM inventory_stock_on_hand oh
LEFT JOIN inventory_item_costs ic ON ic.item_id = oh.item_id
LEFT JOIN LATERAL (
  SELECT SUM(ml.quantity_delta * c.unit_cost) / NULLIF(SUM(ml.quantity_delta), 0) AS avg_cost
  FROM inventory_movement_lines ml
  JOIN inventory_movements m ON m.id = ml.movement_id
  JOIN inventory_inward_costs c ON c.line_id = ml.id
  WHERE ml.item_id = oh.item_id
    AND m.movement_type = 'inward'
    AND m.reversed_by_id IS NULL
) avgc ON NOT oh.track_serials
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(c.unit_cost, ic.default_unit_cost, 0)) AS total_value,
    COUNT(*) FILTER (WHERE c.unit_cost IS NULL AND ic.default_unit_cost IS NULL) AS missing_cost
  FROM inventory_serials s
  LEFT JOIN inventory_inward_costs c ON c.line_id = s.inward_line_id
  WHERE s.item_id = oh.item_id
    AND s.status = 'in_stock'
) sv ON oh.track_serials
WHERE can_view_purchase_cost();

-- ------------------------------------------------------------
-- Create-master RPCs (idempotent by name)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_can_manage_masters()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active_user() AND (
    has_authority('manage_inventory_items') OR has_authority('manage_catalog_items')
  );
$$;

CREATE OR REPLACE FUNCTION inventory_create_master_group(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row inventory_master_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Master group name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Master group name is too long.';
  END IF;

  SELECT * INTO v_row FROM inventory_master_groups
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', true);
  END IF;

  INSERT INTO inventory_master_groups (company_id, name)
  VALUES (v_company, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_category(p_name TEXT, p_master_group_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_master UUID;
  v_row quote_item_categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Category name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Category name is too long.';
  END IF;

  v_master := p_master_group_id;
  IF v_master IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_master_groups WHERE id = v_master AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  SELECT * INTO v_row FROM quote_item_categories
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    IF v_master IS NOT NULL AND v_row.master_group_id IS DISTINCT FROM v_master THEN
      UPDATE quote_item_categories SET master_group_id = v_master WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name,
      'master_group_id', v_row.master_group_id, 'idempotent', true
    );
  END IF;

  INSERT INTO quote_item_categories (company_id, name, sort_order, master_group_id)
  VALUES (v_company, v_name, 100, v_master)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name,
    'master_group_id', v_row.master_group_id, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_subcategory(p_category_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row inventory_subcategories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Sub-category name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Sub-category name is too long.';
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM quote_item_categories WHERE id = p_category_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;

  SELECT * INTO v_row FROM inventory_subcategories
  WHERE company_id = v_company AND category_id = p_category_id AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name,
      'category_id', v_row.category_id, 'idempotent', true
    );
  END IF;

  INSERT INTO inventory_subcategories (company_id, category_id, name)
  VALUES (v_company, p_category_id, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name,
    'category_id', v_row.category_id, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_brand(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row quote_brands%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Brand name is required.';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Brand name is too long.';
  END IF;

  SELECT * INTO v_row FROM quote_brands
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', true);
  END IF;

  INSERT INTO quote_brands (company_id, name)
  VALUES (v_company, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION inventory_can_manage_masters() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_master_group(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_category(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_subcategory(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_brand(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_create_master_group(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_category(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_subcategory(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_brand(TEXT) TO authenticated;

GRANT SELECT ON inventory_master_groups, inventory_subcategories TO authenticated;

-- ------------------------------------------------------------
-- Opening import: persist master_group_id / subcategory_id on new items
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_import_opening_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
  v_new JSONB;
  v_map JSONB := '{}'::jsonb;
  v_item_id UUID;
  v_resolved JSONB := '[]'::jsonb;
  v_line JSONB;
  v_group RECORD;
  v_result JSONB;
  v_all_serials TEXT[] := '{}';
  v_dup TEXT;
  v_movements INT := 0;
  v_serials INT := 0;
  v_items_created INT := 0;
  v_header JSONB;
BEGIN
  IF jsonb_typeof(payload -> 'new_items') = 'array' AND jsonb_array_length(payload -> 'new_items') > 0 THEN
    IF NOT has_authority('manage_inventory_items') THEN
      RAISE EXCEPTION 'Creating new items needs the Manage Inventory Items permission.' USING ERRCODE = '42501';
    END IF;
    FOR v_new IN SELECT * FROM jsonb_array_elements(payload -> 'new_items') LOOP
      IF NULLIF(btrim(v_new ->> 'name'), '') IS NULL OR NULLIF(v_new ->> 'key', '') IS NULL THEN
        RAISE EXCEPTION 'Each new item needs a name.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM inventory_items
        WHERE company_id = v_company AND lower(name) = lower(btrim(v_new ->> 'name'))
      ) THEN
        RAISE EXCEPTION 'Item "%" already exists. Map the rows to it instead of creating it.', btrim(v_new ->> 'name');
      END IF;
      INSERT INTO inventory_items (
        company_id, name, sku, master_group_id, category_id, subcategory_id, brand_id,
        unit_type, low_stock_threshold, specifications, created_by
      ) VALUES (
        v_company,
        btrim(v_new ->> 'name'),
        NULLIF(btrim(v_new ->> 'sku'), ''),
        NULLIF(v_new ->> 'master_group_id', '')::UUID,
        NULLIF(v_new ->> 'category_id', '')::UUID,
        NULLIF(v_new ->> 'subcategory_id', '')::UUID,
        NULLIF(v_new ->> 'brand_id', '')::UUID,
        COALESCE(NULLIF(v_new ->> 'unit_type', ''), 'nos')::inventory_unit,
        COALESCE(NULLIF(v_new ->> 'low_stock_threshold', '')::NUMERIC, 0),
        COALESCE(v_new -> 'specifications', '{}'::jsonb),
        auth.uid()
      ) RETURNING id INTO v_item_id;
      v_map := jsonb_set(v_map, ARRAY[v_new ->> 'key'], to_jsonb(v_item_id::TEXT));
      v_items_created := v_items_created + 1;
    END LOOP;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line ->> 'item_id', '') IS NULL THEN
      IF NOT v_map ? COALESCE(v_line ->> 'item_key', '') THEN
        RAISE EXCEPTION 'A row is not matched to an item.';
      END IF;
      v_line := jsonb_set(v_line, '{item_id}', v_map -> (v_line ->> 'item_key'));
    END IF;
    v_resolved := v_resolved || jsonb_build_array(v_line);
    v_all_serials := v_all_serials || inventory__line_serials(v_line);
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s WHERE s IS NOT NULL GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % appears more than once in the file.', v_dup;
  END IF;

  v_header := jsonb_build_object(
    'supplier_name', 'Opening stock',
    'movement_date', payload ->> 'movement_date',
    'notes', 'Excel import' || COALESCE(': ' || NULLIF(btrim(payload ->> 'file_name'), ''), '')
  );

  FOR v_group IN
    SELECT l ->> 'item_id' AS item_id, jsonb_agg(l) AS lines
    FROM jsonb_array_elements(v_resolved) l
    GROUP BY l ->> 'item_id'
  LOOP
    v_result := inventory__post_inward(v_company, v_header, v_group.lines, true);
    v_movements := v_movements + 1;
    v_serials := v_serials + COALESCE((v_result ->> 'serials')::INT, 0);
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_opening_import', NULL,
    jsonb_build_object('file_name', payload ->> 'file_name', 'movements', v_movements,
                       'serials', v_serials, 'items_created', v_items_created,
                       'rows', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object(
    'movements', v_movements, 'serials', v_serials, 'items_created', v_items_created
  );
END;
$$;


-- END 080_inventory_item_masters.sql

-- ############################################################################
-- BEGIN 081_inventory_parties.sql
-- ############################################################################

-- ============================================================
-- 060_inventory_parties.sql  (RK Solar inventory port from Sumeru)
-- B2B party directory + dispatch/return to party XOR lead.
-- Requires 048–051 (013–016), On-Floor 054+ optional.
-- ============================================================

-- ------------------------------------------------------------
-- Parties
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE inventory_party_kind AS ENUM ('company', 'dealer', 'vendor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind inventory_party_kind NOT NULL DEFAULT 'dealer',
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40),
  city VARCHAR(120),
  address TEXT,
  gstin VARCHAR(20),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_parties_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_parties_company_name_uq
  ON inventory_parties (company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_inventory_parties_company
  ON inventory_parties (company_id, kind, name);

ALTER TABLE inventory_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_parties_select ON inventory_parties;
CREATE POLICY inventory_parties_select ON inventory_parties FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  );

DROP POLICY IF EXISTS inventory_parties_manage ON inventory_parties;
CREATE POLICY inventory_parties_manage ON inventory_parties FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('inventory_dispatch'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('inventory_dispatch'))
  );

GRANT SELECT, INSERT, UPDATE ON inventory_parties TO authenticated;

-- ------------------------------------------------------------
-- Movements + serials
-- ------------------------------------------------------------
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES inventory_parties(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_movements_party_idx
  ON inventory_movements (company_id, party_id) WHERE party_id IS NOT NULL;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_lead_required;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_counterparty;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_counterparty CHECK (
    CASE movement_type::text
      WHEN 'dispatch' THEN ((lead_id IS NOT NULL) <> (party_id IS NOT NULL))
      WHEN 'return' THEN ((lead_id IS NOT NULL) <> (party_id IS NOT NULL))
      WHEN 'service_issue' THEN (lead_id IS NOT NULL AND party_id IS NULL)
      ELSE party_id IS NULL
    END
  );

ALTER TABLE inventory_serials
  ADD COLUMN IF NOT EXISTS current_party_id UUID REFERENCES inventory_parties(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_serials_party_idx
  ON inventory_serials (current_party_id) WHERE current_party_id IS NOT NULL;

ALTER TABLE inventory_serials DROP CONSTRAINT IF EXISTS inventory_serials_lead_when_dispatched;
ALTER TABLE inventory_serials DROP CONSTRAINT IF EXISTS inventory_serials_counterparty;
ALTER TABLE inventory_serials
  ADD CONSTRAINT inventory_serials_counterparty CHECK (
    CASE
      WHEN status = 'dispatched' THEN
        (current_lead_id IS NOT NULL AND current_party_id IS NULL)
        OR (current_lead_id IS NULL AND current_party_id IS NOT NULL)
      ELSE current_lead_id IS NULL AND current_party_id IS NULL
    END
  );

-- ------------------------------------------------------------
-- Party material helpers / view
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_party_used(p_party_id UUID, p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(-SUM(ml.quantity_delta), 0)
  FROM inventory_movements m
  JOIN inventory_movement_lines ml ON ml.movement_id = m.id
  WHERE m.party_id = p_party_id
    AND ml.item_id = p_item_id
    AND m.movement_type IN ('dispatch', 'return')
    AND m.reversed_by_id IS NULL
$$;

CREATE OR REPLACE VIEW inventory_party_material
WITH (security_invoker = true) AS
SELECT
  m.company_id,
  m.party_id,
  ml.item_id,
  SUM(CASE WHEN m.movement_type = 'dispatch' THEN -ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS dispatched,
  SUM(CASE WHEN m.movement_type = 'return' THEN ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS returned,
  (-SUM(ml.quantity_delta))::NUMERIC(14,3) AS used,
  MAX(m.movement_date) AS last_movement_date
FROM inventory_movements m
JOIN inventory_movement_lines ml ON ml.movement_id = m.id
WHERE m.party_id IS NOT NULL
  AND m.movement_type IN ('dispatch', 'return')
  AND m.reversed_by_id IS NULL
GROUP BY m.company_id, m.party_id, ml.item_id;

GRANT SELECT ON inventory_party_material TO authenticated;

-- ------------------------------------------------------------
-- Create / lookup parties
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_can_manage_parties()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active_user() AND (
    has_authority('manage_inventory_items') OR has_authority('inventory_dispatch')
  );
$$;

CREATE OR REPLACE FUNCTION inventory_create_party(
  p_name TEXT,
  p_kind TEXT DEFAULT 'dealer',
  p_phone TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_gstin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_kind inventory_party_kind;
  v_row inventory_parties%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_parties() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory parties.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Party name is required.';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'Party name is too long.';
  END IF;
  BEGIN
    v_kind := COALESCE(NULLIF(btrim(p_kind), ''), 'dealer')::inventory_party_kind;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Kind must be company, dealer or vendor.';
  END;

  SELECT * INTO v_row FROM inventory_parties
  WHERE company_id = v_company AND lower(btrim(name)) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_row.is_active THEN
      UPDATE inventory_parties SET is_active = true, kind = v_kind, updated_at = NOW()
      WHERE id = v_row.id RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
      'phone', v_row.phone, 'city', v_row.city, 'idempotent', true
    );
  END IF;

  INSERT INTO inventory_parties (company_id, kind, name, phone, city, address, gstin)
  VALUES (
    v_company, v_kind, v_name,
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_gstin, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
    'phone', v_row.phone, 'city', v_row.city, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_party_lookup(p_query TEXT DEFAULT NULL, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  name TEXT,
  kind TEXT,
  phone TEXT,
  city TEXT,
  address TEXT,
  gstin TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('view_inventory');
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name::TEXT, p.kind::TEXT, p.phone::TEXT, p.city::TEXT,
    p.address::TEXT, p.gstin::TEXT, p.is_active
  FROM inventory_parties p
  WHERE p.company_id = v_company
    AND p.is_active
    AND (
      v_q IS NULL
      OR p.name ILIKE '%' || v_q || '%'
      OR COALESCE(p.phone, '') ILIKE '%' || v_q || '%'
      OR COALESCE(p.city, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY p.name
  LIMIT v_limit;
END;
$$;

-- ------------------------------------------------------------
-- Dispatch: lead XOR party
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_post_dispatch(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_dispatch');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_party inventory_parties%ROWTYPE;
  v_lead_id UUID := NULLIF(payload ->> 'lead_id', '')::UUID;
  v_party_id UUID := NULLIF(payload ->> 'party_id', '')::UUID;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_on_hand NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
  v_where_name TEXT;
BEGIN
  IF (v_lead_id IS NULL) = (v_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose a customer or a company / dealer / vendor (not both).';
  END IF;

  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found.';
    END IF;
    IF v_lead.sales_stage::TEXT NOT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed') THEN
      RAISE EXCEPTION 'Material can only be dispatched to a customer (Won or Project Completed).';
    END IF;
    v_where_name := v_lead.name;
  ELSE
    SELECT * INTO v_party FROM inventory_parties WHERE id = v_party_id AND company_id = v_company;
    IF NOT FOUND OR NOT v_party.is_active THEN
      RAISE EXCEPTION 'Company / dealer / vendor not found.';
    END IF;
    v_where_name := v_party.name;
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is inactive.', v_item.name;
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit. Serial numbers are required for dispatch.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;
      IF NULLIF(v_line ->> 'quantity', '') IS NOT NULL
         AND (v_line ->> 'quantity')::NUMERIC <> cardinality(v_serials) THEN
        RAISE EXCEPTION '%: quantity % does not match % serial numbers.',
          v_item.name, v_line ->> 'quantity', cardinality(v_serials);
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (SELECT 1 FROM inventory_serials s WHERE s.company_id = v_company AND s.serial_no = x)
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % is not in inventory. Record it on an inward first.', v_bad.serial_no;
      END IF;

      SELECT s.serial_no, i.name AS item_name INTO v_bad
      FROM inventory_serials s JOIN inventory_items i ON i.id = s.item_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.item_id <> v_item.id
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % belongs to %, not %.', v_bad.serial_no, v_bad.item_name, v_item.name;
      END IF;

      SELECT s.serial_no, s.status,
             COALESCE(l.name, p.name) AS dest_name INTO v_bad
      FROM inventory_serials s
      LEFT JOIN leads l ON l.id = s.current_lead_id
      LEFT JOIN inventory_parties p ON p.id = s.current_party_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.status <> 'in_stock'
      LIMIT 1;
      IF FOUND THEN
        IF v_bad.status = 'dispatched' THEN
          RAISE EXCEPTION 'Serial % is already dispatched to %.', v_bad.serial_no, v_bad.dest_name;
        END IF;
        RAISE EXCEPTION 'Serial % is marked %, so it cannot be dispatched.', v_bad.serial_no, v_bad.status;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_on_hand := inventory_bulk_on_hand(v_total.item_id);
    IF v_on_hand < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'Only % % of % in stock (asked for %).',
        trim_scale(v_on_hand), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'dispatch');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, party_id, vehicle_no, delivered_by, movement_date, notes, created_by
  ) VALUES (
    v_company, 'dispatch', v_no, v_lead_id, v_party_id,
    NULLIF(btrim(payload ->> 'vehicle_no'), ''),
    NULLIF(btrim(payload ->> 'delivered_by'), ''),
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
    VALUES (v_company, v_movement_id, v_item.id, -v_qty, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = 'dispatched',
          current_lead_id = v_lead_id,
          current_party_id = v_party_id
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead_id, 'inventory_dispatch', v_movement_id,
    jsonb_build_object(
      'movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count,
      'party_id', v_party_id, 'to', v_where_name
    ));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Return: lead XOR party
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_post_return(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_return');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_party inventory_parties%ROWTYPE;
  v_lead_id UUID := NULLIF(payload ->> 'lead_id', '')::UUID;
  v_party_id UUID := NULLIF(payload ->> 'party_id', '')::UUID;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_condition inventory_return_condition;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_used NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
BEGIN
  IF (v_lead_id IS NULL) = (v_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose a customer or a company / dealer / vendor (not both).';
  END IF;

  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found.';
    END IF;
  ELSE
    SELECT * INTO v_party FROM inventory_parties WHERE id = v_party_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company / dealer / vendor not found.';
    END IF;
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;

    IF COALESCE(v_line ->> 'condition', 'good') NOT IN ('good', 'defective') THEN
      RAISE EXCEPTION 'Return condition must be good or defective.';
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit being returned.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_serials s
        WHERE s.company_id = v_company AND s.serial_no = x AND s.item_id = v_item.id
          AND s.status = 'dispatched'
          AND (
            (v_lead_id IS NOT NULL AND s.current_lead_id = v_lead_id)
            OR (v_party_id IS NOT NULL AND s.current_party_id = v_party_id)
          )
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) is not at this %.',
          v_bad.serial_no, v_item.name,
          CASE WHEN v_party_id IS NOT NULL THEN 'company / dealer / vendor' ELSE 'customer' END;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_used := CASE
      WHEN v_party_id IS NOT NULL THEN inventory_party_used(v_party_id, v_total.item_id)
      ELSE inventory_customer_used(v_lead_id, v_total.item_id)
    END;
    IF v_used < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'This % has only % % of % (asked to return %).',
        CASE WHEN v_party_id IS NOT NULL THEN 'party' ELSE 'customer' END,
        trim_scale(v_used), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'return');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, lead_id, party_id, movement_date, notes, created_by)
  VALUES (
    v_company, 'return', v_no, v_lead_id, v_party_id,
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_condition := COALESCE(v_line ->> 'condition', 'good')::inventory_return_condition;
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, return_condition, notes)
    VALUES (v_company, v_movement_id, v_item.id, v_qty, v_condition, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = CASE WHEN v_condition = 'good' THEN 'in_stock'::serial_status ELSE 'defective'::serial_status END,
          current_lead_id = NULL,
          current_party_id = NULL
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead_id, 'inventory_return', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count, 'party_id', v_party_id));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Reverse: restore party serials correctly
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_reverse_movement(p_movement_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_m inventory_movements%ROWTYPE;
  v_line RECORD;
  v_bad RECORD;
  v_item inventory_items%ROWTYPE;
  v_new_id UUID;
  v_new_line_id UUID;
  v_no TEXT;
  v_removed TEXT[] := '{}';
  v_used NUMERIC;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse an entry.';
  END IF;

  SELECT * INTO v_m FROM inventory_movements
  WHERE id = p_movement_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;
  IF v_m.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already reversed.', v_m.movement_no;
  END IF;
  IF v_m.movement_type NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Only inward, dispatch and return entries can be reversed. Record an adjustment instead.';
  END IF;

  PERFORM 1 FROM inventory_items
  WHERE id IN (SELECT item_id FROM inventory_movement_lines WHERE movement_id = v_m.id)
  ORDER BY id FOR UPDATE;

  PERFORM 1 FROM inventory_serials
  WHERE id IN (
    SELECT ls.serial_id FROM inventory_movement_line_serials ls
    JOIN inventory_movement_lines ml ON ml.id = ls.line_id
    WHERE ml.movement_id = v_m.id
  )
  ORDER BY id FOR UPDATE;

  SELECT s.serial_no INTO v_bad
  FROM inventory_movement_line_serials ls
  JOIN inventory_movement_lines ml ON ml.id = ls.line_id
  JOIN inventory_serials s ON s.id = ls.serial_id
  WHERE ml.movement_id = v_m.id
    AND EXISTS (
      SELECT 1
      FROM inventory_movement_line_serials ls2
      JOIN inventory_movement_lines ml2 ON ml2.id = ls2.line_id
      JOIN inventory_movements m2 ON m2.id = ml2.movement_id
      WHERE ls2.serial_id = ls.serial_id
        AND m2.id <> v_m.id
        AND m2.created_at > v_m.created_at
        AND m2.reversed_by_id IS NULL
        AND m2.movement_type <> 'reversal'
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Serial % has moved since %. Reverse the later entries first.', v_bad.serial_no, v_m.movement_no;
  END IF;

  FOR v_line IN
    SELECT ml.item_id, SUM(ml.quantity_delta) AS delta,
           SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS stock_delta
    FROM inventory_movement_lines ml
    JOIN inventory_items i ON i.id = ml.item_id
    WHERE ml.movement_id = v_m.id AND NOT i.track_serials
    GROUP BY ml.item_id
  LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = v_line.item_id;
    IF COALESCE(v_line.stock_delta, 0) > 0
       AND inventory_bulk_on_hand(v_line.item_id) - v_line.stock_delta < 0 THEN
      RAISE EXCEPTION 'Not enough % left in stock to reverse %.', v_item.name, v_m.movement_no;
    END IF;
    IF v_m.movement_type = 'dispatch' THEN
      v_used := CASE
        WHEN v_m.party_id IS NOT NULL THEN inventory_party_used(v_m.party_id, v_line.item_id)
        ELSE inventory_customer_used(v_m.lead_id, v_line.item_id)
      END;
      IF v_used + v_line.delta < 0 THEN
        RAISE EXCEPTION 'Some % from % was already returned. Reverse the return first.', v_item.name, v_m.movement_no;
      END IF;
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'reversal');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, party_id, movement_date, reason, notes, reverses_id, created_by
  ) VALUES (
    v_company, 'reversal', v_no, v_m.lead_id, v_m.party_id, CURRENT_DATE, v_reason,
    'Reversal of ' || v_m.movement_no, v_m.id, auth.uid()
  ) RETURNING id INTO v_new_id;

  FOR v_line IN SELECT * FROM inventory_movement_lines WHERE movement_id = v_m.id LOOP
    INSERT INTO inventory_movement_lines (
      company_id, movement_id, item_id, quantity_delta, return_condition, serial_action, notes
    ) VALUES (
      v_company, v_new_id, v_line.item_id, -v_line.quantity_delta, v_line.return_condition, v_line.serial_action,
      'Reversal of ' || v_m.movement_no
    ) RETURNING id INTO v_new_line_id;

    IF v_m.movement_type = 'inward' THEN
      SELECT v_removed || COALESCE(array_agg(s.serial_no::TEXT), '{}'::TEXT[]) INTO v_removed
      FROM inventory_movement_line_serials ls JOIN inventory_serials s ON s.id = ls.serial_id
      WHERE ls.line_id = v_line.id;

      DELETE FROM inventory_movement_line_serials
      WHERE serial_id IN (SELECT id FROM inventory_serials WHERE inward_line_id = v_line.id);
      DELETE FROM inventory_serials WHERE inward_line_id = v_line.id;
    ELSE
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_new_line_id, ls.serial_id
      FROM inventory_movement_line_serials ls WHERE ls.line_id = v_line.id;

      IF v_m.movement_type = 'dispatch' THEN
        UPDATE inventory_serials
        SET status = 'in_stock', current_lead_id = NULL, current_party_id = NULL
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      ELSE
        UPDATE inventory_serials
        SET status = 'dispatched',
            current_lead_id = v_m.lead_id,
            current_party_id = v_m.party_id
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      END IF;
    END IF;
  END LOOP;

  UPDATE inventory_movements SET reversed_by_id = v_new_id WHERE id = v_m.id;

  PERFORM inventory__audit(v_company, v_m.lead_id, 'inventory_reversal', v_new_id,
    jsonb_build_object('movement_no', v_no, 'reverses', v_m.movement_no, 'reason', v_reason,
                       'removed_serials', to_jsonb(v_removed), 'party_id', v_m.party_id));

  RETURN jsonb_build_object('id', v_new_id, 'movement_no', v_no);
END;
$$;

-- ------------------------------------------------------------
-- Serial check: optional party for return mode
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS inventory_check_serials(UUID, TEXT[], TEXT, UUID);

CREATE OR REPLACE FUNCTION inventory_check_serials(
  p_item_id UUID,
  p_serials TEXT[],
  p_mode TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_party_id UUID DEFAULT NULL
)
RETURNS TABLE (input TEXT, serial_no TEXT, ok BOOLEAN, message TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('view_inventory');
BEGIN
  IF p_mode NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Unknown check mode.';
  END IF;
  IF p_mode = 'return' AND p_lead_id IS NULL AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Return check needs a customer or party.';
  END IF;

  RETURN QUERY
  SELECT
    t.raw,
    normalize_serial(t.raw),
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN false
      WHEN p_mode = 'inward' THEN s.id IS NULL
      WHEN s.id IS NULL THEN false
      WHEN s.item_id <> p_item_id THEN false
      WHEN p_mode = 'dispatch' THEN s.status = 'in_stock'
      WHEN p_party_id IS NOT NULL THEN
        s.status = 'dispatched' AND s.current_party_id = p_party_id
      ELSE s.status = 'dispatched' AND s.current_lead_id = p_lead_id
    END,
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN 'Empty scan'
      WHEN p_mode = 'inward' AND s.id IS NOT NULL THEN
        'Already in inventory (' || i.name || ', ' || replace(s.status::TEXT, '_', ' ') || ')'
      WHEN p_mode = 'inward' THEN NULL
      WHEN s.id IS NULL THEN 'Not in inventory'
      WHEN s.item_id <> p_item_id THEN 'Belongs to ' || i.name
      WHEN p_mode = 'dispatch' AND s.status = 'dispatched' THEN
        'Already dispatched to ' || COALESCE(l.name, p.name, 'a destination')
      WHEN p_mode = 'dispatch' AND s.status <> 'in_stock' THEN 'Marked ' || s.status::TEXT
      WHEN p_mode = 'return' AND p_party_id IS NOT NULL
           AND (s.status <> 'dispatched' OR s.current_party_id IS DISTINCT FROM p_party_id) THEN
        'Not at this company / dealer / vendor'
      WHEN p_mode = 'return' AND p_lead_id IS NOT NULL
           AND (s.status <> 'dispatched' OR s.current_lead_id IS DISTINCT FROM p_lead_id) THEN
        'Not at this customer'
      ELSE NULL
    END
  FROM unnest(p_serials) WITH ORDINALITY AS t(raw, ord)
  LEFT JOIN inventory_serials s ON s.company_id = v_company AND s.serial_no = normalize_serial(t.raw)
  LEFT JOIN inventory_items i ON i.id = s.item_id
  LEFT JOIN leads l ON l.id = s.current_lead_id
  LEFT JOIN inventory_parties p ON p.id = s.current_party_id
  ORDER BY t.ord;
END;
$$;

-- On-Floor after dispatch already skips when lead_id IS NULL (023). Keep explicit.
CREATE OR REPLACE FUNCTION on_floor_ensure_row_after_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff BOOLEAN;
BEGIN
  IF NEW.movement_type::text <> 'dispatch' OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT sales_handoff_complete INTO v_handoff
  FROM leads
  WHERE id = NEW.lead_id AND company_id = NEW.company_id;
  IF COALESCE(v_handoff, false) THEN
    INSERT INTO on_floor_milestones (company_id, lead_id)
    VALUES (NEW.company_id, NEW.lead_id)
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION inventory_can_manage_parties() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_party_lookup(TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_party_used(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_party_lookup(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_dispatch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_return(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_reverse_movement(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Movement search: party_id / party_name (extends 057 / 022)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS inventory_search_movements(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION inventory_search_movements(
  p_query TEXT,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  movement_no TEXT,
  movement_type TEXT,
  movement_date DATE,
  created_at TIMESTAMPTZ,
  is_opening_stock BOOLEAN,
  lead_id UUID,
  party_id UUID,
  customer_name TEXT,
  party_name TEXT,
  supplier_name TEXT,
  reversed BOOLEAN,
  line_count BIGINT,
  serial_count BIGINT,
  match_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_serial TEXT;
  v_type TEXT := NULLIF(btrim(COALESCE(p_type, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_company IS NULL OR NOT (
    auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF v_q IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) > 80 THEN
    v_q := left(v_q, 80);
  END IF;

  v_serial := normalize_serial(v_q);

  RETURN QUERY
  WITH matched AS (
    SELECT
      m.id AS mid,
      CASE
        WHEN m.movement_no ILIKE '%' || v_q || '%' THEN 'movement_no'
        WHEN EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        ) THEN 'serial'
        WHEN EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        ) THEN 'party'
        ELSE 'item_spec'
      END AS reason
    FROM inventory_movements m
    WHERE m.company_id = v_company
      AND (v_type IS NULL OR m.movement_type::TEXT = v_type)
      AND (
        m.movement_no ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_items i ON i.id = ml.item_id
          WHERE ml.movement_id = m.id
            AND (
              i.name ILIKE '%' || v_q || '%'
              OR COALESCE(i.sku, '') ILIKE '%' || v_q || '%'
              OR i.specifications::TEXT ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        )
      )
  )
  SELECT
    m.id,
    m.movement_no::TEXT,
    m.movement_type::TEXT,
    m.movement_date,
    m.created_at,
    m.is_opening_stock,
    m.lead_id,
    m.party_id,
    l.name::TEXT AS customer_name,
    p.name::TEXT AS party_name,
    m.supplier_name::TEXT,
    (m.reversed_by_id IS NOT NULL) AS reversed,
    (SELECT count(*)::BIGINT FROM inventory_movement_lines ml WHERE ml.movement_id = m.id) AS line_count,
    (
      SELECT count(*)::BIGINT
      FROM inventory_movement_lines ml
      JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
      WHERE ml.movement_id = m.id
    ) AS serial_count,
    matched.reason::TEXT AS match_reason
  FROM matched
  JOIN inventory_movements m ON m.id = matched.mid
  LEFT JOIN leads l ON l.id = m.lead_id
  LEFT JOIN inventory_parties p ON p.id = m.party_id
  ORDER BY m.movement_date DESC, m.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) TO authenticated;


-- END 081_inventory_parties.sql

-- ############################################################################
-- BEGIN 082_inventory_item_name_per_subcategory.sql
-- ############################################################################

-- ============================================================
-- 061_inventory_item_name_per_subcategory.sql
-- handover: 026_inventory_item_name_per_subcategory.sql
-- Allow the same item name under different sub-categories
-- (e.g. Polycab under multiple inverter sub-categories).
-- Same name + same sub-category (or both null) stays unique.
-- Requires 048/013 + 059/024 (subcategory_id column).
-- ============================================================

DROP INDEX IF EXISTS inventory_items_company_name_uq;

-- NULL subcategory treated as one bucket (sentinel UUID).
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_name_sub_uq
  ON inventory_items (
    company_id,
    lower(name),
    (COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- Opening import: only reject when name collides in the same sub-category
CREATE OR REPLACE FUNCTION inventory_import_opening_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
  v_new JSONB;
  v_map JSONB := '{}'::jsonb;
  v_item_id UUID;
  v_resolved JSONB := '[]'::jsonb;
  v_line JSONB;
  v_group RECORD;
  v_result JSONB;
  v_all_serials TEXT[] := '{}';
  v_dup TEXT;
  v_movements INT := 0;
  v_serials INT := 0;
  v_items_created INT := 0;
  v_header JSONB;
  v_sub UUID;
BEGIN
  IF jsonb_typeof(payload -> 'new_items') = 'array' AND jsonb_array_length(payload -> 'new_items') > 0 THEN
    IF NOT has_authority('manage_inventory_items') THEN
      RAISE EXCEPTION 'Creating new items needs the Manage Inventory Items permission.' USING ERRCODE = '42501';
    END IF;
    FOR v_new IN SELECT * FROM jsonb_array_elements(payload -> 'new_items') LOOP
      IF NULLIF(btrim(v_new ->> 'name'), '') IS NULL OR NULLIF(v_new ->> 'key', '') IS NULL THEN
        RAISE EXCEPTION 'Each new item needs a name.';
      END IF;
      v_sub := NULLIF(v_new ->> 'subcategory_id', '')::UUID;
      IF EXISTS (
        SELECT 1 FROM inventory_items
        WHERE company_id = v_company
          AND lower(name) = lower(btrim(v_new ->> 'name'))
          AND subcategory_id IS NOT DISTINCT FROM v_sub
      ) THEN
        RAISE EXCEPTION
          'Item "%" already exists in this sub-category. Map the rows to it instead of creating it.',
          btrim(v_new ->> 'name');
      END IF;
      INSERT INTO inventory_items (
        company_id, name, sku, master_group_id, category_id, subcategory_id, brand_id,
        unit_type, low_stock_threshold, specifications, created_by
      ) VALUES (
        v_company,
        btrim(v_new ->> 'name'),
        NULLIF(btrim(v_new ->> 'sku'), ''),
        NULLIF(v_new ->> 'master_group_id', '')::UUID,
        NULLIF(v_new ->> 'category_id', '')::UUID,
        v_sub,
        NULLIF(v_new ->> 'brand_id', '')::UUID,
        COALESCE(NULLIF(v_new ->> 'unit_type', ''), 'nos')::inventory_unit,
        COALESCE(NULLIF(v_new ->> 'low_stock_threshold', '')::NUMERIC, 0),
        COALESCE(v_new -> 'specifications', '{}'::jsonb),
        auth.uid()
      ) RETURNING id INTO v_item_id;
      v_map := jsonb_set(v_map, ARRAY[v_new ->> 'key'], to_jsonb(v_item_id::TEXT));
      v_items_created := v_items_created + 1;
    END LOOP;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line ->> 'item_id', '') IS NULL THEN
      IF NOT v_map ? COALESCE(v_line ->> 'item_key', '') THEN
        RAISE EXCEPTION 'A row is not matched to an item.';
      END IF;
      v_line := jsonb_set(v_line, '{item_id}', v_map -> (v_line ->> 'item_key'));
    END IF;
    v_resolved := v_resolved || jsonb_build_array(v_line);
    v_all_serials := v_all_serials || inventory__line_serials(v_line);
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s WHERE s IS NOT NULL GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % appears more than once in the file.', v_dup;
  END IF;

  v_header := jsonb_build_object(
    'supplier_name', 'Opening stock',
    'movement_date', payload ->> 'movement_date',
    'notes', 'Excel import' || COALESCE(': ' || NULLIF(btrim(payload ->> 'file_name'), ''), '')
  );

  FOR v_group IN
    SELECT l ->> 'item_id' AS item_id, jsonb_agg(l) AS lines
    FROM jsonb_array_elements(v_resolved) l
    GROUP BY l ->> 'item_id'
  LOOP
    v_result := inventory__post_inward(v_company, v_header, v_group.lines, true);
    v_movements := v_movements + 1;
    v_serials := v_serials + COALESCE((v_result ->> 'serials')::INT, 0);
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_opening_import', NULL,
    jsonb_build_object('file_name', payload ->> 'file_name', 'movements', v_movements,
                       'serials', v_serials, 'items_created', v_items_created,
                       'rows', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object(
    'movements', v_movements, 'serials', v_serials, 'items_created', v_items_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inventory_import_opening_stock(JSONB) TO authenticated;


-- END 082_inventory_item_name_per_subcategory.sql

-- ############################################################################
-- BEGIN 083_inventory_delete_item_relaxed.sql
-- ############################################################################

-- ============================================================
-- 062_inventory_delete_item_relaxed.sql
-- handover: 027_inventory_delete_item_relaxed.sql
-- Allow hard-delete when the item has no live stock trail:
-- only reversed movements (or none), and no serial rows left.
-- Requires 018 / 053.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_delete_item(p_item_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT is_active_user() OR NOT has_authority('manage_inventory_items') THEN
    RAISE EXCEPTION 'You do not have permission to delete inventory items.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name
  FROM inventory_items
  WHERE id = p_item_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inventory_movement_lines ml
    JOIN inventory_movements m ON m.id = ml.movement_id
    WHERE ml.item_id = p_item_id
      AND m.company_id = v_company
      AND m.reversed_by_id IS NULL
      AND m.movement_type::text <> 'reversal'
  ) OR EXISTS (
    SELECT 1 FROM inventory_serials WHERE item_id = p_item_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION
      'ITEM_HAS_HISTORY: % has stock entries, so it cannot be deleted. Mark it inactive instead.',
      v_name;
  END IF;

  -- Cleared trail (reversed-only lines): remove orphan line/serial links then the item.
  DELETE FROM inventory_movement_line_serials mls
  USING inventory_movement_lines ml
  WHERE mls.line_id = ml.id AND ml.item_id = p_item_id;

  DELETE FROM inventory_inward_costs c
  USING inventory_movement_lines ml
  WHERE c.line_id = ml.id AND ml.item_id = p_item_id;

  DELETE FROM inventory_movement_lines WHERE item_id = p_item_id;
  DELETE FROM inventory_item_costs WHERE item_id = p_item_id AND company_id = v_company;
  DELETE FROM inventory_items WHERE id = p_item_id AND company_id = v_company;

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION inventory_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_delete_item(UUID) TO authenticated;


-- END 083_inventory_delete_item_relaxed.sql

-- ############################################################################
-- BEGIN 084_inventory_party_create_return_address.sql
-- ############################################################################

-- ============================================================
-- 063_inventory_party_create_return_address.sql
-- handover: 028_inventory_party_create_return_address.sql
-- Return address + gstin from inventory_create_party JSON.
-- Requires 060 / 025.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_create_party(
  p_name TEXT,
  p_kind TEXT DEFAULT 'dealer',
  p_phone TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_gstin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_kind inventory_party_kind;
  v_row inventory_parties%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_parties() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory parties.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Party name is required.';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'Party name is too long.';
  END IF;
  BEGIN
    v_kind := COALESCE(NULLIF(btrim(p_kind), ''), 'dealer')::inventory_party_kind;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Kind must be company, dealer or vendor.';
  END;

  SELECT * INTO v_row FROM inventory_parties
  WHERE company_id = v_company AND lower(btrim(name)) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_row.is_active THEN
      UPDATE inventory_parties SET is_active = true, kind = v_kind, updated_at = NOW()
      WHERE id = v_row.id RETURNING * INTO v_row;
    END IF;
    -- Fill blank address/GSTIN if provided on re-add of an inactive/idempotent name
    IF (
      (v_row.address IS NULL AND NULLIF(btrim(COALESCE(p_address, '')), '') IS NOT NULL)
      OR (v_row.gstin IS NULL AND NULLIF(btrim(COALESCE(p_gstin, '')), '') IS NOT NULL)
      OR (v_row.city IS NULL AND NULLIF(btrim(COALESCE(p_city, '')), '') IS NOT NULL)
      OR (v_row.phone IS NULL AND NULLIF(btrim(COALESCE(p_phone, '')), '') IS NOT NULL)
    ) THEN
      UPDATE inventory_parties SET
        phone = COALESCE(phone, NULLIF(btrim(COALESCE(p_phone, '')), '')),
        city = COALESCE(city, NULLIF(btrim(COALESCE(p_city, '')), '')),
        address = COALESCE(address, NULLIF(btrim(COALESCE(p_address, '')), '')),
        gstin = COALESCE(gstin, NULLIF(btrim(COALESCE(p_gstin, '')), '')),
        updated_at = NOW()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
      'phone', v_row.phone, 'city', v_row.city,
      'address', v_row.address, 'gstin', v_row.gstin,
      'idempotent', true
    );
  END IF;

  INSERT INTO inventory_parties (company_id, kind, name, phone, city, address, gstin)
  VALUES (
    v_company, v_kind, v_name,
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_gstin, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
    'phone', v_row.phone, 'city', v_row.city,
    'address', v_row.address, 'gstin', v_row.gstin,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- END 084_inventory_party_create_return_address.sql

-- ############################################################################
-- BEGIN 085_inventory_item_master_revisions.sql
-- ############################################################################

-- ============================================================
-- 064_inventory_item_master_revisions.sql
-- handover: 029_inventory_item_master_revisions.sql
-- GST % on item costs; require Master→Category→Sub-Category;
-- serial tracking from master group OR category (Panel/Inverter).
-- Requires 059/024 + 061/026.
-- ============================================================

ALTER TABLE inventory_item_costs
  ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5,2)
  CHECK (gst_percent IS NULL OR (gst_percent >= 0 AND gst_percent <= 100));

COMMENT ON COLUMN inventory_item_costs.gst_percent IS
  'Default GST % for this item (ex-GST purchase cost lives in default_unit_cost). Null = no tax / treat as 0 for display.';

-- ------------------------------------------------------------
-- Item write trigger: require hierarchy; serial from master OR category
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
  v_master_name TEXT;
  v_cat_master UUID;
  v_sub_cat UUID;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.master_group_id IS NULL THEN
    RAISE EXCEPTION 'Choose a master group.';
  END IF;
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Choose a category.';
  END IF;
  IF NEW.subcategory_id IS NULL THEN
    RAISE EXCEPTION 'Choose a sub-category.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_master_groups
    WHERE id = NEW.master_group_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  SELECT name INTO v_master_name
  FROM inventory_master_groups
  WHERE id = NEW.master_group_id AND company_id = NEW.company_id;

  SELECT name, master_group_id INTO v_category_name, v_cat_master
  FROM quote_item_categories
  WHERE id = NEW.category_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF v_cat_master IS NOT NULL THEN
    IF NEW.master_group_id IS DISTINCT FROM v_cat_master THEN
      RAISE EXCEPTION 'Category belongs to a different master group.';
    END IF;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Group not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  SELECT category_id INTO v_sub_cat
  FROM inventory_subcategories
  WHERE id = NEW.subcategory_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-category not found.';
  END IF;
  IF v_sub_cat IS DISTINCT FROM NEW.category_id THEN
    RAISE EXCEPTION 'Sub-category does not belong to the selected category.';
  END IF;

  NEW.track_serials :=
    COALESCE(lower(btrim(v_master_name)) ~ '^(panel|inverter)s?$', false)
    OR COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
  IF NEW.track_serials THEN
    NEW.unit_type := 'nos';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.track_serials IS DISTINCT FROM OLD.track_serials OR NEW.unit_type IS DISTINCT FROM OLD.unit_type)
     AND EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = NEW.id)
  THEN
    RAISE EXCEPTION 'This item already has stock entries, so its type (serial or bulk) and unit cannot change.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


-- END 085_inventory_item_master_revisions.sql

-- ############################################################################
-- BEGIN 086_inventory_brand_label_group.sql
-- ############################################################################

-- ============================================================
-- 065_inventory_brand_label_group.sql
-- handover: 030_inventory_brand_label_group.sql
-- User-facing label: Brand → Group (column brand_id / quote_brands unchanged).
-- Requires 059/024 (+ 064/029 if applied).
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_create_brand(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row quote_brands%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Group name is required.';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Group name is too long.';
  END IF;

  SELECT * INTO v_row FROM quote_brands
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', true);
  END IF;

  INSERT INTO quote_brands (company_id, name)
  VALUES (v_company, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', false);
END;
$$;

-- Align trigger message with Group label (full body from 064).
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
  v_master_name TEXT;
  v_cat_master UUID;
  v_sub_cat UUID;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.master_group_id IS NULL THEN
    RAISE EXCEPTION 'Choose a master group.';
  END IF;
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Choose a category.';
  END IF;
  IF NEW.subcategory_id IS NULL THEN
    RAISE EXCEPTION 'Choose a sub-category.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_master_groups
    WHERE id = NEW.master_group_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  SELECT name INTO v_master_name
  FROM inventory_master_groups
  WHERE id = NEW.master_group_id AND company_id = NEW.company_id;

  SELECT name, master_group_id INTO v_category_name, v_cat_master
  FROM quote_item_categories
  WHERE id = NEW.category_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF v_cat_master IS NOT NULL THEN
    IF NEW.master_group_id IS DISTINCT FROM v_cat_master THEN
      RAISE EXCEPTION 'Category belongs to a different master group.';
    END IF;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Group not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  SELECT category_id INTO v_sub_cat
  FROM inventory_subcategories
  WHERE id = NEW.subcategory_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-category not found.';
  END IF;
  IF v_sub_cat IS DISTINCT FROM NEW.category_id THEN
    RAISE EXCEPTION 'Sub-category does not belong to the selected category.';
  END IF;

  NEW.track_serials :=
    COALESCE(lower(btrim(v_master_name)) ~ '^(panel|inverter)s?$', false)
    OR COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
  IF NEW.track_serials THEN
    NEW.unit_type := 'nos';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.track_serials IS DISTINCT FROM OLD.track_serials OR NEW.unit_type IS DISTINCT FROM OLD.unit_type)
     AND EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = NEW.id)
  THEN
    RAISE EXCEPTION 'This item already has stock entries, so its type (serial or bulk) and unit cannot change.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


-- END 086_inventory_brand_label_group.sql

-- ############################################################################
-- BEGIN 087_inventory_movement_search_customer.sql
-- ############################################################################

-- Movement search: also match CRM customer (lead) name.
-- Extends inventory_search_movements from 060_inventory_parties.sql.

DROP FUNCTION IF EXISTS inventory_search_movements(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION inventory_search_movements(
  p_query TEXT,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  movement_no TEXT,
  movement_type TEXT,
  movement_date DATE,
  created_at TIMESTAMPTZ,
  is_opening_stock BOOLEAN,
  lead_id UUID,
  party_id UUID,
  customer_name TEXT,
  party_name TEXT,
  supplier_name TEXT,
  reversed BOOLEAN,
  line_count BIGINT,
  serial_count BIGINT,
  match_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_serial TEXT;
  v_type TEXT := NULLIF(btrim(COALESCE(p_type, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_company IS NULL OR NOT (
    auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF v_q IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) > 80 THEN
    v_q := left(v_q, 80);
  END IF;

  v_serial := normalize_serial(v_q);

  RETURN QUERY
  WITH matched AS (
    SELECT
      m.id AS mid,
      CASE
        WHEN m.movement_no ILIKE '%' || v_q || '%' THEN 'movement_no'
        WHEN EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        ) THEN 'serial'
        WHEN EXISTS (
          SELECT 1 FROM leads cust
          WHERE cust.id = m.lead_id
            AND cust.company_id = v_company
            AND cust.name ILIKE '%' || v_q || '%'
        ) THEN 'customer'
        WHEN EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        ) THEN 'party'
        ELSE 'item_spec'
      END AS reason
    FROM inventory_movements m
    WHERE m.company_id = v_company
      AND (v_type IS NULL OR m.movement_type::TEXT = v_type)
      AND (
        m.movement_no ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_items i ON i.id = ml.item_id
          WHERE ml.movement_id = m.id
            AND (
              i.name ILIKE '%' || v_q || '%'
              OR COALESCE(i.sku, '') ILIKE '%' || v_q || '%'
              OR i.specifications::TEXT ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1 FROM leads cust
          WHERE cust.id = m.lead_id
            AND cust.company_id = v_company
            AND cust.name ILIKE '%' || v_q || '%'
        )
        OR EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        )
      )
  )
  SELECT
    m.id,
    m.movement_no::TEXT,
    m.movement_type::TEXT,
    m.movement_date,
    m.created_at,
    m.is_opening_stock,
    m.lead_id,
    m.party_id,
    l.name::TEXT AS customer_name,
    p.name::TEXT AS party_name,
    m.supplier_name::TEXT,
    (m.reversed_by_id IS NOT NULL) AS reversed,
    (SELECT count(*)::BIGINT FROM inventory_movement_lines ml WHERE ml.movement_id = m.id) AS line_count,
    (
      SELECT count(*)::BIGINT
      FROM inventory_movement_lines ml
      JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
      WHERE ml.movement_id = m.id
    ) AS serial_count,
    matched.reason::TEXT AS match_reason
  FROM matched
  JOIN inventory_movements m ON m.id = matched.mid
  LEFT JOIN leads l ON l.id = m.lead_id
  LEFT JOIN inventory_parties p ON p.id = m.party_id
  ORDER BY m.movement_date DESC, m.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) TO authenticated;


-- END 087_inventory_movement_search_customer.sql

-- ############################################################################
-- BEGIN 088_rename_company_rk_bhabhor.sql
-- ############################################################################

-- Rename display tenant from RK Solar → RK Bhabhor (live catch-up).
-- Slug stays rk-solar (technical / deploy identity).

UPDATE public.companies
SET name = 'RK Bhabhor'
WHERE id = 'a0000000-0000-4000-8000-000000000001'
  AND name IS DISTINCT FROM 'RK Bhabhor';

UPDATE public.quotation_company_settings
SET from_name = 'RK Bhabhor'
WHERE company_id = 'a0000000-0000-4000-8000-000000000001'
  AND (from_name IS NULL OR from_name = '' OR from_name = 'RK Solar');


-- END 088_rename_company_rk_bhabhor.sql

-- ############################################################################
-- ADMIN BOOTSTRAP — auth.users + identity + profile role_id fix
-- ############################################################################

DO $$
DECLARE
  v_uid UUID := gen_random_uuid();
  v_email TEXT := 'admin@dyzensolar.com';
  v_password TEXT := 'test@123';
  v_company UUID := 'a0000000-0000-4000-8000-000000000001';
  v_admin_role UUID;
  v_instance UUID;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  IF v_instance IS NULL THEN
    v_instance := '00000000-0000-0000-0000-000000000000';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_email)) THEN
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
    RAISE NOTICE 'Admin user already exists: % (%)', v_email, v_uid;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      invited_at, confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
      phone, phone_confirmed_at, email_change_token_current, email_change_confirm_status,
      banned_until, reauthentication_token, is_sso_user, deleted_at, is_anonymous
    ) VALUES (
      v_instance, v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), NOW(), NULL, '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', 'Admin', 'phone', '', 'role', 'admin', 'company_id', v_company::text),
      false, NOW(), NOW(), NULL, NULL, '', 0, NULL, '', false, NULL, false
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uid, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', v_uid::text, NOW(), NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created Admin user: % (%)', v_email, v_uid;
  END IF;

  UPDATE public.companies SET email = v_email, name = 'RK Bhabhor' WHERE id = v_company;

  SELECT id INTO v_admin_role FROM public.roles WHERE company_id = v_company AND slug = 'admin' LIMIT 1;

  UPDATE public.profiles
  SET company_id = v_company, email = v_email,
      name = COALESCE(NULLIF(TRIM(name), ''), 'Admin'),
      role = 'admin', role_id = COALESCE(v_admin_role, role_id), is_active = true
  WHERE id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, company_id, name, email, phone, role, role_id, is_active)
    VALUES (v_uid, v_company, 'Admin', v_email, '', 'admin', v_admin_role, true)
    ON CONFLICT (id) DO UPDATE
      SET company_id = EXCLUDED.company_id, email = EXCLUDED.email, role = 'admin',
          role_id = COALESCE(EXCLUDED.role_id, public.profiles.role_id), is_active = true;
  END IF;
END;
$$;

SELECT u.id, u.email, u.email_confirmed_at IS NOT NULL AS email_confirmed,
       p.role, p.company_id, r.slug AS role_slug
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.roles r ON r.id = p.role_id
WHERE lower(u.email) = lower('admin@dyzensolar.com');
