# RK Solar — Revision Plan

**App:** `Apps/RK-Solar` (product brand: **RK Solar**)  
**Client package:** `Deliverables/rk-solar`  
**Document:** `docs/revise.md`  
**Status:** Planning (locked for implementation sequencing)  
**Date:** 2026-08-27  
**Source brief:** Product revision request (Dashboard · Reports · Nav/UX · Quotation rules · Validations · Bugs)

---

## 0. Goal

Bring the RK CRM from “pipeline census + ops queues” to an **owner-grade operations cockpit**: actionable KPIs, automated daily/employee reports, cleaner navigation, hard Won gates, meter/payment profile fields, quotation subsidy rules by meter class, and two urgent correctness bugs.

This plan is the working checklist. Implement in the phase order below unless urgency overrides (Phase 0 bugs first).

---

## 1. Decisions

| # | Topic | Decision | Status |
|---|--------|----------|--------|
| **D1** | Branding | Keep **RK** as tenant brand (logo, colors, proposal letterhead). Platform credit: **“Powered by Dyzen Solar Technologies”** on app chrome, login, portal, referral, and quotation page footers. Do not replace the RK lockup. | **Locked** 2026-08-27 |
| D2 | Nav rename | Relabel Pipeline → **Leads**; keep URL `/pipeline` (optional `/leads` redirect). | **Done** 2026-08-27 |
| D3 | Documentation | Relabel Liaison → **Documentation** (same Discom + docs queue), or `/documentation` alias. | **Done** 2026-08-27 |
| D4 | Quoted removal | Drop *Quoted* from Customers phases; keep `quoted` on Leads side only. | **Done** 2026-08-27 |
| **D5** | Revenue | **Accepted quotation `grand_total`** for files whose **Won date** falls in the period (monthly MoM, daily email, employee sales output base). | **Locked** 2026-08-27 |
| D6 | Pending subsidy ₹ | Sum `quotations.subsidy` for install-completed / liaison-pending files not yet subsidy-verified/completed. | Open |
| **D7** | Dealers | Phase 6: `dealer` role, scoped visibility, commission form on file completed. | **Done** 2026-08-27 |
| D8 | Evening email | New cron + email provider; `DAILY_REPORT_TO` / company setting. | **Done** 2026-08-27 |

---

## 2. Current baseline (as of 2026-08-27)

| Area | Exists today | Gap vs this revise |
|------|--------------|--------------------|
| Dashboard | Branded hero, pipeline funnel, reminders attention, customer phases, RBAC ops pulse, sources | Missing month MoM KPIs, revenue, payment collected/pending, pipeline value (30d avg rule), subsidy pending ₹, oldest ticket, “files won this month” |
| Reports | None automated for ops digest | Evening email + employee performance |
| Nav | Flat top nav: Dashboard, Pipeline, Customers, Quotes, Payments, Feasibility, Install, Liaison, Service, Catalog, Import, Ingest, Reminders, Team | Need Leads / Installation / Documentation / Others / Settings grouping; drop Reminders tab |
| Reminders | `/reminders` page + header bell | Consolidate into Alerts drawer; fix Mark as Done |
| Customers | Phase includes Quoted | Remove Quoted phase |
| Won | `markLeadWon` → `quote_accepted` + portal code; **no** docs/tech/payment modal | Hard gate missing (bug + feature) |
| Quotes | Solar builder: residential / commercial; subsidy schemes incl. society common meter | Align UI to Meter Type Residential \| Commercial \| Common; residential subsidy **toggle**; Common = **manual** subsidy; Commercial = ₹0 |
| Lead profile | Temperature, assignees, survey, docs vault | Missing Meter Type, Meter ownership, Payment Plan |
| Service tickets | Create without mandatory photo | Require ≥1 photo |
| Import | Fixed column expectations | Admin column-mapping in Settings |
| Grievances | None | New module |
| Dealers / commissions | `dealer` role + `dealer_commissions` | — |

Key code touchpoints:

- Dashboard: `src/lib/dashboard/load-dashboard.ts`, `src/components/dashboard/*`, `src/app/(dashboard)/page.tsx`
- Nav: `src/components/layout/app-shell.tsx`, `src/lib/nav-access.ts`
- Won: `src/actions/leads.ts` (`markLeadWon`), `src/components/leads/move-to-won-button.tsx`
- Reminders: `src/actions/reminders.ts` (`resolveReminder`), `reminder-bell.tsx`, `/reminders`
- Quotes: `src/lib/quotations/subsidy.ts`, `project-type.ts`, builder forms
- Cron: `src/app/api/cron/reminders/route.ts`

---

## 3. Phase 0 — Urgent bug fixes (ship first)

**Status: Done (2026-08-27)** — apply migration `022_won_closing_gate.sql`.

### 0.1 Alert “Mark as Done” does not clear — **Fixed**

- `resolveReminder` now verifies the DB row was updated (or already resolved), syncs `next_followup_at`, and returns `{ ok: true }`.
- Synthetic `survey:` ids resolve the open `survey_scheduled` reminder for the lead.
- Alerts bell + Reminders page: optimistic remove, error surface, `router.refresh()`.

**Acceptance:** Clicking Mark as Done removes the item from the Alerts drawer immediately and after reload. ✅

### 0.2 Move to Won bypasses validation — **Fixed**

- `markLeadWon(leadId, payload)` **rejects** without complete payload + mandatory docs (server-side).
- UI: Won modal collects (1) system technical details, (2) payment breakdown, (3) electricity bill + customer ID uploads.
- Migration `022_won_closing_gate.sql` stores Won fields on `leads`.
- Sales roles can upload portal docs for the gate (`canManageLeadDocs` expanded).

**Acceptance:** Calling `markLeadWon` without required payload/docs returns an error; UI cannot skip the modal. ✅

---

## 4. Phase 1 — Dashboard specs & metrics

**Status: Done (2026-08-27)**

### 4.1 KPI cards (home) — **Shipped**

| KPI | Definition | MoM / detail |
|-----|------------|--------------|
| **Active Leads** | Pipeline stage counts | Subtext: added this calendar month |
| **Files Won (This Month)** | `won_closed_at` or first audit `quote_accepted` in month | **% change** vs prior month |
| **Monthly Revenue** | Accepted quote `grand_total` for files Won in month (**D5**) | **% change** vs last month |
| **Payment Overview** | Verified collected vs pending verification amounts | Dual metric |
| **Installations** | Completed (stage ≥ install completed) vs pending assign/in-progress | Dual metric |
| **Outstanding Tasks** | Overdue reminders + pending payments + subsidy overdue + open tickets | Detail breakdown |
| **Pipeline Value (30d)** | Sent/accepted quotes in 30d; **average per lead**, then sum | Currency |
| **Services Pending** | Open vs total tickets + oldest open ticket | Dual + detail |
| **Pending Subsidy Amount** | Sum `quotations.subsidy` for install/liaison stages not subsidy-verified | Currency |

RBAC: finance/revenue/payments/subsidy/services gated by nav authorities.

Helpers: `src/lib/dashboard/metrics.ts` (+ `assertPipelineValueRules` smoke). Loader: `load-dashboard.ts`.

### 4.2 UI — **Shipped**

- Branded hero retained; **Key metrics** KPI grid with MoM chips; pipeline + attention + journey + sources kept.

### 4.3 Data layer — **Shipped**

- Visible-lead scoped queries; audit fallback for Won dates; graceful if `won_closed_at` missing pre-022.

---

## 5. Phase 2 — Automated reports

**Status: Done (2026-08-27)** — apply migration `023_report_runs.sql`.

### 5.A Evening daily email (system-wide) — **Shipped**

- Route: `GET/POST /api/cron/daily-report` (`CRON_SECRET`)
- Schedule: `vercel.json` → `30 13 * * *` (≈19:00 IST)
- Recipients: `DAILY_REPORT_TO` + `companies.daily_report_emails`
- Delivery: Resend when `RESEND_API_KEY` set; otherwise logs HTML and marks run `logged`
- Idempotent: `report_runs` unique on `(company_id, daily_evening, report_date)`
- Metrics: leads reached, new uncontacted, surveys, quotes (deduped), D5 revenue, cash collected, installs, tickets open/closed/total

### 5.B Employee performance — **Shipped** (section inside daily email)

Per tele-caller / sales executive / surveyor / sales manager: assigned · uncontacted new · calls today · visits today · revenue (Won today → `assigned_telecaller_id`).

---

## 6. Phase 3 — UI/UX structure & navigation

### 6.1 Tab & module hierarchy

```
Dashboard
Leads                    ← was Pipeline (/pipeline)
Installation
Documentation            ← was Liaison (Discom + docs) — see D3
Others ▾
  ├ Quotes
  ├ Payments
  ├ Feasibility
  └ Service              ← kept under Others (not primary tab)
Settings ▾
  ├ Import               ← column-mapping lives here
  ├ Ingest
  ├ Catalogue
  └ Team & Access
```

**Removed from primary nav:** Reminders (→ Alerts drawer). **Shipped (Phase 3a):** grouped nav + Alerts drawer + `/alerts`; redirects `/reminders`→`/alerts`, `/leads`→`/pipeline`, `/documentation`→`/liaison`.

**Customers:** Keep accessible from Dashboard / Leads handoff (Won → Customers). Options: (a) retain Customers as secondary under Leads, or (b) keep a slim Customers entry under Others. **Default:** keep **Customers** as a child of Leads dropdown or a header action from Leads — avoid losing the Won workspace. Confirm with client if Customers stays top-level.

### 6.2 Reminders → Alerts drawer

- Enhance header `ReminderBell` into **Alerts** drawer (reminders + optional subsidy/payment badges).
- Footer link: **View all reminders** → lightweight `/alerts` or modal full list (not a main tab).
- Delete or redirect `/reminders` → alerts experience.
- Fix Mark as Done (Phase 0).

### 6.3 Design refresh — **PageHeader shipped** (Phase 3b)

- Reuse dashboard visual language (Fraunces + Manrope, blue/orange tokens, soft surfaces) on **Leads, Installation, Documentation, Quotes, Payments, Settings** page chrome. ✅ via `PageHeader`
- Shared `PageHeader` component: title, subtitle, primary actions. ✅ `src/components/layout/page-header.tsx`
- No purple / cream-terracotta / broadsheet patterns; stay on RK system.

### 6.4 Branding (D1 — locked)

- Primary identity remains **RK Solar**.
- Platform credit copy (exact): **Powered by Dyzen Solar Technologies**
- Surfaces: dashboard shell footer, login, customer portal, referral form, quotation print page footers.
- Constant: `BRAND.poweredBy` in `src/lib/brand.ts` (+ quotations brand mirror).
- Daily report emails (Phase 2) should include the same credit in the email footer.

### 6.5 Customers: remove Quoted phase — **Shipped** (Phase 3b)

- Update `CUSTOMER_PHASES` — drop `quoted`. ✅
- `quoted` leads: **Quoted** column on Leads board — **not** in Customers. ✅
- Adjust `getCustomers()` / filters accordingly. ✅
- Shared `PageHeader` on module pages. ✅

### 6.6 Grievances (new) — **Shipped** (Phase 3c)

Internal company issue tracking (not customer service tickets).

| Item | Spec |
|------|------|
| Route | `/grievances` under **Settings** ✅ |
| Fields | Title, description, category, priority, raised_by, assignee, status (`open` / `in_progress` / `escalated` / `resolved`), attachments ✅ |
| ACL | All staff can raise; managers (`admin` / `sales_manager` + escalate/resolve authorities) escalate/resolve ✅ |
| UI | List + detail modal; Outstanding Tasks includes open count + links to `/grievances` when open ✅ |

Migration: **`026_grievances.sql`**. Attachments reuse `proofs` bucket (`folder=grievances`).

### 6.7 Dealer access & commissions — **Shipped** (Phase 6)

- Role: `dealer` (enum + Team role) — never `canSeeAllLeads`; scoped via `leads.dealer_id` (+ create/assign/created_by). ✅
- On file **completed** (`verifySubsidy`): prompt **Dealer Commission Form** (amount / %, notes) when dealer linked; Accounts approve/reject. ✅
- Migrations: **`027_dealer_role.sql`**, **`028_dealer_commissions.sql`**.
- Explicitly **not** Jay Type A/B ledger.

---

## 7. Phase 4 — Quotation engine rules

**Status: Done (2026-08-27)**

### 7.1 Meter type → subsidy matrix — **Shipped**

| Meter type | Subsidy | Rules |
|------------|---------|-------|
| **Residential** | Enabled (dynamic) | Existing slab calc; **“Apply residential subsidy”** toggle. When off → ₹0 / scheme `none`. |
| **Commercial / Industrial** | Disabled | Strictly **₹0 / No subsidy**. UI + `enforceQuotationSubsidyMatrix` on upsert. |
| **Common (Societies)** | Manual entry | User enters subsidy ₹. Scheme `society_common_meter`; packaging stays residential. |

### 7.2 Model changes — **Shipped**

- Product language: **Meter Type** on solar builder (`MeterTypeSelector`).
- Lead `meter_type` seeds new-quote defaults via `meterTypeToQuoteDefaults`.
- Map: residential (+ toggle) · commercial → `none`/₹0 · common → society scheme + manual ₹.
- Print uses `resolveQuotationSubsidyBreakdown` (stored amount + scheme).

### 7.3 Acceptance — **Met**

- Commercial quote cannot save non-zero subsidy. ✅
- Common quote requires explicit subsidy field (0 allowed if entered). ✅
- Residential with toggle off saves subsidy 0; toggle on uses dynamic calc (editable). ✅

---

## 8. Phase 5 — Workflow rules, validation & profile fields

### 8.1 Customer / lead profile mandatory fields — **Shipped** (Phase 5a)

Add to lead (and show in customer modal):

| Field | Values |
|-------|--------|
| **Meter Type** | `Residential` \| `Commercial` \| `Common` |
| **Meter Name / Ownership** | `Self` \| `Wife` \| `Husband` \| `Mother` \| `Father` \| `Son` \| `Daughter` |
| **Payment Plan** | `Loan` \| `Cash` |

- Migration `024_lead_profile_fields.sql` (nullable first → required at Won gate). ✅
- Edit in lead detail + customer modal. ✅

### 8.2 Move to Won — hard gate — **Deepened** (Phase 5a)

Block Won until modal collects **all** of:

1. **Meter & payment profile** (meter type, ownership, payment plan) ✅
2. **System technical details** (system size / module / inverter package — from survey or quote linkage) ✅
3. **Final payment breakdown** (token / pre-dispatch / final planned amounts or schedule) ✅
4. **Mandatory customer documents** uploaded (electricity bill + customer ID) ✅

Server enforces; UI is modal wizard. Fixes Phase 0.2 + 5a.

### 8.3 Service ticket creation — **Shipped** (Phase 5b)

- Require **≥1 photo** before submit (client + server). ✅
- Reject raise without photos (`staffRaiseServiceTicket` / `portalRaiseServiceTicket`). ✅
- Portal: `portalUploadTicketPhoto`; staff: `ProofUploadButton`.

### 8.4 Excel import — dynamic column mapping — **Shipped** (Phase 5b)

- Import under **Settings** (Phase 3a). ✅
- Admin UI: upload sample → map CSV columns → saved profile. ✅
- Persist mapping JSON on `lead_import_profiles` — migration **`025_lead_import_profiles.sql`**. ✅

---

## 9. Suggested implementation order

| Phase | Scope | Effort (indicative) | Depends on |
|-------|--------|---------------------|------------|
| **0** | Mark as Done bug + Won server reject stub | S | — |
| **1** | Dashboard KPI rebuild | M | D5, D6 |
| **3a** | Nav regroup + Alerts drawer + remove Reminders tab | M | 0.1 |
| **3b** | Drop Quoted from Customers + PageHeader refresh | S | — |
| **5a** | Profile fields migration + Won modal hard gate | M | 0.2 |
| **4** | Quotation meter/subsidy matrix + residential toggle | M | 5a meter type |
| **5b** | Ticket photo required + Import column mapping | M | 3a Settings |
| **2** | Daily + employee email reports | M | 1 metrics helpers, email provider |
| **3c** | Grievances v1 | M | 3a |
| **6** | Dealer ACL + commission form | L | 5a completion stage |

---

## 10. Migrations & env checklist

**Likely migrations**

- `leads.meter_type`, `leads.meter_ownership`, `leads.payment_plan` → **`024_lead_profile_fields.sql`**
- Won gate artifacts: payment breakdown JSON / required doc checklist flags → **`022_won_closing_gate.sql`**
- `grievances` (+ attachments) → **`026_grievances.sql`**
- `lead_import_profiles` (column map) → **`025_lead_import_profiles.sql`**
- `dealer_commissions` (Phase 6) → **`027_dealer_role.sql`** + **`028_dealer_commissions.sql`**
- `report_runs` for daily email idempotency → **`023_report_runs.sql`**
- Optional: `companies.daily_report_emails`

**Env**

- `CRON_SECRET` (existing)
- `DAILY_REPORT_TO` / SMTP or Resend keys
- Confirm WhatsApp outbox remains separate

---

## 11. Test plan (high level)

- [ ] Mark as Done clears alert (bell + full list + reload)
- [ ] Won without docs/tech/payment → error; with all → `quote_accepted` + portal code
- [ ] Dashboard KPIs match SQL spot-checks for a known demo company (`mockdata.sql`)
- [ ] Pipeline value: 1 lead × 3 quotes → average; 1 lead × 1 quote → exact
- [ ] Commercial subsidy always 0; Common manual; Residential toggle on/off
- [ ] Ticket create blocked without photo
- [ ] Import mapping remaps columns and creates leads
- [ ] Nav: no Reminders tab; Others/Settings menus RBAC-correct
- [ ] Customers phases exclude Quoted
- [ ] Evening cron dry-run renders expected counts

---

## 12. Out of scope (unless added later)

- Full Jay-Sardar dealer ledger / Type A–B pricing
- Replacing RK brand with Dyzen as primary identity (**D1**)
- Mobile native apps
- Changing Discom statutory workflow beyond Documentation rename

---

## 13. Tracking

| Item | Owner | Status |
|------|-------|--------|
| D1 Dyzen powered-by credit | Eng | **Done** (chrome + login + portal + referral + quote footers) |
| D5 Revenue = accepted quote on Won date | — | **Locked** |
| Phase 0 bugs | Eng | **Done** (alerts resolve + Won hard gate; migration `022`) |
| Phase 1 dashboard | Eng | **Done** (KPI grid, MoM, pipeline-value avg, D5 revenue) |
| Phase 2 daily reports | Eng | **Done** (`/api/cron/daily-report`, `023_report_runs`, Resend/log) |
| D2 / D3 / Phase 3a nav + Alerts | Eng | **Done** (grouped nav, Alerts drawer, `/alerts`, redirects) |
| D4 / Phase 3b Quoted + PageHeader | Eng | **Done** (Quoted on Leads; Customers from Won; shared PageHeader) |
| Phase 5a profile + Won deepen | Eng | **Done** (`024_lead_profile_fields`; Won requires meter/ownership/plan) |
| Phase 4 quote subsidy matrix | Eng | **Done** (Meter Type UI, residential toggle, commercial assert, common manual) |
| Phase 5b ticket photo + import map | Eng | **Done** (raise requires photo; `025_lead_import_profiles`) |
| Phase 3c Grievances v1 | Eng | **Done** (`/grievances`, `026_grievances`, Outstanding Tasks link) |
| D7 / Phase 6 dealers + commissions | Eng | **Done** (`dealer` role, `dealer_id` ACL, commission form on completed, `027`/`028`) |

Update this table as phases complete. After meaningful implementation, append `Global Instructions/memory.md`.

---

## Appendix A — Spec traceability

| Spec section | Plan section |
|--------------|--------------|
| 1. Dashboard KPIs | §4 |
| 2. Automated reports | §5 |
| 3. Nav / UX / Reminders / Quoted / Grievances / Dealers | §6 |
| 4. Quotation meter/subsidy | §7 |
| 5. Profile fields, Won gate, ticket photo, import map, bugs | §3, §8 |

## Appendix B — Pipeline value calculation (normative)

```
for each lead that has ≥1 quotation with sent_at/created_at in [now-30d, now]:
  values = amounts of those quotations (grand_total)
  lead_pipeline_value = average(values)   # or exact if len==1
pipeline_value = sum(lead_pipeline_value)
```

Draft / cancelled quotations excluded once statuses exist; until then use all non-deleted quotes linked to the lead.
