-- RK Solar — Phase 2 dual assignee (tele-caller vs surveyor)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_telecaller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_surveyor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Backfill: existing assigned_to becomes tele-caller
UPDATE leads
SET assigned_telecaller_id = assigned_to
WHERE assigned_telecaller_id IS NULL AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_telecaller ON leads(assigned_telecaller_id);
CREATE INDEX IF NOT EXISTS idx_leads_surveyor ON leads(assigned_surveyor_id);

-- Keep assigned_to in sync as "primary owner" for legacy filters:
-- prefer telecaller, else surveyor
CREATE OR REPLACE FUNCTION sync_lead_assigned_to()
RETURNS TRIGGER AS $$
BEGIN
  NEW.assigned_to := COALESCE(NEW.assigned_telecaller_id, NEW.assigned_surveyor_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_leads_sync_assigned_to ON leads;
CREATE TRIGGER tr_leads_sync_assigned_to
  BEFORE INSERT OR UPDATE OF assigned_telecaller_id, assigned_surveyor_id
  ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_assigned_to();

-- Refresh leads SELECT policy for dual assignee visibility
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
    )
  );
