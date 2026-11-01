-- Rename legacy "Appliances — …" category labels to cleaner non-solar names.

UPDATE quote_item_categories
SET name = 'Heat Pumps'
WHERE name = 'Appliances — Heat Pumps';

UPDATE quote_item_categories
SET name = 'Solar Water Heaters'
WHERE name = 'Appliances — Solar Water Heaters';

UPDATE quote_item_categories
SET name = 'Commercial RO'
WHERE name = 'Appliances — Commercial RO';
