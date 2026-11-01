-- Leads / customers: only Admin (or a role that still has view_all_leads)
-- sees the company list. Assignment is not a company-wide unlock.
-- Seeds in 002/008/009/010 granted view_all_leads to Sales Manager, Sales Exec,
-- Accounts, Ops, Feasibility, and Liaison — so every staff user saw every file.

DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND COALESCE(r.slug, '') <> 'admin';
