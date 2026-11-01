-- Quotes list: company-wide only with view_all_quotations
-- (else assigned leads + quotes the user created). Mirrors assigned-only leads.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'view_all_quotations',
  'View All Quotations',
  'sales'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

-- Admin + Accounts (company-wide money/quotes). Sales roles stay assigned-only.
INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_all_quotations', true
FROM roles r
WHERE COALESCE(r.slug, '') IN ('admin', 'accounts')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;
