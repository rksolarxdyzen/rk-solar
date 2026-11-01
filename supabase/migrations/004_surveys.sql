-- RK Solar — Phase 3 digital survey stub

CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  surveyed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  total_terrace_sqft NUMERIC(12, 2),
  shadow_free_sqft NUMERIC(12, 2),
  capacity_kw NUMERIC(8, 2),
  feasibility_pass BOOLEAN,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id)
);

CREATE INDEX idx_surveys_company ON surveys(company_id);
CREATE INDEX idx_surveys_lead ON surveys(lead_id);

CREATE TRIGGER tr_surveys_updated
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY surveys_select ON surveys FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = surveys.lead_id
        AND l.company_id = auth_company_id()
        AND (
          l.assigned_telecaller_id = auth.uid()
          OR l.assigned_surveyor_id = auth.uid()
          OR l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
          OR has_authority('view_all_leads')
          OR has_authority('full_access')
        )
    )
  );

CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND has_authority('conduct_survey')
  );

CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND has_authority('conduct_survey')
  );

CREATE POLICY surveys_delete ON surveys FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (has_authority('full_access') OR has_authority('delete_leads'))
  );
