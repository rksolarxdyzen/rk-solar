# RK Solar — Full Operational Workflow & RBAC

**App:** `Apps/RK-Solar`  
**PRD:** `docs/prd.md`  
**LMS plan:** `docs/plan.md`  
**Document version:** v1.0.0  
**Date:** 2026-08-10

This document is the **source of truth** for end-to-end stage progression and who is allowed to do what. Implement UI gates, server actions, and RLS from this file.

---

## 1. Roles

| Role key | Display name | Primary job |
|----------|--------------|-------------|
| `admin` | Admin / Owner | Tenant setup, roles, all overrides |
| `sales_manager` | Sales Manager | Lead distribute/reassign, view all sales pipeline, reopen lost |
| `tele_caller` | Tele-caller | Qualify leads, call/follow-up, schedule visits — **never** field survey |
| `surveyor` | Field Sales / Surveyor | Conduct digital survey on assigned visits only |
| `sales_executive` | Sales / Quotation | Create & send solar/non-solar quotations after survey |
| `feasibility` | Feasibility / Documentation | Alias for Documentation; can still upload the pre-install PDF |
| `accounts` | Accounts | Verify payments & subsidy bank credit; issue completion certificate |
| `ops_coordinator` | Installation Supervisor | Receives finalized (pre-dispatch verified) files and assigns installation crew |
| `installation_crew` | Installation Crew | Site geo, panel photos, serials, inverter serial, completion video — assigned jobs only |
| `liaison` | Documentation | Pre-install feasibility PDF after Won; post-install Discom / meter / subsidy |
| `service_engineer` | Service Engineer | Accept & close maintenance tickets |
| `service_supervisor` | Lead Service Supervisor | Force-assign unclaimed tickets |
| `customer` | Customer (Portal) | View project, mark meter installed, mark subsidy received, raise tickets |

> One user may hold **one primary role**. Prefer authority overrides over multi-role stacking unless Admin explicitly grants extra permissions.
>
> **User overrides:** Team & Access → **Users → Permissions** saves additive keys in `user_authorities` (on top of the role). Role → Permissions still edits the shared role for everyone. Dealers cannot be granted company-wide `view_all_*` / `full_access` extras.

---

## 2. Project lifecycle stages

Canonical `project_stage` (or equivalent on lead/project):

```
new_lead
  → contacted
  → visit_scheduled
  → survey_in_progress
  → survey_completed
  → quoted
  → quote_accepted
  → token_pending_verification          ┐
  → token_verified_and_feasibility_ok   ├─ parallel gates (see §4)
  → pre_dispatch_pending_verification   ┘
  → pre_dispatch_verified
  → installation_assigned
  → installation_in_progress
  → installation_completed
  → liaison_in_progress
  → meter_installed
  → subsidy_pending                     ← 15-day timer starts
  → subsidy_received_pending_accounts
  → completed
  ↘ lost (any pre-acceptance stage)
```

| Stage | Meaning |
|-------|---------|
| `new_lead` | Ingested; unassigned or assigned tele-caller |
| `contacted` | First call/activity logged |
| `visit_scheduled` | Tele-caller set visit datetime + surveyor |
| `survey_in_progress` | Surveyor started survey |
| `survey_completed` | Survey saved (lat/long, areas, feasibility, kW) |
| `quoted` | At least one quotation generated |
| `quote_accepted` | **Won** — customer accepted a quotation |
| `token_pending_verification` | Token payment recorded; Accounts verifies money (Documentation PDF is independent) |
| `token_verified_and_feasibility_ok` | Both parallel gates cleared |
| `pre_dispatch_pending_verification` | Pre-dispatch payment recorded; Accounts verifying |
| `pre_dispatch_verified` | Ready for crew assignment |
| `installation_assigned` | Crew assigned |
| `installation_in_progress` | Crew on site / uploading proofs |
| `installation_completed` | Photos + barcodes done; notify Accounts, Sales, Liaison |
| `liaison_in_progress` | Discom / meter process |
| `meter_installed` | Customer (or liaison override) marked meter installed |
| `subsidy_pending` | 15-day timer running |
| `subsidy_received_pending_accounts` | Customer marked subsidy received |
| `completed` | Accounts verified subsidy; certificate issued |
| `lost` | Closed lost with reason |

### 2.1 Pipeline and Customers split

- **Pipeline** shows lead stages from `new_lead` through `quote_accepted`, labelled **Won**.
- **Customers** shows `quote_accepted` and every fulfillment stage through `completed`.
- `quote_accepted` intentionally appears in both places as the handoff/overlap stage.
- A customer portal code is issued when the quotation is accepted (**Won**), not when installation completes.
- Payments, installation, liaison, and maintenance keep their dedicated operations queues.

Post-sales (maintenance / cleaning) runs **after** `completed` (or after `installation_completed` if business allows early service) — see §5.7.

---

## 3. End-to-end workflow

### 3.1 Lead acquisition

```
[Manual / Excel CSV / Facebook Ads API / Referral]
                    │
                    ▼
            Create Lead (new_lead)
                    │
                    ▼
     Sales Manager distributes → Tele-caller
```

| Step | Actor | Action |
|------|-------|--------|
| Create single lead | Tele-caller, Sales Manager, Admin | Manual form |
| Bulk import | Sales Manager, Admin (`import_leads`) | Excel/CSV → Phone, Name, Address |
| Facebook / Referral ingest | System | API creates lead + source tag |
| Distribute | Sales Manager (`distribute_leads`) | Set `assigned_telecaller_id` |

### 3.2 Tele-calling

```
new_lead → (first activity) → contacted
                │
                ▼
     Log calls / WhatsApp / follow-ups / reminders
                │
                ▼
     Schedule site visit + assign surveyor → visit_scheduled
```

| Rule | Detail |
|------|--------|
| Tele-caller **cannot** conduct or complete surveys | No edit on survey geo/feasibility fields |
| First logged call/activity on `new_lead` | Auto-advance to `contacted` |
| Schedule visit | Requires `visit_scheduled_at` + `assigned_surveyor_id` |
| Mark lost | Tele-caller (own leads) or Sales Manager; reason required |

### 3.3 Digital survey

```
visit_scheduled → survey_in_progress → survey_completed
```

**Open digital form** is also available in the lead header next to **Schedule visit** on `new_lead` / `contacted` (walk-in / general capture). Submitting advances to `survey_in_progress` then `survey_completed` without requiring a prior booked visit.

Surveyor captures:

- Demographics (if updates needed)
- Lat / Long
- Total terrace area (sq. ft.)
- Shadow-free area (sq. ft.)
- Feasibility boolean (shadow-free enough for requested kW?)
- Requested capacity (kW)

| Rule | Detail |
|------|--------|
| Assigned staff / lead owners (or Sales Manager / `conduct_survey`) | Can open and complete the digital survey form (`070`) |
| Feasibility Fail | May stay on lead with flag; Sales decides quote path / lost |
| Tele-caller | Read-only on survey after schedule |

### 3.4 Quotation

```
survey_completed → quoted → quote_accepted
```

| Template | Used for |
|----------|----------|
| Solar | Modules (TopCon / Mono PERC / Bifacial), brands, inverter, GEB/MGVCL charges, subsidy |
| Non-solar | RO / heaters etc. — no solar BOM |

Options: % or ₹ discount, custom T&Cs, payment milestone schedule.

| Actor | Can |
|-------|-----|
| Sales executive / Sales Manager | Create, edit draft, send PDF, mark accepted |
| Tele-caller / Surveyor | View linked quotes (optional read) — **no** price edit unless granted |
| Customer | View accepted quote in portal |

### 3.5 Token payment + parallel gates

```
quote_accepted
      │
      ▼
Customer pays Token / Advance
      │
      ▼
token_pending_verification
      │
      ├──────────────────────────────┐
      ▼                              ▼
[Accounts]                      [Feasibility]
Verify txn ID, date,            Upload Grid Feasibility Report
bank credit → payment Verified
      │                              │
      └──────────────┬───────────────┘
                     ▼
     BOTH required → token_verified_and_feasibility_ok
```

| Gate | Owner | Clears when |
|------|-------|-------------|
| A — Token verified | Accounts | Payment stage=`token`, status=`verified` |
| B — Feasibility report | Feasibility | File uploaded + marked approved |

System must **not** advance until **A ∧ B**.

### 3.6 Pre-dispatch → installation

```
token_verified_and_feasibility_ok
      │
      ▼
Customer pays Pre-Dispatch
      │
      ▼
pre_dispatch_pending_verification
      │
      ▼
Accounts verifies → pre_dispatch_verified
      │
      ▼
Ops assigns crew → installation_assigned
      │
      ▼
Crew uploads site photos + panel barcode/DCR scans
      │
      ▼
installation_completed
      │
      ▼
Auto-notify: Accounts, Sales, Liaison
```

| Payment stage | Triggers |
|---------------|----------|
| `token` | Parallel Accounts + Feasibility |
| `pre_dispatch` | Warehouse dispatch + crew routing (after verify) |
| `final` | Post-installation settlement (Accounts) |

### 3.7 Liaison, meter, subsidy

```
installation_completed → liaison_in_progress
      │
      ▼
Customer marks "Meter Installed" (portal)
  (Liaison may assist / override if policy allows)
      │
      ▼
meter_installed → START 15-day subsidy timer → subsidy_pending
      │
      ├────────────────────────────┐
      ▼                            ▼
Customer marks                 Day 15 elapsed, not marked
"Subsidy Received"             → alert Liaison follow-up
      │
      ▼
subsidy_received_pending_accounts
      │
      ▼
Accounts verifies bank deposit
      │
      ▼
Issue completion certificate → completed
```

### 3.8 Post-sales

```
completed (or eligible project)
      │
      ├── Every 15 days: cleaning reminder + referral nudge (Portal / WhatsApp)
      │
      └── Customer raises Service Ticket
                │
                ▼
         Notify 3 Service Engineers
                │
         First to Accept → owner
                │
         If none accept → Supervisor force-assigns
                │
         Engineer resolves + proof photos → Closed
```

---

## 4. Parallel & automated rules

| Trigger | Automation |
|---------|------------|
| First activity on `new_lead` | Stage → `contacted` |
| Visit scheduled with surveyor | Notify surveyor; stage → `visit_scheduled` |
| Survey saved complete | Stage → `survey_completed` |
| Quote accepted | Unlock token payment recording |
| Token payment recorded | Stage → `token_pending_verification`; open both parallel queues |
| Token verified **and** feasibility approved | Stage → `token_verified_and_feasibility_ok` |
| Pre-dispatch verified | Unlock crew assignment |
| Installation marked complete | Notify Accounts, Sales, Liaison |
| Meter installed | Start **15-day** subsidy timer |
| Timer expires without subsidy mark | Create Liaison follow-up task / notification |
| Subsidy verified by Accounts | Issue certificate; stage → `completed` |
| Every 15 days post-complete | Cleaning + referral notification |
| Ticket raised | Fan-out to 3 engineers |

---

## 5. RBAC

### 5.1 Principles

1. **Least privilege** — each role only gets authorities for its lane.
2. **Segregation of duties** — Tele-caller ≠ Surveyor; Accounts verifies money; Feasibility owns grid report; Customer signs meter/subsidy.
3. **Server-side enforce** — UI hide is not enough; actions + RLS check authorities.
4. **Audit everything** — stage moves, assignments, payment verify, meter/subsidy marks, ticket accept/close.

### 5.1.0 Home dashboard finance vs payments

- **`record_payment` / `view_payment_queues`** open `/payments` and may show a **scoped** Payment overview (assigned leadIds only). They do **not** unlock the home **Accounts finance** panel or company Pending / Collected MTD / Dealer-due KPI cards.
- Company finance on home (`canCompanyFinanceDashboard`) is for Admin, Accounts, Sales Manager, `verify_payment`, `view_reports`, `full_access`, or customer-wide lanes (`canSeeAllCustomers`). Unauthorized cards are **hidden**, not shown as zeros.
- Company-wide **Lead sources** require see-all leads / `view_reports` / Admin / Sales Manager — not `import_leads` alone.

### 5.1.1 Team & Access administration

- `/team` is available to active users with `manage_users`, `manage_roles`,
  `full_access`, or the Admin role.
- `manage_users` covers same-company account creation, role assignment, password
  reset, and activation. Non-privileged managers cannot manage Admin/full-access
  targets or assign privileged roles, and no user can change their own role or
  deactivate themselves.
- `manage_roles` covers custom role creation, role details, and grants from the
  fixed `authorities` catalog. System role slugs are immutable and system roles
  cannot be deleted.
- The Roles → **Permissions** editor lists grants by **page / module** (General,
  Pipeline & Customers, Quotes, Payments, Documentation, Installation, Service,
  Dealers, Grievances) with search and select-all. Same authority keys as §5.2;
  UI layout is `AUTHORITY_UI_SECTIONS` in `src/lib/domain/authorities.ts`.
- Roles also have **assignment pools** (`roles.assignment_pools`, migration
  `063`): which roles appear in Tele-caller, Field surveyor, Installation crew,
  Dealer, and Service engineer pickers. Configure per role (Edit details) or via
  Roles → **Assignment pools** matrix. Custom roles start empty until checked.
  Lists/validation use `listProfilesInPool` / `assertProfileInPool`.
- Custom roles remain in `profiles.role_id`; their enum baseline is `customer`.
  System roles synchronize both `profiles.role` and `profiles.role_id`.
- Passwords are handled only by Supabase Auth Admin APIs. Deactivation synchronizes
  `profiles.is_active` with an Auth ban and attempts rollback if either side fails.
- Apply `supabase/migrations/013_team_access.sql` after migrations 001–012.

### 5.2 Authority catalog

| Authority key | Description |
|---------------|-------------|
| `manage_settings` | Company settings, branding |
| `manage_roles` | Create/edit roles & authority grants |
| `manage_users` | Invite/deactivate users |
| `view_all_leads` | See all leads (not only assigned). Sales roles do **not** get this by default (`052`/`062`). Accounts/liaison/feasibility see customer stages via role + lane authorities; sales/tele/survey see only assigned/own files. |
| `view_quotations` | Open Quotes list / details for assigned leads + quotes you created |
| `view_all_quotations` | See every company quotation (`064`). Sales roles do **not** get this by default; Admin + Accounts do. Independent of `view_all_leads`. |
| `view_sales_rep_report` | Open `/reports/sales-reps` — closed deals and payments by sales rep/month (`065`). Default: Admin + Sales Manager. |
| `view_dealer_monthly_report` | Open `/reports/dealers` — monthly leads, files won, quotations by external dealer (`069`). Default: Admin + Sales Manager + Accounts. |
| `import_leads` | Excel/CSV import |
| `distribute_leads` | Assign tele-callers in bulk |
| `add_edit_leads` | Create/edit lead demographics |
| `delete_leads` | Permanently purge a lead/customer and related records (`067` `purge_lead_completely`). Admin default. Use for demo / test files through survey & install. Source **Demo / test** available on New Lead. |
| `reassign_leads` | Change tele-caller or surveyor |
| `log_sales_activity` | Calls, activities, follow-ups |
| `schedule_site_visit` | Set visit + assign surveyor |
| `conduct_survey` | Create/update survey record |
| `mark_lead_lost` | Mark lost with reason |
| `reopen_lost_leads` | Reopen lost |
| `create_quotations` | Build solar/non-solar quotes |
| `edit_quotation_pricing` | Discounts / price overrides |
| `send_quotations` | Send PDF / share link |
| `accept_quotations` | Mark quote accepted (staff side) |
| `record_payment` | Enter payment + txn metadata |
| `verify_payment` | Accounts: mark Verified |
| `upload_feasibility_report` | Documentation uploads the pre-install feasibility PDF after Won |
| `assign_installation_crew` | Ops coordinator |
| `upload_installation_proofs` | Site photos |
| `upload_panel_barcodes` | Barcode / DCR serial photos |
| `complete_installation` | Mark installation done |
| `manage_liaison` | Discom / meter staff tracking |
| `override_meter_installed` | Staff mark meter if customer cannot |
| `verify_subsidy` | Accounts verify subsidy deposit |
| `issue_completion_certificate` | Accounts |
| `view_accounts_queues` | Payment / subsidy verification queues |
| `accept_service_ticket` | Engineer claim ticket |
| `resolve_service_ticket` | Close with proof |
| `force_assign_service_ticket` | Supervisor |
| `view_reports` | Operational reports |
| `access_customer_portal` | Customer login surface |

### 5.3 Default role → authority matrix

| Authority | Admin | Sales Mgr | Tele-caller | Surveyor | Sales Exec | Feasibility | Accounts | Ops | Install Crew | Liaison | Svc Eng | Svc Sup | Customer |
|-----------|:-----:|:---------:|:-----------:|:--------:|:----------:|:-----------:|:--------:|:---:|:------------:|:-------:|:-------:|:-------:|:--------:|
| `manage_settings` | ● | | | | | | | | | | | | |
| `manage_roles` | ● | | | | | | | | | | | | |
| `manage_users` | ● | ○ | | | | | | | | | | | |
| `view_all_leads` | ● | | | | | | | | | | | | |
| `view_quotations` | ● | ● | ● | | ● | | ● | | | | | | |
| `view_all_quotations` | ● | | | | | | ● | | | | | | |
| `view_sales_rep_report` | ● | ● | | | | | | | | | | | |
| `import_leads` | ● | ● | | | | | | | | | | | |
| `distribute_leads` | ● | ● | | | | | | | | | | | |
| `add_edit_leads` | ● | ● | ● | ○ | ○ | | | | | | | | |
| `delete_leads` | ● | ○ | | | | | | | | | | | |
| `reassign_leads` | ● | ● | | | | | | | | | | | |
| `log_sales_activity` | ● | ● | ● | ○ | ○ | | | | | | | | |
| `schedule_site_visit` | ● | ● | ● | | | | | | | | | | |
| `conduct_survey` | ● | ● | | ● | | | | | | | | | |
| `mark_lead_lost` | ● | ● | ● | | ○ | | | | | | | | |
| `reopen_lost_leads` | ● | ● | | | | | | | | | | | |
| `create_quotations` | ● | ● | | | ● | | | | | | | | |
| `edit_quotation_pricing` | ● | ● | | | ● | | | | | | | | |
| `send_quotations` | ● | ● | | | ● | | | | | | | | |
| `accept_quotations` | ● | ● | | | ● | | | | | | | | |
| `record_payment` | ● | ○ | | | ○ | | ● | | | | | | |
| `verify_payment` | ● | | | | | | ● | | | | | | |
| `upload_feasibility_report` | ● | | | | | ● | | | | ● | | | |
| `assign_installation_crew` | ● | | | | | | | ● | | | | | |
| `upload_installation_proofs` | ● | | | | | | | ○ | ● | | | | |
| `upload_panel_barcodes` | ● | | | | | | | ○ | ● | | | | |
| `complete_installation` | ● | | | | | | | ● | ● | | | | |
| `manage_liaison` | ● | | | | | | | | | ● | | | |
| `override_meter_installed` | ● | | | | | | | | | ● | | | |
| `verify_subsidy` | ● | | | | | | ● | | | | | | |
| `issue_completion_certificate` | ● | | | | | | ● | | | | | | |
| `view_accounts_queues` | ● | | | | | | ● | | | | | | |
| `accept_service_ticket` | ● | | | | | | | | | | ● | ● | |
| `resolve_service_ticket` | ● | | | | | | | | | | ● | ● | |
| `force_assign_service_ticket` | ● | | | | | | | | | | | ● | |
| `view_reports` | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | | ○ | | ○ | |
| `access_customer_portal` | | | | | | | | | | | | | ● |

**Legend:** ● = default grant · ○ = optional / read-lean grant · blank = deny

### 5.4 Stage transition ACL

Who may move **into** the target stage (initiator):

| To stage | Allowed roles / authorities |
|----------|-----------------------------|
| `contacted` | System (auto) or Tele-caller (`log_sales_activity`) |
| `visit_scheduled` | Tele-caller / Sales Mgr (`schedule_site_visit`) |
| `survey_in_progress` | Surveyor (`conduct_survey`) |
| `survey_completed` | Surveyor (`conduct_survey`) |
| `quoted` | Sales Exec (`create_quotations`) |
| `quote_accepted` | Sales Exec / Sales Mgr (`accept_quotations`) |
| `token_pending_verification` | System when token payment recorded |
| `token_verified_and_feasibility_ok` | System when **both** gates clear |
| `pre_dispatch_pending_verification` | System when pre-dispatch payment recorded |
| `pre_dispatch_verified` | Accounts (`verify_payment`) |
| `installation_assigned` | Ops (`assign_installation_crew`) |
| `installation_in_progress` | Install crew / Ops |
| `installation_completed` | Install crew / Ops (`complete_installation`) |
| `liaison_in_progress` | System (auto on install complete) or Liaison |
| `meter_installed` | Customer (portal) or Liaison (`override_meter_installed`) |
| `subsidy_pending` | System (auto on meter installed) |
| `subsidy_received_pending_accounts` | Customer (portal) |
| `completed` | Accounts (`verify_subsidy` + `issue_completion_certificate`) |
| `lost` | Tele-caller / Sales Mgr (`mark_lead_lost`) — only before `quote_accepted` unless Manager override |

**Backward moves:** Sales Manager or Admin only (`reassign_leads` / admin), and always audited.

### 5.5 Visibility rules

| Role | Sees |
|------|------|
| Tele-caller | Leads where `assigned_telecaller_id = me` (unless `view_all_leads`) |
| Surveyor | Leads where `assigned_surveyor_id = me` and stage ≥ `visit_scheduled` |
| Sales Exec | Survey-completed+ projects for quoting; quotes they own |
| Feasibility / Documentation | Pre-install: Won+ files missing PDF. Post-install: Discom / meter / subsidy |
| Accounts | Payment verification + subsidy verification queues |
| Ops | `pre_dispatch_verified` and installation boards |
| Install crew | Assigned installation jobs only |
| Liaison | `installation_completed` → subsidy follow-ups |
| Service engineer | Open tickets routed to pool / owned by me |
| Customer | Own project only (portal) |
| Sales Manager / Admin | Admin: all (within tenant). Sales Manager: assigned only unless Team grants `view_all_leads` / `view_all_quotations` |
| Dealer | Only leads with `dealer_id = me` or `created_by = me`; quotations for those leads or `created_by = me` (`066` / hardened `068` `is_dealer_user`). Never company-wide — even if Team grants `view_all_*`. |
| Quotes list | Without `view_all_quotations`: assigned leads + quotes `created_by = me`. With it (Admin/Accounts default): company-wide. |
| Sales report | `/reports/sales-reps` requires `view_sales_rep_report`. Closed deals = `won_closed_at` in month; payments by `paid_at` (else `created_at`); rep = tele-caller ?? Assigned To. |
| Dealer report | `/reports/dealers` requires `view_dealer_monthly_report` (or assign/approve dealer). Leads = `created_at` in month; files won = Won in month; quotes = `created_at` in month; owner = `dealer_id` then dealer `created_by`. Also linked from Dealers → Monthly report. |

### 5.6 Hard segregation rules (must enforce)

| Rule ID | Rule |
|---------|------|
| R1 | Tele-caller **cannot** `conduct_survey` |
| R2 | Surveyor **cannot** `schedule_site_visit` or own tele-call distribute |
| R3 | Only Accounts can `verify_payment` / `verify_subsidy` |
| R4 | Feasibility cannot mark payments verified |
| R5 | Installation proofs/barcodes only by crew (or Ops assist) |
| R6 | Customer cannot edit internal stages except meter / subsidy / ticket raise |
| R7 | Crew assign still requires **pre-dispatch verified**. Docs PDF and token verify are independent |
| R8 | Crew assignment blocked until pre-dispatch **verified** |
| R9 | First engineer to `accept_service_ticket` wins; others blocked |
| R10 | Only Supervisor `force_assign_service_ticket` when unassigned/rejected |

---

## 6. Payment stages (RBAC detail)

| Payment stage | Who records | Who verifies | Unlocks |
|---------------|-------------|--------------|---------|
| `token` | Accounts or Sales (record) | **Accounts only** | Parallel feasibility queue (with record); advance when verified **and** feasibility OK |
| `pre_dispatch` | Accounts or Sales (record) | **Accounts only** | Crew assignment |
| `final` | Accounts | **Accounts only** | Settlement complete flag |

Each payment stores: amount, transaction ID, date, method, `verification_status` (`pending` \| `verified` \| `rejected`), verified_by, verified_at.

---

## 7. Customer portal permissions

| Action | Allowed |
|--------|---------|
| View project status & timeline | Yes (own) |
| View accepted quotation / invoices / self-declarations | Yes |
| View paid amount and remaining balance | Yes |
| Upload documents (PDF / image) | Yes |
| Mark **Meter Installed** | Yes (once) |
| Mark **Subsidy Received** | Yes (while `subsidy_pending`) |
| Raise complaint / maintenance ticket (Complaints tab) | Yes — own project only |
| View own complaints (`service_tickets` for portal lead) | Yes — never company-wide |
| View cleaning reminders / referral CTA | Yes |
| Edit survey, payments, internal docs | **No** |
| Accept installation / verify bank | **No** |
| Staff internal Grievances (`/grievances`) | Staff only — not the customer portal |

Portal Complaints = `service_tickets` scoped by portal code + phone → one lead (`loadPortalTicketsForLead`). Staff **Grievances** remain a separate internal module.

---

## 8. Workflow diagram (full)

```
[Ingest: Manual | Excel | Facebook | Referral]
                 │
                 ▼
        Assign Tele-caller ──► Call / Qualify / Follow-up
                 │
                 ▼
        Schedule Visit + Assign Surveyor
                 │
                 ▼
        Digital Survey (geo, terrace, shadow-free, feasibility, kW)
                 │
                 ▼
        Quotation (Solar | Non-Solar) → Accept
                 │
                 ▼
        Token Payment
         ┌───────┴───────┐
         ▼               ▼
   Accounts Verify   Feasibility Report
         └───────┬───────┘
                 ▼
        Pre-Dispatch Payment → Accounts Verify
                 │
                 ▼
        Assign Install Crew → Photos + Panel Barcodes
                 │
                 ▼
        Notify Accounts + Sales + Liaison
                 │
                 ▼
        Liaison / Meter → Customer: Meter Installed
                 │
                 ▼
        15-Day Subsidy Timer
         ┌───────┴───────┐
         ▼               ▼
  Subsidy Received    Timer expired → Liaison chase
         │
         ▼
  Accounts Verify → Completion Certificate
         │
         ▼
  Post-sales: Cleaning nudges + Tickets (3 engineers / Supervisor)
```

---

## 9. Implementation notes

1. Encode authorities in DB (role_permissions) like Sumeru; seed defaults from §5.3.
2. Every transition in §5.4 must write `audit_events`.
3. Prefer a single `projects`/`leads` stage field + child tables (`surveys`, `quotations`, `payments`, `installations`, `tickets`).
4. Parallel gates: store boolean flags `token_verified`, `feasibility_approved`; computed stage advances only when both true.
5. Keep this file updated when PRD stage names change; update `Global Instructions/memory.md` after RBAC seed ships.

---

## 10. Related docs

| Doc | Role |
|-----|------|
| `docs/prd.md` | Product requirements |
| `docs/plan.md` | LMS build plan + Sumeru coverage matrix |
| `docs/workflow.md` | **This file** — lifecycle + RBAC |
