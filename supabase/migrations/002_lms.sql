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
