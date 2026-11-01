-- Assigned installation crew can SELECT their jobs, digital surveys, and
-- survey site photos. 047 leads_select omitted assigned_crew_id (Accounts
-- clauses kept). Crew remains read-only on surveys.

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS surveys_select ON surveys;
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
          OR l.assigned_crew_id = auth.uid()
          OR l.created_by = auth.uid()
          OR has_authority('view_all_leads')
          OR has_authority('full_access')
        )
    )
  );

DROP POLICY IF EXISTS portal_docs_select ON portal_documents;
CREATE POLICY portal_docs_select ON portal_documents FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND EXISTS (
      SELECT 1
      FROM leads l
      WHERE l.id = portal_documents.lead_id
        AND l.company_id = auth_company_id()
        AND (
          has_authority('view_all_leads')
          OR has_authority('full_access')
          OR has_authority('manage_portal_documents')
          OR has_authority('view_customer_portal_admin')
          OR has_authority('manage_liaison')
          OR l.assigned_telecaller_id = auth.uid()
          OR l.assigned_surveyor_id = auth.uid()
          OR l.assigned_to = auth.uid()
          OR l.assigned_crew_id = auth.uid()
          OR l.created_by = auth.uid()
        )
    )
  );
