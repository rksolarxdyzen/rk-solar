# QA — User permission overrides

Harness: `node scripts/qa-user-permission-overrides.cjs`

## Latest run (2026-10-05)

- Result: **PASSED** (static)
- Auth: no service_role; owner session SKIP

| Case | Result |
|------|--------|
| `updateTeamUserAuthorities` action | PASS |
| Load/save `user_authorities` + audit | PASS |
| `TeamUser.extra_authority_keys` | PASS |
| Users → Permissions UI | PASS |
| Runtime role ∪ user grants | PASS |
| Dealer company-wide block | PASS |
| Live Team save as Owner | SKIP |

## How to use

Team & Access → Users → **Permissions** on a row → tick extras → Save extras.
