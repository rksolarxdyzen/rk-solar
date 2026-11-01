-- RK Solar — tag premium / regular BOM catalogue rows for new quotation templates

UPDATE quote_items
SET template_kind = 'premium', updated_at = NOW()
WHERE model LIKE 'PREMIUM-BOM-%'
  AND template_kind IS DISTINCT FROM 'premium';

UPDATE quote_items
SET template_kind = 'non_solar', updated_at = NOW()
WHERE model LIKE 'REGULAR-BOM-%'
  AND template_kind IS DISTINCT FROM 'non_solar';

UPDATE quote_item_categories
SET kind = 'premium'
WHERE name LIKE 'Premium — %'
  AND kind IS DISTINCT FROM 'premium';

UPDATE quote_item_categories
SET kind = 'non_solar'
WHERE name LIKE 'Regular — %'
  AND kind IS DISTINCT FROM 'non_solar';
