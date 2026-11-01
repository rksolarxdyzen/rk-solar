-- Free-text watt peak label on rate card panels (display + parse for kW math).

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_watt_peak VARCHAR(100);

UPDATE rate_card_companies
SET panel_watt_peak = panel_wattage::text || 'W'
WHERE panel_watt_peak IS NULL
  AND panel_wattage IS NOT NULL
  AND panel_wattage > 0;
