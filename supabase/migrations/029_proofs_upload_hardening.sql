-- ============================================================
-- 029_proofs_upload_hardening.sql
-- Wider MIME allow-list for phone photos + surveyor portal doc writes
-- ============================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ],
  file_size_limit = 10485760
WHERE id = 'proofs';

-- Surveyors / sales completing digital survey need to write site-photo docs
-- without requiring the service-role key.
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
    )
  );
