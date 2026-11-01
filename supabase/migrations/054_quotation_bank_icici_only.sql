-- RK Solar: do not seed another company's bank details.
-- Clear any SBI/ICICI letterhead leftovers so quotes start blank until letterhead is set.

UPDATE public.quotation_company_settings
SET
  bank_name = NULL,
  account_number = NULL,
  ifsc_code = NULL,
  branch = NULL,
  bank_account_name = NULL
WHERE bank_name ILIKE '%SBI%'
   OR account_number ILIKE '%SBI%'
   OR ifsc_code ILIKE '%SBIN%'
   OR bank_name ILIKE '%ICICI%'
   OR account_number = '200905500146'
   OR ifsc_code = 'ICIC0002009'
   OR bank_account_name ILIKE '%RENEWABLE%';
