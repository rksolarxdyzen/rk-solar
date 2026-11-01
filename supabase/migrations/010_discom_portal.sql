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
