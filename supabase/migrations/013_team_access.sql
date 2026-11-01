-- RK Solar — Team & Access administration hardening
-- Apply after 012_proofs_storage.sql.

-- Keep role authority reads inside the current tenant. The original policy only
-- checked that the caller was active and therefore exposed every tenant's grants.
DROP POLICY IF EXISTS role_authorities_select ON role_authorities;
CREATE POLICY role_authorities_select ON role_authorities FOR SELECT
  USING (
    is_active_user()
    AND EXISTS (
      SELECT 1
      FROM roles r
      WHERE r.id = role_authorities.role_id
        AND r.company_id = auth_company_id()
    )
  );

-- Profile privilege fields must only be changed by trusted server actions using
-- the service role. The old self-update policy allowed a user to change role,
-- role_id, company_id, and is_active directly through PostgREST.
DROP POLICY IF EXISTS profiles_update_self ON profiles;
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON profiles;

-- Seed roles omitted by the earlier module migrations for every existing tenant.
DO $$
DECLARE
  company_row RECORD;
  sales_role_id UUID;
BEGIN
  FOR company_row IN SELECT id FROM companies LOOP
    INSERT INTO roles (company_id, name, slug, description, is_system)
    VALUES (
      company_row.id,
      'Sales Executive',
      'sales_executive',
      'Prepare quotations, record payments, and advance won opportunities',
      true
    )
    ON CONFLICT (company_id, slug) DO UPDATE
      SET is_system = true
    RETURNING id INTO sales_role_id;

    SELECT id INTO sales_role_id
    FROM roles
    WHERE company_id = company_row.id AND slug = 'sales_executive';

    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT sales_role_id, authority_key, true
    FROM (
      VALUES
        ('view_all_leads'),
        ('add_edit_leads'),
        ('move_lead_stage'),
        ('log_sales_activity'),
        ('view_quotations'),
        ('create_quotations'),
        ('edit_quotation_pricing'),
        ('accept_quotations'),
        ('record_payment'),
        ('view_payment_queues')
    ) defaults(authority_key)
    JOIN authorities a ON a.key = defaults.authority_key
    ON CONFLICT (role_id, authority_key) DO NOTHING;

    INSERT INTO roles (company_id, name, slug, description, is_system)
    VALUES (
      company_row.id,
      'Customer',
      'customer',
      'Customer portal account without staff dashboard authorities',
      true
    )
    ON CONFLICT (company_id, slug) DO UPDATE
      SET is_system = true;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Enforce role invariants in the database as a final guard for future service
-- code and to close the count-then-delete race.
CREATE OR REPLACE FUNCTION protect_team_role()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'System roles cannot be deleted';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = OLD.id) THEN
      RAISE EXCEPTION 'Role is still assigned to one or more users';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_system AND (
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.is_system IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'System role identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_protect_team_role ON roles;
CREATE TRIGGER tr_protect_team_role
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION protect_team_role();
