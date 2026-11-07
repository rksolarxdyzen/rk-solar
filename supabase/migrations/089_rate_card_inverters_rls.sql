-- rate_card_inverters was created in 041 without RLS policies.
-- Live DB had RLS enabled with zero policies → all staff reads/writes denied.

ALTER TABLE rate_card_inverters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_card_inverters_select ON rate_card_inverters;
CREATE POLICY rate_card_inverters_select ON rate_card_inverters FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_inverters_manage ON rate_card_inverters;
CREATE POLICY rate_card_inverters_manage ON rate_card_inverters FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));
