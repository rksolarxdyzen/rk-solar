# KT Renewable Energy — Remaining crew install revisions

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-19  
**Status:** Implemented 2026-09-19 (Phases A–D). Phase D: sequential bulk panel photos + lock Remove for crew.  
**Source:** Leftover gaps vs `docs/reviseplan-crew-install-workspace.md` plus new revisions (hide stage; crew customer brief)  
**Related:** `docs/reviseplan-crew-install-workspace.md` (v1 implemented 2026-09-17), `docs/reviseplan-install-supervisor-proofs.md`, `docs/plan-installation.md`, `src/components/leads/move-to-won-button.tsx`, `src/lib/leads/won-gate.ts`, `src/actions/surveys.ts`

---

## Purpose

Finish the installation-crew product so the field team only sees **work they must do** and **facts they need on site**. Pipeline language stays off their screens. When they open a job they get a read-only brief: customer identity, the full digital survey, and the system snapshot captured at **Move to Won**.

Supervisor assignment, Accounts, Documentation, and internal `sales_stage` values stay in the database. Crew UI and crew-facing copy must not surface stage names.

---

## Revisions (must ship)

| User wording | Product rule |
|--------------|--------------|
| **Installation team should not be shown the current stage** | Role `installation_crew` never sees `sales_stage` badges, `SALES_STAGE_LABELS`, “assigned / in progress / completed”, Pre-Dispatch Verified, or Documentation handoff as a *stage*. Progress is only “3 of 6 photos” / “Finish remaining proofs”. |
| **Name, number** | Every crew job header shows **customer name** and **phone** (tap-to-call on mobile). City may stay as location help. |
| **Entire digital survey form** | Read-only copy of the survey the surveyor submitted: GPS, terrace sqft, shadow-free sqft, proposed kW, feasibility pass/fail, notes, and all four site photos (`gps`, `roof`, `shadow`, `access`). Empty slots show “Not captured”. |
| **System details shown at Move to Won** | Read-only Won snapshot: panel / module name, panel quantity, inverter company, system size (kW), consumer number, company-bears-subsidy flag. |

Payment milestone rupees (token / pre-dispatch / final) and Won ID/bill uploads stay **Sales / Accounts**. Do not put amounts or those documents on the crew brief unless a later revision asks.

---

## Product language

| User wording | Meaning in this app |
|--------------|---------------------|
| **Installation team** | Role `installation_crew` — assigned jobs only |
| **Supervisor** | Role `ops_coordinator` (display: Installation Supervisor) |
| **Current stage** | `leads.sales_stage` and any label derived from it |
| **Digital survey form** | Row in `surveys` + Docs photo slots in `SURVEY_PHOTO_SLOTS` — same fields as `SurveyCompletePanel` / `surveyFormSchema` |
| **Move to Won system details** | Fields collected in `MoveToWonButton` / `WonClosingPayload` that describe the **system**, not the payment schedule |
| **My job / finish proofs** | Allowed crew language. Not “Installation assigned” |

---

## Already shipped (do not redo)

From crew workspace v1 (`reviseplan-crew-install-workspace.md`):

- Four-group checklist: customer geo photo, inverter serial, sequential Panel 1…n, site video
- Live barcode + 10s shutter unlock; persist partial work
- Auto-complete to Documentation (`liaison_in_progress`) with no crew Complete button
- Queue / modal: `hideStages` hides the **badge** on cards and in the job modal
- Supervisor still assigns crew + `expected_panel_count` after pre-dispatch

---

## Current audit (gaps)

| Surface | Today | Gap |
|---------|--------|-----|
| `/installation` page subtitle | Mentions Supervisor, “no stages”, Documentation | Crew still reads pipeline / org-role language |
| Queue empty / awaiting copy | “Waiting for Supervisor assignment”, “Finalized after pre-dispatch” | Stage + process language for crew |
| `InstallationPanel` with `hideStages` | “Waiting for Supervisor assignment”, “Finalized — awaiting Installation Supervisor” | Same |
| Job modal header | Badge hidden when `hideStages`; name/phone exist | No survey, no Won system block |
| `CrewInstallWorkspace` | Checklist only | No brief section; still uses `sales_stage` only in code (OK if never rendered) |
| Photo **Remove** | Still shown for crew while job is open | Leftover vs “lock evidence” (optional — see Phase D) |
| Multi-select gallery | One file at a time per panel | Leftover vs Jay Sardar `batchProgress` (optional — see Phase D) |
| `leads_select` (`047`) | No `assigned_crew_id = auth.uid()` | Assigned crew may **fail to SELECT the lead** after 047. Queue / brief / uploads that join `leads` can go empty or 403 |
| `surveys_select` (`004`) | Telecaller / surveyor / assignee / creator / `view_all_leads` | Assigned **crew cannot read** the survey row |
| Survey photos | Docs on the lead | Crew needs SELECT on those attachment rows (same lead RLS + existing docs policies) |

Supervisor / Admin / Accounts UIs keep stages. Do not hide stage on those roles.

---

## Recommended product flow (crew)

```
Supervisor assigns job (unchanged)
        │
        ▼
Crew opens “My job”
  Header (always visible)
    • Name
    • Phone (tel:)
    • City (optional)
  Brief (read-only, collapsible on mobile)
    • Digital survey — full form + photos
    • Won system details
  Work
    • Geo photo → inverter serial → Panel 1…n → site video
        │
        ▼
Last required proof → silent auto-complete
Job leaves crew list
```

No stage name anywhere on that path.

---

## Implementation order

| Phase | Scope | Why this order | Status |
|-------|--------|----------------|--------|
| **A — RLS** | Restore `assigned_crew_id` on `leads_select`; extend `surveys_select` (and docs if needed) for assigned crew | Brief and queue are useless if SELECT fails | Done — `049_crew_lead_and_survey_select.sql` |
| **B — Hide stage leftover copy** | Strip stage / Supervisor / Documentation wording from every crew-only string | Matches the new revision literally | Done |
| **C — Crew job brief** | Name, phone, full survey, Won system fields on modal + workspace | New revision | Done — `getCrewJobBrief` + `CrewJobBriefCards` |
| **D — Capture polish** | Bulk panel pick + progress bar; lock Remove after upload | Leftover from v1 vs Jay Sardar / evidence lock | Done — sequential batch + `050` crew cannot DELETE |

Do not implement D until A–C are signed off in the product.

---

## Phase A — Schema / RLS

New migration (next number after `048`), e.g. `049_crew_lead_and_survey_select.sql`.

### `leads_select`

`047` dropped crew visibility. Recreate the policy with the **047 Accounts clauses plus**:

```sql
OR assigned_crew_id = auth.uid()
```

Keep: `assigned_to`, `assigned_telecaller_id`, `assigned_surveyor_id`, `created_by`, `view_all_leads`, `verify_payment`, `view_payment_queues`, `record_payment`, `full_access`.

### `surveys_select`

Add the same crew predicate on the joined lead:

```sql
OR l.assigned_crew_id = auth.uid()
```

Crew is **read-only**. Do not grant `surveys` INSERT/UPDATE to `installation_crew`.

### Documents / storage

Confirm survey photo `doc_type`s (`survey_gps`, `survey_roof`, `survey_shadow`, `survey_access`) are readable when the user can SELECT the lead. If docs RLS only allows `view_all_leads` / liaison, add assigned-crew SELECT (same pattern as `installation_photos` EXISTS on `assigned_crew_id`).

### Error handling

| Case | Handling |
|------|----------|
| Policy omitted `assigned_crew_id` | Crew queue empty after 047 — treat as P0 |
| Survey row missing | Brief shows “Survey not on file” — job still installable |
| Survey photos missing | Slot label + empty state; do not block capture |
| Crew tries to edit survey | No write UI; RLS deny if they hit the API |

### Apply on prod

User runs the new SQL on the RK Supabase project (same as 045–048). App deploy alone is not enough.

---

## Phase B — Never show current stage to installation team

### Rule

If `session.role === "installation_crew"` (or `hideStages` / `crewView` is true):

- Do not render `Badge` with `sales_stage`
- Do not render `SALES_STAGE_LABELS[...]`
- Do not render raw `sales_stage` in debug or subtitles
- Do not explain the pipeline (“after pre-dispatch”, “sent to Documentation” as a *stage*). Allowed: “This job is on your list” / “All required photos are in — you are done”

### Copy replacements

| File | Crew-facing string today | Replace with |
|------|--------------------------|--------------|
| `src/app/(dashboard)/installation/page.tsx` | Supervisor / Documentation subtitle | Crew: “Your assigned jobs. Capture the required photos and video.” Supervisor page keeps the current subtitle |
| `installation-queue-list.tsx` | Waiting for Supervisor / Finalized after pre-dispatch | Crew: empty = “No jobs assigned to you yet.” Drop the awaiting-assignment **section** for crew (they should never see unassigned cards) |
| `installation-panel.tsx` | Waiting for Supervisor / Finalized — awaiting Supervisor | If a crew user ever hits this: “This job is not assigned to you.” |
| Queue / modal | Any leftover “in progress” | “Photos remaining: *k*” |

Split the `/installation` page subtitle by role (crew vs Supervisor/admin). Do not give crew one shared sentence that mentions Supervisor.

### Files

- `src/app/(dashboard)/installation/page.tsx`
- `src/components/leads/installation-queue-list.tsx`
- `src/components/leads/installation-panel.tsx`
- `src/components/leads/installation-detail-modal.tsx`
- `src/components/leads/crew-install-workspace.tsx` (audit only)

### Error handling

| Case | Handling |
|------|----------|
| Supervisor still needs stages | `hideStages={false}` unchanged |
| Admin opens `/installation` | Keep Supervisor language |
| Completed job still in modal | “All required photos are in” — not `liaison_in_progress` |

---

## Phase C — Crew customer brief

### 1. Identity (always)

On the job modal header and at the top of `CrewInstallWorkspace`:

- **Name** — `leads.name`
- **Number** — `leads.phone`, `tel:` link
- Optional: city / address if already loaded (not a substitute for name/phone)

### 2. Digital survey (entire form, read-only)

Reuse the **same fields** as the surveyor form (`surveyFormSchema` / `SurveyCompletePanel`), display-only:

| Field | Source |
|-------|--------|
| Latitude / longitude | `surveys.latitude`, `surveys.longitude` |
| Total terrace (sqft) | `surveys.total_terrace_sqft` |
| Shadow-free (sqft) | `surveys.shadow_free_sqft` |
| Proposed capacity (kW) | `surveys.capacity_kw` |
| Feasibility | `surveys.feasibility_pass` |
| Notes | `surveys.notes` |
| GPS / roof / shadow / access photos | Existing survey photo slots + signed URLs |

Layout: one “Site survey” card. Mobile: collapsed by default, expand to see photos. Do not open the surveyor edit modal.

New loader (suggested): `getCrewJobBrief(leadId)` in `src/actions/installation.ts` (or a small `src/actions/crew-brief.ts`) that:

1. Asserts assigned crew (or Supervisor/admin)
2. Loads lead identity + Won columns
3. Loads `surveys` for `lead_id`
4. Loads survey photo URLs (same helper as `getSurveySitePhotos`)

Do **not** send `sales_stage` to the crew client if it can be omitted from the DTO.

### 3. Won system details (read-only)

Same labels as the Move to Won **system** block:

| Label (match Won UI) | Column / payload |
|----------------------|------------------|
| Panel / module | `won_panel_name` (or current lead column name used by `markLeadWon`) |
| Panel quantity | `won_panel_quantity` |
| Inverter | `won_inverter_company` (or current name) |
| System size (kW) | `won_system_size_kw` |
| Consumer number | `won_consumer_number` / consumer field persisted at Won |
| Company bears subsidy | boolean persisted at Won |

Confirm exact column names in `markLeadWon` / leads table before coding. If a field was never saved on older Wons, show “—”.

**Out of this card:** token / pre-dispatch / final amounts, accepted quotation picker, electricity bill / customer ID uploads.

### Files

- `src/actions/installation.ts` (select list must include phone + Won columns; today queue select already has `name, phone`)
- `src/components/leads/installation-detail-modal.tsx`
- `src/components/leads/crew-install-workspace.tsx` or new `src/components/leads/crew-job-brief.tsx`
- `src/lib/domain/types.ts` (brief DTO)
- Survey photo helper reuse from `src/actions/surveys.ts` / `src/lib/domain/survey-photos.ts`

### Error handling

| Case | Handling |
|------|----------|
| Not assigned crew | Same as today — no job |
| Lead SELECT fails (forgot Phase A) | Friendly “Cannot load this job” — not a digest-only RSC throw |
| Survey SELECT fails | Identity + Won still show; survey card error text |
| Signed URL fail | Photo slot caption + retry |

---

## Phase D — Optional capture leftovers (after A–C)

Not required by the new stage/brief revisions. Track here so they are not forgotten.

### D1 — Bulk panel gallery + progress

Jay Sardar `install-asset-uploader`: `multiple` input + `batchProgress` bar.

**Constraint for KT:** panels stay **sequential**. A batch may only fill the next unused indexes (e.g. next is 4 of 10 → batch assigns 4, 5, 6…). Do not allow picking Panel 8 first.

### D2 — Lock uploaded proofs

Today `CrewInstallWorkspace` still shows **Remove** while `canEdit`.

If product wants evidence lock: hide Remove for crew after a successful upload; Supervisor/admin may still delete. Needs `installation_photos` DELETE already gated (`complete_installation` / full_access in `009`). Align UI with RLS — do not show a button that 403s.

---

## Target crew screen (after A–C)

```
[ Customer name ]
[ Phone ]                    ← no stage badge

Site survey (read-only)
  GPS, terrace, shadow-free, kW, feasibility, notes
  Four survey photos

System (from Won)
  Panel, qty, inverter, kW, consumer no., subsidy bearer

Your photos
  1. Customer geo photo
  2. Inverter serial
  3. Panel 1 … n (barcode / 10s)
  4. Site video
```

Progress: “2 of 4 groups” or “Panels 3/10” — never a stage name.

---

## Out of scope

- Changing when Supervisor assigns (still after pre-dispatch)
- Letting crew edit survey, Won fields, or payments
- Showing pipeline on `/leads` if crew cannot open that route (keep nav as today)
- Recare / MK / Bright ports unless asked
- Deliverables sync / Solar Niche deploy unless asked
- Commits unless asked

---

## Test plan

1. **Supervisor:** `/installation` still shows stages, assign form, unassigned queue.
2. **Crew, no jobs:** empty copy has no stage words.
3. **Crew, assigned job:** name + phone visible; no badge; survey fields + photos match surveyor submit; Won fields match Move to Won.
4. **Crew, missing survey:** job still opens; survey empty state.
5. **Crew after 047+049:** queue lists assigned leads (regression for 047-only DB).
6. **Accounts:** payment board names still work (047 clauses remain).
7. **Crew cannot** change survey or Won fields (UI + RLS).
8. **Auto-complete** still runs; job disappears from crew list without showing `liaison_in_progress`.

---

## Knowledge

After implementation: mark this file **Implemented**, point `reviseplan-crew-install-workspace.md` at it, and update `Global Instructions/memory.md` plus `Apps/Solar-Ops-Knowledge/apps/rk-solar.md`.
