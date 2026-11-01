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
