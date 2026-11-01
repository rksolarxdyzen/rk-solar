-- Delete Quotations authority. Owner (admin) passes has_authority() for every
-- key; other roles get it only when ticked in Team & Access. Manage Quotations
-- and Full Access keep delete rights. Accepted / paid quotes are blocked in the app.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'delete_quotations',
  'Delete Quotations',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_quotations', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

DROP POLICY IF EXISTS quotations_delete ON quotations;
CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('delete_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );
