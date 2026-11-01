-- Commercial: editable GST % on system base price (default 8.9).
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS commercial_gst_percent NUMERIC(5,2);

COMMENT ON COLUMN public.quotations.commercial_gst_percent IS
  'Commercial: GST percent applied to base system price (default 8.9).';
