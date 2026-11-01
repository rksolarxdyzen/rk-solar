-- Installation Supervisor (ops_coordinator display), richer proofs, feasibility PDF path.

UPDATE roles
SET name = 'Installation Supervisor',
    description = 'Receives finalized (pre-dispatch verified) files first and assigns installation crew'
WHERE slug = 'ops_coordinator';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS inverter_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS install_geo_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS install_geo_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS install_geo_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_serial_count INT;

COMMENT ON COLUMN public.leads.inverter_serial_number IS
  'Inverter serial captured on site (OCR assist + manual confirm)';

CREATE TABLE IF NOT EXISTS installation_panel_serials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  panel_index INT NOT NULL,
  serial_text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'ocr', 'barcode')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, panel_index)
);

CREATE INDEX IF NOT EXISTS idx_install_panel_serials_lead
  ON installation_panel_serials (lead_id);

ALTER TABLE feasibility_reports
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE installation_panel_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS install_serials_select ON installation_panel_serials;
CREATE POLICY install_serials_select ON installation_panel_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS install_serials_write ON installation_panel_serials;
CREATE POLICY install_serials_write ON installation_panel_serials FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('upload_installation_proofs')
      OR has_authority('upload_panel_barcodes')
      OR has_authority('assign_installation_crew')
      OR has_authority('complete_installation')
      OR has_authority('full_access')
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
  );
