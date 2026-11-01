-- Rename legacy "Home Appliances" category to cleaner non-solar label.

UPDATE quote_item_categories
SET name = 'Allied Products'
WHERE name = 'Home Appliances';
