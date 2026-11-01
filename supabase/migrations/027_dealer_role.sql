-- Phase 6a — add dealer enums.
-- Must run before 028. Do not reference new enum values elsewhere in this file
-- (Postgres cannot use a new enum value in the same transaction).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dealer';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'dealer';
