# QA report — KT / RK — Dashboard RBAC

- Result: **PASSED**
- Env: host `bflnchwfwjlrwnvedkgq.supabase.co` (anon key; no service_role)
- Auth: optional user sessions only
- Cases: 13 PASS · 0 FAIL · 3 SKIP · 0 BLOCKED

| Status | Case | Detail |
|---|---|---|
| PASS | loader canCompanyFinanceDashboard | flag defined |
| PASS | loader no canFinance=canPayments | old alias removed |
| PASS | loader finance gate keys | admin/accounts/manager/verify/reports/seeCustomers |
| PASS | loader snapshot gated | accountsFinance only when company finance |
| PASS | loader payment overview hide-empty | scoped; hide zeros for sales |
| PASS | loader install KPI | canInstall only |
| PASS | loader grievances omit assigned-only | company-wide only; omit assigned-only |
| PASS | snapshot canCompanyFinanceDashboard helper | helper present |
| PASS | snapshot not view_payment_queues | tighter than receivables page |
| PASS | receivables page keeps queue roles | listAccountsReceivables unchanged |
| PASS | lead sources gate | see-all / reports / manager — not import authority |
| PASS | UI accountsFinance null-safe | panel gated on data.accountsFinance |
| PASS | anon leads denied/empty | 200 |
| SKIP | sales session | No QA_SALES_EMAIL/PASSWORD — structural only |
| SKIP | accounts session | No QA_ACCOUNTS_EMAIL/PASSWORD |
| SKIP | admin session | No QA_OWNER/ADMIN login |

## Expectation
- Sales Executive: no Accounts finance panel / company pending cards; no company Lead sources; Active leads = assigned.
- Accounts/Admin: Accounts finance + company pending present.
- `record_payment` / `view_payment_queues` alone ≠ company finance dashboard.
