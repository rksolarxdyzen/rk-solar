-- ============================================================
-- 090_ad_campaign_submissions.sql
-- Public ad landing enquiries + staff inbox authority
-- ============================================================

INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_ad_submissions', 'View ad campaign enquiries', 'sales')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_ad_submissions', true
FROM roles r
WHERE r.slug IN ('admin', 'sales_manager') AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Optional campaign-only role (no CRM keys)
INSERT INTO roles (company_id, name, slug, description, is_system)
SELECT id, 'Ad Campaign', 'ad-campaign', 'Ad landing enquiries inbox only', true
FROM companies
ON CONFLICT (company_id, slug) DO NOTHING;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_ad_submissions', true
FROM roles r
WHERE r.slug = 'ad-campaign' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Mirror onto users who already have explicit user_authorities rows
INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, 'view_ad_submissions', true
FROM profiles p
JOIN role_authorities ra ON ra.role_id = p.role_id AND ra.granted = true
WHERE ra.authority_key = 'view_ad_submissions'
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ad_campaign_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  city text,
  capacity_interest text,
  message text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'junk')),
  campaign text NOT NULL DEFAULT 'default',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  fbclid text,
  landing_path text NOT NULL DEFAULT '/go',
  user_agent text,
  ip_hash text,
  contacted_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS ad_campaign_submissions_company_created_idx
  ON ad_campaign_submissions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaign_submissions_company_status_idx
  ON ad_campaign_submissions (company_id, status);
CREATE INDEX IF NOT EXISTS ad_campaign_submissions_company_phone_idx
  ON ad_campaign_submissions (company_id, phone);

ALTER TABLE ad_campaign_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_campaign_submissions_select ON ad_campaign_submissions;
CREATE POLICY ad_campaign_submissions_select ON ad_campaign_submissions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      has_authority('full_access')
      OR has_authority('view_ad_submissions')
    )
  );

DROP POLICY IF EXISTS ad_campaign_submissions_update ON ad_campaign_submissions;
CREATE POLICY ad_campaign_submissions_update ON ad_campaign_submissions
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      has_authority('full_access')
      OR has_authority('view_ad_submissions')
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      has_authority('full_access')
      OR has_authority('view_ad_submissions')
    )
  );

-- No anon INSERT/SELECT policies — public submits via service-role API only.
GRANT SELECT, UPDATE ON ad_campaign_submissions TO authenticated;
GRANT ALL ON ad_campaign_submissions TO service_role;
