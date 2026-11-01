-- Digital survey: assignees / lead owners can capture, not only conduct_survey holders.
-- Matches product: anyone who can see or is assigned the lead can open the digital form.

DROP POLICY IF EXISTS surveys_insert ON surveys;
CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('conduct_survey')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = surveys.lead_id
          AND l.company_id = surveys.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );

DROP POLICY IF EXISTS surveys_update ON surveys;
CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('conduct_survey')
      OR has_authority('full_access')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = surveys.lead_id
          AND l.company_id = surveys.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );

-- Survey site photos: lead owners can write without conduct_survey / move_lead_stage
DROP POLICY IF EXISTS portal_docs_write ON portal_documents;
CREATE POLICY portal_docs_write ON portal_documents FOR ALL
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('manage_portal_documents')
      OR has_authority('full_access')
      OR has_authority('conduct_survey')
      OR has_authority('move_lead_stage')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = portal_documents.lead_id
          AND l.company_id = portal_documents.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('manage_portal_documents')
      OR has_authority('full_access')
      OR has_authority('conduct_survey')
      OR has_authority('move_lead_stage')
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = portal_documents.lead_id
          AND l.company_id = portal_documents.company_id
          AND (
            l.assigned_surveyor_id = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_to = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );
