-- Documentation (liaison) uploads the pre-install feasibility PDF.
-- Role `feasibility` already has this key; keep it as an alias.

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug = 'liaison'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;
