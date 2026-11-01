-- Keep Delete Leads / Customers in the catalog. Owner (admin) already
-- passes has_authority() for every key. Other roles only get it when
-- ticked in Team & Access — revoke the old sales_manager seed default.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'delete_leads',
  'Delete Leads / Customers',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_leads', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

UPDATE role_authorities ra
SET granted = false
FROM roles r
WHERE ra.role_id = r.id
  AND r.slug = 'sales_manager'
  AND ra.authority_key = 'delete_leads';
