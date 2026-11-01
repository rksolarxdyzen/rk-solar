-- Fix auth signup failures caused by fragile handle_new_user casts.
-- Symptom: Supabase Dashboard "Create user" returns empty / Database error creating new user.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_company UUID;
  meta_company UUID;
  meta_role public.user_role;
  meta_name TEXT;
  meta_phone TEXT;
  admin_role_id UUID;
BEGIN
  SELECT id INTO default_company
  FROM public.companies
  ORDER BY created_at ASC
  LIMIT 1;

  -- Safe company_id from metadata
  BEGIN
    IF NEW.raw_user_meta_data ? 'company_id'
       AND NULLIF(TRIM(NEW.raw_user_meta_data->>'company_id'), '') IS NOT NULL THEN
      meta_company := (NEW.raw_user_meta_data->>'company_id')::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    meta_company := NULL;
  END;

  -- Safe role from metadata (invalid values fall back to tele_caller)
  BEGIN
    IF NEW.raw_user_meta_data ? 'role'
       AND NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '') IS NOT NULL THEN
      meta_role := (LOWER(TRIM(NEW.raw_user_meta_data->>'role')))::public.user_role;
    ELSE
      meta_role := 'tele_caller'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    meta_role := 'tele_caller'::public.user_role;
  END;

  meta_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );
  meta_phone := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), '');

  IF COALESCE(meta_company, default_company) IS NULL THEN
    RAISE EXCEPTION 'No company exists. Run 001_init.sql seed before creating users.';
  END IF;

  INSERT INTO public.profiles (id, company_id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(meta_company, default_company),
    meta_name,
    NEW.email,
    meta_phone,
    meta_role
  );

  -- Link RBAC role_id when roles table exists (002_lms.sql)
  BEGIN
    SELECT id INTO admin_role_id
    FROM public.roles
    WHERE company_id = COALESCE(meta_company, default_company)
      AND slug = meta_role::TEXT
    LIMIT 1;

    IF admin_role_id IS NOT NULL THEN
      UPDATE public.profiles
      SET role_id = admin_role_id
      WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- roles not migrated yet
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
