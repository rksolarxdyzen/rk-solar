-- Evidence lock: installation crew cannot delete proofs after upload.
-- Supervisor (assign_installation_crew), complete_installation, or full_access may still remove.

DROP POLICY IF EXISTS install_photos_delete ON installation_photos;
CREATE POLICY install_photos_delete ON installation_photos FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('complete_installation')
      OR has_authority('assign_installation_crew')
      OR has_authority('full_access')
    )
  );
