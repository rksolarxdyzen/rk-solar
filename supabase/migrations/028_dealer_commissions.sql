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
