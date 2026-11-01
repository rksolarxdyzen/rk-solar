-- Which Team roles appear in assignment pickers (Field surveyor, Tele-caller,
-- Installation crew, Dealer, Service engineer). Custom roles can opt in.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS assignment_pools text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN roles.assignment_pools IS
  'Picker pools this role appears in: telecaller, surveyor, installation_crew, dealer, service_engineer';

-- Seed system roles to match prior hardcoded filters (telecaller newly constrained)
UPDATE roles
SET assignment_pools = ARRAY['telecaller', 'surveyor', 'service_engineer']
WHERE slug = 'admin';

UPDATE roles
SET assignment_pools = ARRAY['telecaller', 'surveyor']
WHERE slug = 'sales_manager';

UPDATE roles
SET assignment_pools = ARRAY['telecaller']
WHERE slug IN ('tele_caller', 'sales_executive');

UPDATE roles
SET assignment_pools = ARRAY['surveyor']
WHERE slug = 'surveyor';

UPDATE roles
SET assignment_pools = ARRAY['installation_crew']
WHERE slug = 'installation_crew';

UPDATE roles
SET assignment_pools = ARRAY['dealer']
WHERE slug = 'dealer';

UPDATE roles
SET assignment_pools = ARRAY['service_engineer']
WHERE slug IN ('service_engineer', 'service_supervisor');
