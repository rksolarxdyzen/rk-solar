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
