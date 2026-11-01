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
