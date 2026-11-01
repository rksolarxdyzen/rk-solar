-- RK Solar — customer portal document uploads + staff Docs tab

ALTER TABLE portal_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_customer BOOLEAN NOT NULL DEFAULT false;

-- Staff who can open the lead can see documents (not only liaison/admin).
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
          OR l.created_by = auth.uid()
        )
    )
  );
