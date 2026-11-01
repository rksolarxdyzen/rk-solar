# QA — Dealer monthly report

Harness: `node scripts/qa-dealer-monthly-report.cjs`

## Latest run (2026-10-05)

- Result: **PASSED** (static)
- Auth: no service_role; session SKIP

| Case | Result |
|------|--------|
| Types / collector / actions / page / board | PASS |
| Authority + migration **069** | PASS |
| Nav + Dealers link | PASS |
| Live Owner session | SKIP |

## Apply

Run `supabase/migrations/069_view_dealer_monthly_report.sql` on the target project so Team seeds `view_dealer_monthly_report` for Admin / Sales Manager / Accounts.
