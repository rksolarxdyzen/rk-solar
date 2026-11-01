-- RK Solar — catalog item images + premium BOM from materials PDF
-- Apply after 014_portal_customer_docs.sql

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;
