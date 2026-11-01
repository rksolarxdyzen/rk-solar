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
