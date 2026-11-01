-- Owner (admin / full_access) may delete a mistaken or duplicate payment row.

DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('full_access')
      OR has_authority('manage_quotations')
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active
      )
    )
  );
