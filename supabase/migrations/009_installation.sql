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
