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
