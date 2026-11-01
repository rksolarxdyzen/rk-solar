-- RK Solar — Phase 0 bootstrap schema
-- Companies (tenants) + Profiles + RLS helpers
-- See docs/workflow.md for full role catalog

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- Role keys align with docs/workflow.md §1
-- ============================================================
CREATE TYPE user_role AS ENUM (
  'admin',
  'sales_manager',
  'tele_caller',
  'surveyor',
  'sales_executive',
  'feasibility',
  'accounts',
  'ops_coordinator',
  'installation_crew',
  'liaison',
  'service_engineer',
  'service_supervisor',
  'customer'
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20) NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'tele_caller',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_role ON profiles(company_id, role);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_companies_updated
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true AND role = 'admin'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON companies FOR SELECT
  USING (id = auth_company_id() AND is_active_user());

CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = auth_company_id() AND is_admin_user());

CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid() AND is_active_user());

CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (company_id = auth_company_id() AND is_admin_user());

CREATE POLICY profiles_insert_admin ON profiles FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND is_admin_user());

-- ============================================================
-- AUTO PROFILE ON AUTH SIGNUP
-- Pass company_id, name, phone, role via user metadata
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_company UUID;
BEGIN
  SELECT id INTO default_company FROM companies ORDER BY created_at ASC LIMIT 1;

  INSERT INTO profiles (id, company_id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'company_id')::UUID, default_company),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tele_caller')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED TENANT (RK Solar)
-- ============================================================
INSERT INTO companies (id, name, slug, email)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'RK Solar',
  'rk-solar',
  'admin@rksolar.local'
)
ON CONFLICT (slug) DO NOTHING;
