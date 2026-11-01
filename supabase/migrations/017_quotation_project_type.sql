-- Project type on quotations (residential vs commercial).
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'residential';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_project_type_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_project_type_check
      CHECK (project_type IN ('residential', 'commercial'));
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.project_type IS 'Site project type: residential or commercial.';
