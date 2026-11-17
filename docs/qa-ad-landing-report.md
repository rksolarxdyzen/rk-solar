# QA report — RK Bhabhor — ad landing / inbox

- **Date:** 2026-11-17
- **Result:** BLOCKED (migration `090` not applied on live Supabase; no QA owner login in env)
- **Env:** `vmuymmlsjoqglrkldmzp.supabase.co`
- **Auth:** user sessions only (no service_role)

| ID | Result | Detail |
|----|--------|--------|
| ENV | PASS | host ok |
| Q0_SCHEMA | BLOCKED | apply `supabase/migrations/090_ad_campaign_submissions.sql` |
| Q1_GO | BLOCKED / deploy pending | production still redirects `/go` until sync+deploy |
| Q7_AUTH | SKIP | no `QA_OWNER_EMAIL` / `QA_OWNER_PASSWORD` |

**Harness:** `node scripts/qa-ad-landing.cjs`

**Before go-live**

1. Run migration `090` in the RK Supabase SQL editor.
2. Sync + deploy.
3. Re-run harness (optional: set QA owner env).
