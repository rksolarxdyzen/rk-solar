# KT Renewable Energy — Accounts dashboard, Won subsidy & dealers revise plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-17  
**Status:** Implemented 2026-09-17 (Phases A–E)  
**Source:** User revision list (Accounts pending/collections, Won consumer + subsidy checkbox, dealer due/paid views, quotation payment cap)  
**Related prior docs:** `docs/reviseplan.md` (Phases A–D), `docs/plan-payments.md`, `docs/workflow.md`, `docs/reviseplan-regular-bom.md`

---

## Purpose

Capture the requested Accounts / Sales / Dealer revisions, audit what exists today, define product rules (especially **subsidy pending** vs liaison **subsidy stages**), and break work into implementable phases. Use this as the checklist for the next build pass.

---

## Product language (clarify)

| User wording | Meaning in this app |
|--------------|---------------------|
| **Pending (customer)** | Remaining customer milestone money not yet **verified** (or not yet recorded) vs accepted quotation / Won plan — typically **Pre-dispatch** and **Final** buckets |
| **Pending (subsidy)** | Amount the **company** expects to recover later because Sales marked **“subsidy will be borne by the company”** at Won — **not** the same as pipeline stage `subsidy_pending` (liaison/meter timer) |
| **Subsidy pending checkbox (Won)** | Boolean on the lead set when moving to Won: company bears subsidy → Accounts treats quote/plan subsidy amount as receivable / pending |
| **Amount shortly due (dealer)** | Commission / payout estimate for dealer files where **pre-dispatch payment is verified** (installation is close) but dealer payout is not yet paid for the month |
| **Paid to dealers (month)** | Approved / paid dealer commission totals in the **current calendar month** |
| **Never higher than quotation** | Sum of non-rejected recorded payments for a lead must not exceed accepted quotation `grand_total` (fallback: Won plan total if no quote) |

---

## Implementation order (recommended)

| Phase | Scope | Why | Status |
|-------|--------|-----|--------|
| **A — Won capture** | Consumer number + company-bears-subsidy checkbox + persist + gate | Unlocks Accounts subsidy pending; small migration | **Done** |
| **B — Payment cap** | Server + UI: reject record/verify that would exceed quotation | Hard money rule; low UI surface | **Done** |
| **C — Accounts receivables board** | Full list of customers with any pending (milestones + company subsidy) + breakdown | Core Accounts ask | **Done** |
| **D — Accounts dashboard KPIs** | Stage-wise pending & collected; dealer due/paid averages | Home for Accounts role | **Done** |
| **E — Dealer Accounts view** | Directory columns + detail date filter + due shortly / paid month | Extends existing `/dealers` | **Done** |

Optional after E: sync to `Deliverables/rk-solar`, port same pattern to branded forks only if requested.

---

## Current state (audit)

### Payments & balances
| Surface | Today |
|---------|--------|
| Milestone model | `token` → `pre_dispatch` → `final` (`src/lib/domain/payments.ts`) |
| Balance math | `summarizeLeadPaymentBalance` — project total from quote `grand_total` else Won plan; remaining = total − non-rejected payments |
| Customer Payments tab | Shows project total / paid / remaining per lead |
| `/payments` queue | Pending verification rows — **not** a full “who still owes what” receivables list |
| Cap vs quotation | **Missing** — `recordPayment` does not reject `paid + newAmount > grand_total` |

### Won closing
| Surface | Today |
|---------|--------|
| UI | `move-to-won-button.tsx` — panel / qty / inverter / token·pre·final / docs / quote picker |
| Gate | `won-gate.ts` — system + payment breakdown + mandatory docs |
| Consumer number | **Missing** on KT (Jay-Sardar has `consumer_number` migration `056` — reference only) |
| Company bears subsidy | **Missing** — no checkbox; liaison `subsidy_*` stages are post-install workflow only |

### Dashboard (Accounts)
| Surface | Today |
|---------|--------|
| Loader | `load-dashboard.ts` — generic finance KPIs: monthly revenue, payments collected + pending total, installations, subsidy overdue count |
| Stage-wise pending | **Missing** (Pre-dispatch / Final / company-subsidy) |
| Stage-wise collected | **Missing** (Token / Pre-dispatch / Final verified sums) |
| Dealer due / paid / averages | **Missing** on home dashboard |

### Dealers
| Surface | Today |
|---------|--------|
| Directory | `/dealers` — name, phone, files linked/completed, commissions pending/approved, approved ₹ total |
| Detail | Files + commissions; approve/reject |
| “Shortly due” | **Missing** — no rule tied to pre-dispatch verified |
| Paid this month | **Missing** as explicit column |
| Date-range filter on files | **Missing** |
| Avg ₹ / file · avg ₹ / dealer | **Missing** |

### Authorities / nav
- Accounts already reaches `/payments`, `/customers`, `/dealers`, `/documentation`, home dashboard (`nav-access.ts`, role `accounts`).
- Recent fix: migration `044` lets `verify_payment` update lead stage after verify.

---

## Item 1 — Won: Consumer number + company subsidy checkbox

### Request
When moving to **Won**, add:
1. **Consumer number**
2. Whether **subsidy will be borne by the company** (subsidy pending checkbox) — signals Accounts

### Plan
1. Migration (e.g. `045_won_consumer_subsidy.sql`):
   - `leads.consumer_number TEXT NULL`
   - `leads.company_bears_subsidy BOOLEAN NOT NULL DEFAULT false`  
     (label in UI: “Subsidy pending — company will bear / recover subsidy”)
   - Optional: `leads.subsidy_amount_at_won NUMERIC` snapshot from accepted quote at Won time (or always resolve from `accepted_quotation_id.subsidy` / quote settings)
2. Extend `WonClosingPayload` + `checkWonClosingGate`:
   - Consumer number required (min length ≥ 3, trim) — align with Jay pattern unless product says optional
   - Checkbox required as explicit yes/no (boolean always set; no “unset”)
3. `move-to-won-button.tsx`: fields + help text that Accounts uses the checkbox for subsidy pending receivables
4. Persist in `markLeadWon` / `getWonGateContext`; show on Customer Overview
5. Index `consumer_number` for search (customers list / Accounts board)

### Files
- `supabase/migrations/045_*.sql` (new)
- `src/lib/leads/won-gate.ts`
- `src/components/leads/move-to-won-button.tsx`
- `src/actions/leads.ts`
- `src/lib/domain/types.ts`, customer overview / customers list

### Open questions
- Is consumer number **mandatory** at Won or allowed later (Jay allows later at finalize)? **Default plan: mandatory at Won** unless user says optional.
- Subsidy amount for Accounts: use quotation `subsidy` field, or a separate INR input on Won? **Default: quotation subsidy when checkbox on; else ₹0.**

---

## Item 2 — Never allow payment higher than quotation amount

### Request
Hard rule: no payment recording that pushes cumulative (non-rejected) payments above quotation amount.

### Plan
1. Shared helper: `assertPaymentWithinQuoteCap({ projectTotal, existingPayments, newAmount })` in `payment-balance.ts` (or `payments.ts`)
2. Cap source priority: accepted quote `grand_total` → else Won plan (token+pre+final) → if neither, **block** recording until quote/plan exists
3. Enforce in `recordPayment` (and on update of pending row amount)
4. UI: disable submit + show “Exceeds quotation by ₹X” on Payment panel; show remaining as max
5. Do **not** allow verify to inflate amount; verify only confirms existing row
6. Edge: rejected rows excluded from sum (already in balance math)

### Files
- `src/lib/domain/payment-balance.ts`
- `src/actions/payments.ts`
- `src/components/leads/payment-panel.tsx`

### Open questions
- Cap = quote **grand total** (customer payable after subsidy) or **system cost before subsidy**? **Default: `grand_total` / net payable on accepted quote** (what customer owes RK). Company-borne subsidy is tracked separately (Item 3), not as customer milestone overpay.

---

## Item 3 — Accounts: full list of customers with any amount pending + breakdown

### Request
Accounts sees **all** customers with any pending amount (customer milestones **or** company subsidy), with breakdown.

### Plan
1. New Accounts receivables module (prefer dedicated route e.g. `/accounts/receivables` or tab under `/payments`):
   - Columns: customer, portal code, stage, city, TC/SV  
   - Breakdown: Token remaining · Pre-dispatch remaining · Final remaining · **Company subsidy pending** · Total pending  
   - Filters: stage group, city, “has subsidy pending”, search
2. Computation per lead (server action / loader):
   - Milestone remaining from Won plan buckets minus verified(+pending?) amounts per milestone — **recommend: remaining = planned bucket − verified**; show pending-verification separately  
   - Company subsidy pending = `company_bears_subsidy` ? `subsidy_amount` (quote or snapshot) : 0; clear when Accounts verifies subsidy received (reuse existing subsidy verify flow if present)
3. Include leads that are “fully paid” on milestones but still have company subsidy pending
4. Row → open customer (existing lead modal)
5. Nav: Accounts + Admin; authority `view_payment_queues` or new `view_accounts_receivables`

### Files
- `src/app/(dashboard)/accounts/...` or extend `payments`
- `src/lib/accounts/receivables.ts` (new)
- `src/actions/accounts-receivables.ts` (new)
- `src/components/accounts/...`
- `src/lib/nav-access.ts`, sidebar

### Open questions
- Count **pending verification** payments as “still pending” for the customer list? **Default: yes** (money not confirmed).
- When is company subsidy pending cleared? **Default: when subsidy verified by Accounts** (`verify_subsidy` / existing liaison Accounts step).

---

## Item 4 — Accounts dashboard KPIs

### Request
Dashboard shows:
1. **Customers + amounts pending** stage-wise: Pre-dispatch, Final, Subsidy (from Won checkbox)
2. **Amounts collected** stage-wise: Token, Pre-dispatch, Final (verified)
3. **Dealer:** amount to pay soon (files with pre-dispatch taken → install near), amount paid to dealers, **avg payment / file**, **avg payment / dealer**

### RBAC note (2026-10-05)
Home Accounts finance KPIs are for **accounts + admin** (plus Sales Manager / `verify_payment` / `view_reports` / customer-wide lanes). **`record_payment` alone must not** populate company Pending / Collected MTD / Dealer-due cards — Sales Executive keeps scoped pipeline + optional scoped Payment overview only. See `docs/workflow.md` §5.1.0 and `scripts/qa-dashboard-rbac.cjs`.

### Plan
1. Extend `DashboardData` with `accountsFinance?: AccountsDashboardBlock` when `role === accounts` (and Admin)
2. Pending block:
   - Counts + ₹ for pre-dispatch remaining, final remaining, company-subsidy pending
   - Links into receivables board filtered by bucket
3. Collected block (verified payments, optionally MTD + all-time toggle; **default MTD**):
   - Sum by `milestone` ∈ {token, pre_dispatch, final}
4. Dealer block:
   - **Shortly due:** sum of approved-pending or estimated commission on leads where `pre_dispatch` payment is **verified** and commission not yet **approved/paid** for current cycle — define precisely in implementation (see Item 5)
   - **Paid (month):** sum `dealer_commissions` with `status = approved` and `reviewed_at` in current month
   - **Avg / file:** paid month ÷ distinct leads paid that month (or approved amount ÷ completed files — document choice)
   - **Avg / dealer:** paid month ÷ dealers with ≥1 payout that month
5. `dashboard-home.tsx`: Accounts-first layout (hide noisy sales pipeline if role is accounts-only) — keep Admin full view + Accounts section

### Files
- `src/lib/dashboard/load-dashboard.ts`
- `src/lib/dashboard/accounts-metrics.ts` (new)
- `src/components/dashboard/dashboard-home.tsx`
- `src/components/dashboard/accounts-finance-panel.tsx` (new)

### Open questions
- Collected KPIs: **month-to-date** vs lifetime? **Default: MTD with lifetime in detail line.**
- “Paid to dealers” = commission **approved** only, or need a separate `paid_at` / bank payout status? **Today only pending/approved/rejected — treat approved as paid unless product adds payout status later.**

---

## Item 5 — Accounts: dealers list + detail depth

### Request
- List: dealer name · amount **shortly due** · amount **paid (month)**
- Detail: total files (date-range filter) · total paid · amount due shortly

### Plan
1. Extend `DealerDirectoryRow`:
   - `shortlyDueInr`
   - `paidThisMonthInr`
2. **Shortly due rule (product):**  
   Lead linked to dealer **and** pre-dispatch milestone payment `verification_status = verified` **and** dealer commission for that lead is missing or `status = pending` → include `amount_inr` (or % of quote if only percent set).  
   Rationale: matches “predispatch amount has been taken — installation close.”
3. Detail `getDealerDetail`:
   - Query params / UI: `from` / `to` on file `created_at` or `won_at`
   - Totals: files in range, paid all-time + paid in month, shortly due
4. Accounts-focused copy on `/dealers` page header when role is accounts
5. Ensure Accounts RLS/authorities already allow directory (they do via role checks in `dealers.ts`)

### Files
- `src/actions/dealers.ts`
- `src/components/dealers/dealers-workspace.tsx`
- `src/lib/domain/dealers.ts`
- `src/app/(dashboard)/dealers/page.tsx`

### Open questions
- Should “shortly due” also include install-in-progress only, or any post–pre-dispatch-verified stage? **Default: any stage ≥ pre_dispatch_verified until commission approved.**

---

## Cross-cutting rules

1. **Do not confuse** Won `company_bears_subsidy` with sales_stage `subsidy_pending` (meter/liaison). UI labels must say **“Company subsidy (Won)”** vs **“Subsidy follow-up (liaison)”**.
2. **Payment cap** uses customer quotation payable; company subsidy is off-books relative to customer milestones.
3. All new money queries scoped by `company_id` + existing lead visibility; Accounts uses `view_all_leads` / role shortcuts already granted where possible — verify Accounts can SELECT all customers for receivables (may need authority tweak like payment verify / leads update).
4. After implement: sync Deliverables when asked; run migrations on prod Supabase.

---

## Suggested schema sketch

```sql
-- 045 (illustrative)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consumer_number TEXT,
  ADD COLUMN IF NOT EXISTS company_bears_subsidy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subsidy_amount_at_won NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_leads_company_bears_subsidy
  ON leads (company_id)
  WHERE company_bears_subsidy = true;

CREATE INDEX IF NOT EXISTS idx_leads_consumer_number
  ON leads (company_id, consumer_number)
  WHERE consumer_number IS NOT NULL;
```

Optional later: `dealer_commissions.paid_at` if “approved” ≠ “paid to bank.”

---

## Test plan (when implementing)

- [ ] Won without consumer number blocked; with checkbox on/off persists and shows on Overview  
- [ ] Accounts receivables lists lead with only company subsidy pending (milestones fully paid)  
- [ ] Record payment that would exceed quote grand total → error; at exact remaining → OK  
- [ ] Dashboard Accounts: pending three buckets + collected three milestones match SQL spot-checks  
- [ ] Dealer with pre-dispatch verified + pending commission appears in shortly due; after approve, moves to paid month  
- [ ] Dealer detail date filter changes file count  
- [ ] Accounts role can open list/detail; Sales cannot see Accounts-only nav if restricted  
- [ ] Regression: payment verify still advances stage (migration `044`)

---

## Out of scope (unless requested later)

- Changing liaison subsidy timer / portal “subsidy received” UX  
- Full dealer bank payout ledger (UTR, TDS) beyond commission approve  
- Porting this package to MK / Recare / other forks  
- Non-solar quotation payment rules beyond shared cap helper  

---

## Status log

| Date | Note |
|------|------|
| 2026-09-17 | Plan authored + **implemented** Phases A–E (migration `045`, receivables, dashboard, dealers, payment cap) |
