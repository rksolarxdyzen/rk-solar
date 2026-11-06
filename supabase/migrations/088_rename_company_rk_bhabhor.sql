-- Rename display tenant from RK Solar → RK Bhabhor (live catch-up).
-- Slug stays rk-solar (technical / deploy identity).

UPDATE public.companies
SET name = 'RK Bhabhor'
WHERE id = 'a0000000-0000-4000-8000-000000000001'
  AND name IS DISTINCT FROM 'RK Bhabhor';

UPDATE public.quotation_company_settings
SET from_name = 'RK Bhabhor'
WHERE company_id = 'a0000000-0000-4000-8000-000000000001'
  AND (from_name IS NULL OR from_name = '' OR from_name = 'RK Solar');
