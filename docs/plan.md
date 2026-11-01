# RK Solar — Leads Management System Plan

**App:** `Apps/RK-Solar`  
**Source reference:** `Apps/SUMERU-SOLUTIONS` (Leads Management System)  
**PRD alignment:** KT Module 1 (Lead Ingestion & Sales Operations) + handoff into Module 2 (Digital Survey)  
**Related:** `docs/workflow.md` (full lifecycle + RBAC — source of truth for roles/stage ACL)  
**Document version:** v1.0.0  
**Date:** 2026-08-10

---

## 1. Goal

Implement a **Sumeru-quality Leads Management System** inside RK Solar, then extend it for RK-specific sales segregation:

| KT requirement | Approach |
|----------------|----------|
| Manual + CSV/Excel lead ingestion | **Reuse** Sumeru lead CRUD + Excel import |
| Facebook Ads / Referral API ingestion | **New** (not in Sumeru) |
| Tele-calling team (qualify, schedule visits; no field visits) | **Reuse** call logs / followups / reminders; **adapt** roles & assignment |
| Field Sales / Surveyors (assigned visits only) | **Adapt** dual-assignee model (`assigned_telecaller` + `assigned_surveyor`) |
| Pipeline → book survey → survey complete | **Reuse** pipeline + book-survey pattern; **adapt** stages & who can act |

This plan covers **LMS only** (ingest → tele-call → assign surveyor → ready for survey). Quotation, 3-stage payments, installation barcodes, Discom, and customer portal are **later phases** (see §8).

---

## 2. What Sumeru already has (inventory)

Sumeru stack: **Next.js + Supabase + Tailwind + Zod**, multi-tenant CRM (`companies` / `profiles`), authority-based RBAC.

### 2.1 Core LMS surfaces

| Feature | Key paths |
|---------|-----------|
| Lead CRUD / list / detail modal | `src/actions/leads.ts`, `src/components/leads/lead-detail-*.tsx`, `new-lead-button.tsx`, `edit-lead-button.tsx` |
| Pipeline kanban | `src/components/leads/pipeline-board.tsx`, `lead-card.tsx`, `stage-stepper.tsx`, `/pipeline` |
| Tele-calling & followups | `src/actions/sales.ts`, `sales-actions-panel.tsx`, `lead-activity-panel.tsx`, `call_logs`, lead followup columns |
| Reminders | `src/actions/reminders.ts`, `/reminders`, `reminders` table |
| Excel import + distribute | `src/actions/lead-import.ts`, `lead-import-workspace.tsx`, `/lead-import` |
| Reassign / view-as | `lead-reassign-panel.tsx`, `view-as-employee-select.tsx` |
| Audit timeline | `src/lib/audit.ts`, `audit-timeline.tsx`, `audit_events` |
| Attachments / files | `attachments-panel.tsx`, `/files` |
| RBAC authorities | `src/lib/domain/authorities.ts`, custom roles migrations |
| Visibility (own vs all leads) | `src/lib/leads/visibility.ts`, `view_all_leads` |

### 2.2 Sumeru sales stage machine (reference)

```
new_lead → contacted → survey → survey_completed → closed_won → project_completed
                                                              ↘ lost
```

Defined in `src/lib/domain/workflow.ts`; gates in `src/lib/workflow-rules.ts`.

### 2.3 Post-LMS modules in Sumeru (not LMS core)

Installation dual-team photo gates, documentation OC checklist, after-sales tickets, full quotation engine (`src/lib/quotations/**`), payment workspace — useful later, **out of scope for this LMS plan**.

---

## 3. Reuse matrix — Use / Adapt / Do not copy

### ✅ USE (copy patterns & structure into KT)

| Capability | Why it fits KT |
|------------|----------------|
| Lead entity shape (name, phone, address, source, temperature, notes, assignee, stage) | Matches PRD Lead attributes |
| Pipeline kanban + lead card + detail modal UX | Proven LMS UX |
| Call outcomes, activity log, next follow-up, reminders | Tele-caller day-to-day work |
| Excel/CSV import batches + row validation + distribute | PRD bulk ingestion |
| Audit events (append-only timeline) | PRD auditability principle |
| Authority keys pattern (`import_leads`, `distribute_leads`, `add_edit_leads`, `reassign_leads`, `view_all_leads`, …) | RBAC foundation |
| Own-vs-all lead visibility | Tele-callers see own queue; managers see all |
| Soft link `quotations.lead_id` (integration stub only) | Future Module 3 without coupling engines |
| Multi-tenant companies/profiles + RLS approach | Same deployment model |

**Primary Sumeru files to treat as blueprints (not blind paste):**

- `src/actions/leads.ts`, `sales.ts`, `lead-import.ts`, `reminders.ts`
- `src/lib/domain/workflow.ts`, `sales.ts`, `authorities.ts`
- `src/lib/workflow-rules.ts`, `src/lib/leads/visibility.ts`, `src/lib/audit.ts`
- `src/components/leads/{pipeline-board,lead-card,lead-detail-*,sales-actions-panel,lead-activity-panel,lead-import-workspace,lead-reassign-panel,book-survey-panel,audit-timeline,new-lead-button,edit-lead-button}.tsx`
- Migrations conceptually: `001` (leads), `006` (call/followups), `009` (import), `005`/`020`/`026` (roles/permissions), audit/attachments

### ♻️ ADAPT (same idea, KT product rules)

| Sumeru behavior | KT change |
|-----------------|-----------|
| Single `assigned_to` | Split: **`assigned_telecaller_id`** + **`assigned_surveyor_id`** |
| Any sales user can book/complete survey | **Only tele-caller** schedules visit; **only surveyor** conducts/completes survey |
| Stages through `closed_won` in one sales funnel | LMS stages stop at **survey ready / survey completed**; won/quote come later |
| Sources: call, walk_in, referral, campaign, website, other, excel_import | Add **`facebook_ads`**, keep **referral**, **manual**, **excel_import** |
| `bookSurvey` sets survey date on lead | Also creates **Field Visit assignment** to surveyor + notify |
| `roof_area_sqft` / `recommended_system_kw` on lead | Keep light fields on lead; full terrace/shadow/feasibility live in **Survey** entity (Module 2) |
| Role presets (Sumeru employees) | KT roles: **Tele-caller**, **Field Sales/Surveyor**, **Sales Manager**, **Admin** |
| Follow-up actions include “Schedule Survey” | Make scheduling a **gated workflow action** (assign surveyor + datetime), not just a note |

### ❌ DO NOT COPY into RK LMS

| Item | Reason |
|------|--------|
| Sumeru / Sangani branding, bank details, QR, `public/brand/**`, `quotations/brand.ts` | Wrong company |
| Full quotation engine, rate card, commercial GST, PDF templates | Separate Module 3; use Quotation-Generator / KT templates later |
| Dual-team installation photo gates (`team_1` / `team_2`) | KT Module 5 is barcode-centric, different crew model |
| Documentation OC checklist stages as-is | KT uses Discom liaison + 15-day subsidy timer (Module 6) |
| Free-form payment workspace as final payment model | KT needs Token / Pre-Dispatch / Final (Module 4) |
| Legacy DB tables: `loan_records`, `name_transfer_records`, old `service_calls` | Unused / wrong domain for RK LMS |
| Seed data for Sangani Enterprise | Replace with KT tenant seed |
| Customer “portal” assumptions from internal customers list | KT portal is net-new later |

---

## 4. Target RK LMS design

### 4.1 Roles (LMS scope)

| Role | Can do |
|------|--------|
| **Tele-caller** | Own leads: call, log activity, set follow-up, qualify, **schedule site visit & assign surveyor**. Cannot mark survey complete / edit survey geo fields. |
| **Field Sales / Surveyor** | See leads assigned for visit; open survey capture (Module 2). Cannot own tele-call queue. |
| **Sales Manager** | Distribute / reassign, view all leads, reopen lost, import approve |
| **Admin** | Roles, permissions, delete leads, settings |

### 4.2 Proposed sales stages (LMS)

```
new_lead → contacted → visit_scheduled → survey_in_progress → survey_completed → [hand off to Quote]
                                                                              ↘ lost
```

| Stage | Owner | Notes |
|-------|-------|-------|
| `new_lead` | Tele-caller / unassigned | Fresh ingest |
| `contacted` | Tele-caller | Auto on first call/activity (Sumeru pattern) |
| `visit_scheduled` | Tele-caller sets; Surveyor assigned | Replaces Sumeru bare `survey` |
| `survey_in_progress` | Surveyor | Optional; or jump to completed |
| `survey_completed` | Surveyor | Gate: survey record saved (Module 2) |
| `lost` | Tele-caller / Manager | With reason |

Post-LMS stages (`quoted`, `token_paid`, …) are **not** in this phase.

### 4.3 Lead entity (LMS fields)

**Reuse from Sumeru:** name, phone, alternate_phone, email, city, address, source, source_detail, temperature, requirement_notes, sales_stage, created_by, loss_reason/notes, last_call_*, next_followup_*, total_calls.

**RK-specific:**

- `assigned_telecaller_id`
- `assigned_surveyor_id`
- `visit_scheduled_at`
- `visit_notes`
- `source` includes `facebook_ads` | `referral` | `manual` | `excel_import` | …

### 4.4 Ingestion channels

| Channel | Phase | Notes |
|---------|-------|-------|
| Manual form | **P1** | From Sumeru new-lead UI |
| Excel/CSV import | **P1** | Map Phone, Customer Name, Address (+ optional city/source) |
| Referral entry | **P2** | Form or API with referrer metadata |
| Facebook Lead Ads | **P2** | Webhook / scheduled pull → create lead; not in Sumeru |

---

## 5. Implementation phases

### Phase 0 — App bootstrap (prerequisite) ✅

- Scaffold KT Next.js app (align stack with Sumeru: Next + Supabase + Tailwind + Zod).
- Auth, `companies` / `profiles`, empty shell nav.
- Brand as **RK Solar** (no Sumeru assets).
- **Do not** copy quotation or install workspaces yet.

**Exit:** Login works; empty dashboard. **Done** — see `README.md` for env + migration setup.

### Phase 1 — LMS core (copy + strip) ✅

Lift Sumeru LMS blueprints into `Apps/RK-Solar`:

1. Schema: `leads`, `call_logs`, `reminders`, `audit_events`, `lead_import_*`, authorities/roles — `002_lms.sql`
2. Actions + UI: CRUD, pipeline, detail modal, call/followup panels, reminders page, import workspace, reassign, audit timeline.
3. Strip Sumeru brand strings and unused won/install/docs UI from lead detail.
4. Seed KT roles: Tele-caller, Surveyor, Sales Manager, Admin.

**Exit:** Manager can import leads; tele-caller can work a pipeline with calls & follow-ups. **Done** — still single `assigned_to` (dual assignee in Phase 2).

### Phase 2 — KT sales segregation (adapt) ✅

1. Add dual assignment columns + UI (tele-caller vs surveyor) — `003_dual_assignee.sql`
2. Implement `visit_scheduled` workflow: schedule datetime + assign surveyor + notify.
3. Enforce RBAC: tele-caller cannot complete survey; surveyor cannot reassign tele-call queue.
4. Update stage stepper & workflow-rules for KT stage list.
5. Pipeline filters: “My tele-call queue” vs “My site visits”.

**Exit:** Tele-caller schedules visit → surveyor sees assigned lead. Matches PRD Module 1 segregation. **Done.**

### Phase 3 — Survey handoff stub (bridge to Module 2) ✅

1. `book-survey` / `survey-complete` panels adapted: surveyor opens **Survey form** (lat/long, terrace, shadow-free, feasibility boolean, capacity kW) — `surveys` table via `004_surveys.sql`.
2. Completing survey → `survey_completed` + audit event.
3. Placeholder CTA: “Create quotation” (disabled until Module 3).

**Exit:** End-to-end LMS → survey complete without quotes/payments. **Done.**

### Phase 4 — Extra ingestion (PRD completeness)

1. Referral capture API/UI — public `/r/[code]`, staff entry on `/ingest`, `referral_links`.
2. Facebook Lead Ads webhook (`/api/ingest/facebook`) + Graph fetch + idempotency on `external_id`.
3. Source analytics on dashboard + ingest hub; ingest event log.

**Exit:** All PRD Module 1 acquisition channels live. **Done.**

---

## 6. Suggested folder layout (KT)

```
Apps/RK-Solar/
├── docs/
│   ├── prd.md
│   └── plan.md                 ← this file
├── src/
│   ├── actions/
│   │   ├── leads.ts
│   │   ├── sales.ts
│   │   ├── lead-import.ts
│   │   └── reminders.ts
│   ├── components/leads/       ← LMS UI (from Sumeru, adapted)
│   ├── lib/
│   │   ├── domain/             ← workflow, sales, authorities (KT versions)
│   │   ├── leads/
│   │   ├── workflow-rules.ts
│   │   └── audit.ts
│   └── app/(dashboard)/
│       ├── pipeline/
│       ├── lead-import/
│       ├── reminders/
│       └── leads/[id]/
└── supabase/migrations/        ← clean KT migrations (not Sumeru dump)
```

**Rule:** Prefer **clean KT migrations** rewritten from Sumeru concepts over copying all 30+ Sumeru migration files (many are repairs / quote / install).

---

## 7. Acceptance criteria (LMS done)

- [x] Manual lead create/edit/delete (permission-gated)
- [x] Excel/CSV import with Phone, Name, Address mapping + distribute to tele-callers
- [x] Pipeline kanban with KT stages
- [x] Tele-caller: log call outcomes, activities, follow-ups, reminders
- [x] Tele-caller: schedule site visit and assign surveyor (cannot perform survey) — Phase 2
- [x] Surveyor: sees only assigned visits (queue filter); survey complete fields — Phase 3
- [x] Manager: reassign, view all, import
- [x] Audit timeline on every stage/assignment/call
- [x] No Sumeru branding or quotation engine shipped in LMS MVP
- [x] RBAC enforced in UI + RLS
- [x] Digital survey form → `survey_completed` + quote placeholder CTA
- [x] Referral public form + staff referral entry + Facebook Lead Ads webhook (Phase 4)

---

## 8. Sumeru coverage matrix (full KT PRD)

Sumeru is an **ops CRM backbone**, not a full KT clone. Use this matrix when planning Modules 2–7 after LMS.

**Legend:** **Strong** = port/adapt · **Partial** = skeleton only · **Weak / None** = mostly build new · **Alt** = prefer another app in `Apps/`

| KT module | Coverage | Take from Sumeru | Build / change for KT | Suggested source |
|-----------|----------|------------------|------------------------|------------------|
| **1. Leads & sales ops** | **Strong** | Pipeline, CRUD, Excel import, call logs, followups, reminders, reassign, audit, RBAC, visibility | Dual assignee (tele-caller + surveyor); Facebook Ads + referral API | `SUMERU-SOLUTIONS` LMS |
| **2. Digital survey** | **Partial** | Book-survey / survey-complete panels; light roof area / kW on lead | First-class `surveys` table: lat/long, terrace, shadow-free, feasibility boolean, capacity kW; surveyor-only complete | Sumeru UX + KT schema |
| **3. Multi-template quotation** | **Partial / Alt** | `quotations.lead_id` link, catalog/items pattern, PDF generation flow, discounts | Solar **and** non-solar templates; GEB/MGVCL meter charges; subsidy calc; strip Sumeru brand | Prefer adapt `Quotation-Generator` **or** Sumeru quote engine rebranded — pick one before build |
| **4. Milestone payments + feasibility** | **Partial** | `payment_records`, payment workspace UI, attachments upload, documentation workspace | **3 stages** (Token → Pre-Dispatch → Final); Accounts **verify** txn/date/bank; **parallel** Feasibility report stream after token | Sumeru payment/docs as shell; rewrite workflow |
| **5. Installation & barcodes** | **Partial** | Crew assignment, site photo upload, completion notifications | Drop dual-team photo gates; add **panel barcode / DCR serial** photo capture; crew routing after pre-dispatch verified | Sumeru install workspace adapted |
| **6. Discom, subsidy, portal** | **Partial (internal)** | Docs stages: `payment_clear` → `meter_installed` → `subsidy_received`; liaison-style staff marking | **Customer portal** (status, quotes, docs, meter sign-off); **15-day subsidy timer** + liaison follow-up; Accounts verify subsidy + completion certificate | Sumeru docs stages for staff; portal + timer = **new** |
| **7. Maintenance & cleaning** | **Partial** | After-sales tickets + proof photos | Customer-raised tickets from portal; **first-of-3 engineers accept**; supervisor force-assign; **15-day cleaning + WhatsApp + referral** nudges | Sumeru tickets as shell; routing + automation = **new** |

### 8.1 Reuse level summary

| Level | Modules |
|-------|---------|
| **Best reuse** | Module 1 (LMS) |
| **Good skeleton** | 2 (survey UX), 5 (install photos), 6 (internal meter/subsidy stages), 7 (tickets) |
| **Rewrite heavily** | 4 (3-stage + parallel verify), 5 barcodes, 6 portal + timer, 7 claim routing + cleaning bots |
| **Decide alternate** | Module 3 — Sumeru quotes **vs** `Apps/Quotation-Generator` |

### 8.2 Cross-cutting Sumeru assets (all later modules)

Reuse across Modules 2–7 without copying product rules:

- Auth, multi-tenant `companies` / `profiles`, custom roles / authorities
- Attachments + file manager
- `audit_events` timeline
- Notifications helper (`src/lib/notifications.ts`)
- Reports / search patterns
- App shell / nav gating (`nav-access`)

### 8.3 Explicitly do not carry forward

- Sumeru / Sangani branding, bank QR, seed company
- Dual-team installation photo gates as the KT install model
- Free-form payments as the final KT payment model
- Legacy `loan_records` / `name_transfer_records` / old `service_calls` unless KT asks later
- Assuming internal “Customers” list = customer portal

---

## 9. Explicitly out of scope for LMS phases (later module plans)

| Later module | Depends on | Follow-up plan doc (when ready) |
|--------------|------------|----------------------------------|
| Module 3 — Multi-template quotation | `survey_completed` leads | `docs/plan-quotation.md` — **v1 done** |
| Module 4 — 3-stage payments + parallel feasibility/accounts | Accepted quote | `docs/plan-payments.md` — **v1 done** |
| Module 5 — Installation + barcode photos | Pre-dispatch verified | `docs/plan-installation.md` — **v1 done** |
| Module 6 — Discom / subsidy timer / customer portal | Installation complete | `docs/plan-discom-portal.md` — **v1 done** |
| Module 7 — Maintenance tickets / cleaning reminders | Post-sales | `docs/plan-maintenance.md` — **v1 done** |
| Clone adapted LMS → Jaleshwar | After RK LMS Phase 2–3 stable | Strip tele-call; add dealer entry + financing |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Blind copy of Sumeru migrations brings quote/install debt | Rewrite lean LMS migrations only |
| Single `assigned_to` leaks into KT UX | Dual assignee in schema from Phase 2 day one |
| Survey fields dumped onto `leads` forever | Prefer `surveys` table early in Phase 3 |
| Facebook API delayed | Ship P1 without it; leave `facebook_ads` source enum ready |
| Scope creep into payments/quotes | Gate on §7 checklist; use §8 matrix + separate `plan-*.md` per module |
| Building two quote engines | Decide Module 3 source once (§8.1 Alt) before Phase quote work |

---

## 11. Recommended build order (checklist)

1. [x] Phase 0 — Scaffold KT app + auth  
2. [x] Phase 1 — Port LMS core from Sumeru (strip brand/post-won)  
3. [x] Phase 2 — Tele-caller ↔ Surveyor segregation  
4. [x] Phase 3 — Survey handoff stub  
5. [x] Phase 4 — Referral + Facebook ingestion  
6. [x] Update `Global Instructions/memory.md` after each phase  
7. [x] Decide Module 3 source (Sumeru vs Quotation-Generator) using §8 — **lean Sumeru lead-link + QG math/print**  
8. [x] Module 4 payments + feasibility v1 (`docs/plan-payments.md`)  
9. [x] Module 5 installation + barcodes v1 (`docs/plan-installation.md`)  
10. [x] Module 6 Discom / subsidy / portal v1 (`docs/plan-discom-portal.md`)  
11. [x] Module 7 maintenance + cleaning v1 (`docs/plan-maintenance.md`)  
12. [x] Polish — catalog admin, proofs storage, cron/WhatsApp stub (`012`)  
13. [ ] Jaleshwar fork  

---

## 12. Decision summary

| Question | Answer |
|----------|--------|
| Is Sumeru LMS a good base for KT? | **Yes** — best-in-repo for pipeline, tele-call, import, RBAC, audit |
| Can Sumeru cover other KT PRD modules? | **Partially** — see §8; strong for LMS, skeletons for survey/install/docs/tickets |
| Copy entire Sumeru app? | **No** — LMS slice first; later modules adapt selected workspaces only |
| Biggest KT delta in LMS? | **Dual roles** (tele-caller vs surveyor) + visit scheduling ownership |
| Biggest gap vs PRD Module 1? | **Facebook Ads API** (build new) |
| Biggest net-new vs Sumeru overall? | Customer portal, 15-day subsidy timer, 3-stage payments, barcodes, 3-engineer ticket claim, cleaning WhatsApp |
| When to copy to Jaleshwar? | After Phase 2–3 stable; Jaleshwar drops tele-call and uses dealer entry |

**Next step when approved:** Execute Phase 0 + Phase 1 in `Apps/RK-Solar`.
