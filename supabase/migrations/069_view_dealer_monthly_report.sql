-- Dealer monthly report (/reports/dealers): leads & files by external dealer.

INSERT INTO authorities (key, label, authority_group)
VALUES (
  'view_dealer_monthly_report',
  'Dealer Monthly Report',
  'general'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'view_dealer_monthly_report', true
FROM roles r
WHERE COALESCE(r.slug, '') IN ('admin', 'sales_manager', 'accounts')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;
