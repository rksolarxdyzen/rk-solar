-- Add Meter Install to grievance category dropdown.

ALTER TABLE grievances
  DROP CONSTRAINT IF EXISTS grievances_category_check;

ALTER TABLE grievances
  ADD CONSTRAINT grievances_category_check
  CHECK (category IN (
    'hr',
    'operations',
    'payroll',
    'facilities',
    'it',
    'compliance',
    'meter_install',
    'other'
  ));
