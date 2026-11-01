# QA — Dealer RBAC scope

Harness: `node scripts/qa-dealer-scope.cjs`

## Latest run (2026-10-05)

- Result: **BLOCKED** on live DB until **068** applied; static + anon PASS; dealer session SKIP (no `QA_DEALER_*`)
- Env: `bflnchwfwjlrwnvedkgq.supabase.co` (anon only)
- Auth: no service_role

| Case | Result |
|------|--------|
| `dealerOwnLeadOrFilter` = created_by \| dealer_id | PASS |
| Anon leads empty | PASS |
| Anon quotations empty | PASS |
| `is_dealer_user` (migration 068) | BLOCKED — apply SQL |
| Dealer session leak matrix | SKIP — set `QA_DEALER_EMAIL` / `QA_DEALER_PASSWORD` |

## Apply

Run `supabase/migrations/068_dealer_rbac_hard_scope.sql` on the target Supabase project, then re-run the harness (ideally with a dealer login).
