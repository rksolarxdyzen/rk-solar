-- ============================================================
-- 050_inventory_authorities.sql  (RK Solar inventory port from Sumeru)
-- Inventory permissions, Inventory Person role, and Owner-only
-- control of pricing access (view_purchase_cost / manage_purchase_cost).
-- Requires 048_inventory_core.sql.
-- ============================================================

INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_inventory', 'View Inventory', 'inventory'),
  ('manage_inventory_items', 'Manage Inventory Items', 'inventory'),
  ('inventory_inward', 'Stock Inward', 'inventory'),
  ('inventory_dispatch', 'Dispatch to Customers', 'inventory'),
  ('inventory_return', 'Customer Returns', 'inventory'),
  ('inventory_adjust', 'Stock Adjustments & Reversals', 'inventory'),
  ('view_purchase_cost', 'View Purchase Cost & Stock Value', 'inventory'),
  ('manage_purchase_cost', 'Set Purchase Cost', 'inventory')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  authority_group = EXCLUDED.authority_group;

-- ------------------------------------------------------------
-- Inventory Person system role (every company)
-- ------------------------------------------------------------
INSERT INTO roles (company_id, name, slug, description, is_system)
SELECT id, 'Inventory Person', 'inventory-person', 'Item master, stock inward, dispatch and returns', true
FROM companies
ON CONFLICT (company_id, slug) DO NOTHING;

-- ------------------------------------------------------------
-- Role grants (pricing keys only for the Owner role)
-- ------------------------------------------------------------
-- Admin: inventory ops without cost keys in role_authorities (cost via is_company_admin_grantor only)

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return'), ('inventory_adjust')
) AS k(key)
WHERE r.slug = 'admin' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES ('view_inventory'), ('inventory_dispatch'), ('inventory_return')) AS k(key)
WHERE r.slug = 'sales_manager' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, k.key, true
FROM roles r
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return')
) AS k(key)
WHERE r.slug = 'inventory-person' AND r.is_system = true
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Users with explicit user_authorities rows are checked there first,
-- so mirror their role's new inventory grants (never the pricing keys).
INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, ra.authority_key, true
FROM profiles p
JOIN role_authorities ra ON ra.role_id = p.role_id AND ra.granted = true
WHERE ra.authority_key IN (
    'view_inventory', 'manage_inventory_items', 'inventory_inward',
    'inventory_dispatch', 'inventory_return', 'inventory_adjust'
  )
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, k.key, true
FROM profiles p
CROSS JOIN (VALUES
  ('view_inventory'), ('manage_inventory_items'), ('inventory_inward'),
  ('inventory_dispatch'), ('inventory_return'), ('inventory_adjust')
) AS k(key)
WHERE p.role_id IS NULL
  AND p.role = 'admin'
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

INSERT INTO user_authorities (user_id, authority_key, granted)
SELECT p.id, k.key, true
FROM profiles p
CROSS JOIN (VALUES ('view_inventory'), ('inventory_dispatch'), ('inventory_return')) AS k(key)
WHERE p.role_id IS NULL
  AND p.role = 'sales_manager'
  AND EXISTS (SELECT 1 FROM user_authorities ua WHERE ua.user_id = p.id)
ON CONFLICT (user_id, authority_key) DO NOTHING;

-- ------------------------------------------------------------
-- has_authority (KT-compatible): keep LMS checks; admin/full_access
-- never imply purchase-cost keys (those use can_view/manage_purchase_cost
-- + is_company_admin_grantor).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_authority(required_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT
  -- Explicit user grant for this key
  EXISTS (
    SELECT 1 FROM user_authorities ua
    WHERE ua.user_id = auth.uid()
      AND ua.authority_key = required_key
      AND ua.granted = true
  )
  -- full_access user grant (never implies purchase cost)
  OR (
    required_key NOT IN ('view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1 FROM user_authorities ua
      WHERE ua.user_id = auth.uid()
        AND ua.authority_key = 'full_access'
        AND ua.granted = true
    )
  )
  -- Role grant for this key
  OR EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_authorities ra ON ra.role_id = p.role_id
    WHERE p.id = auth.uid()
      AND ra.granted = true
      AND ra.authority_key = required_key
  )
  -- Role full_access (never implies purchase cost)
  OR (
    required_key NOT IN ('view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1
      FROM profiles p
      JOIN role_authorities ra ON ra.role_id = p.role_id
      WHERE p.id = auth.uid()
        AND ra.granted = true
        AND ra.authority_key = 'full_access'
    )
  )
  -- Admin enum fallback (never implies purchase cost or full_access key itself)
  OR (
    required_key NOT IN ('full_access', 'view_purchase_cost', 'manage_purchase_cost')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin'
    )
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- Owner-only guards. Requests without a signed-in user
-- (SQL editor, migrations, service role) are allowed.
-- ------------------------------------------------------------

-- Only an Admin can grant or remove the pricing keys on a role.
CREATE OR REPLACE FUNCTION guard_pricing_role_authorities()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keys TEXT[] := ARRAY['view_purchase_cost', 'manage_purchase_cost'];
BEGIN
  IF auth.uid() IS NULL OR is_company_admin_grantor() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.authority_key = ANY (v_keys) AND NEW.granted THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.authority_key = ANY (v_keys) OR OLD.authority_key = ANY (v_keys))
     AND (NEW.granted IS DISTINCT FROM OLD.granted OR NEW.authority_key IS DISTINCT FROM OLD.authority_key)
  THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.authority_key = ANY (v_keys) AND OLD.granted THEN
    RAISE EXCEPTION 'Only an Admin can change pricing access.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_authorities_guard_pricing ON role_authorities;
CREATE TRIGGER role_authorities_guard_pricing
  BEFORE INSERT OR UPDATE OR DELETE ON role_authorities
  FOR EACH ROW EXECUTE FUNCTION guard_pricing_role_authorities();

-- Only an Admin can give/remove the Owner role, or move someone
-- onto or off a role that has pricing access.
CREATE OR REPLACE FUNCTION guard_owner_and_pricing_roles()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_company_admin_grantor() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
    RAISE EXCEPTION 'Only an Admin can give or remove the Owner role.' USING ERRCODE = '42501';
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     AND (role_grants_purchase_cost(OLD.role_id) OR role_grants_purchase_cost(NEW.role_id))
  THEN
    RAISE EXCEPTION 'Only an Admin can assign or remove a role that has pricing access.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_owner_pricing ON profiles;
CREATE TRIGGER profiles_guard_owner_pricing
  BEFORE UPDATE OF role, role_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_owner_and_pricing_roles();
