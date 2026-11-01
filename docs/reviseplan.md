# KT Renewable Energy — Revision Plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-05  
**Status:** Phases A–D complete (2026-09-05)  
**Source:** User revision list (14 items) + codebase audit

---

## Purpose

This document captures the requested product revisions, what the app does today, gaps found in audit, and a concrete implementation plan per item. Use it as the single checklist for the next build pass.

---

## Implementation order (recommended)

| Phase | Items | Why first | Status |
|-------|-------|-----------|--------|
| **A — Quick UX fixes** | 3, 4, 5, 6, 7, 8, 9, 12 | Low risk, local UI changes, immediate sales friction relief | **Done 2026-09-05** |
| **B — Customer / portal** | 10, 11, 13 | Shared portal-code + header UX; migration for code format | **Done 2026-09-05** |
| **C — Money & Won** | 1, 2 | Touches closing gate + payment visibility | **Done 2026-09-05** |
| **D — Quotation PDF** | 14 | Visual/PDF quality; needs asset + CSS pass | **Done 2026-09-05** |

Optional carry-over (from prior session, not in this list): Catalog **Inverters** tab + `inverter_size_label` on System Package — finish if still incomplete before PDF polish.

---

## Item 1 — Confirm Won popup

### Request
- Remove: **Meter Type**, **Name** (meter ownership), **Payment plan**, **System size**
- Add: option to attach **Feasibility report**
- Add: ability to **see / select approved quotation** by sales person when file is won

### Current state (audit)
- UI: `MoveToWonButton` — `src/components/leads/move-to-won-button.tsx`
- Server: `getWonGateContext`, `markLeadWon` — `src/actions/leads.ts`
- Gate rules: `src/lib/leads/won-gate.ts`
- Modal sections today:
  1. Meter type · Meter ownership (“Name”) · Payment plan
  2. Panel · Panel qty · **System size (kW)** · Inverter
  3. Token · Pre-dispatch · Final
  4. Docs: electricity bill + customer ID only
- Latest quotation is loaded for **prefill only** — never shown/selectable in the modal
- Feasibility already exists elsewhere (`FeasibilityPanel`, `feasibility_reports`) but **not** in Won modal

### Plan
1. Slim Won form UI: drop meter type / ownership / payment plan / system size inputs (keep panel qty, panel name, inverter, payment buckets, mandatory ID/bill docs unless product says otherwise).
2. Decide persistence:
   - **Preferred:** stop requiring those fields in `checkWonClosingGate` / `WonClosingPayload`; leave DB columns nullable for historical rows.
   - If ops still need meter/payment plan later, capture them on Customer Overview / Payments — not at Won.
3. Quotation picker:
   - Load quotations for lead filtered to **`accepted`** (and optionally `sent` if “approved” means sales-accepted PDF).
   - Show list (no, date, grand total, system size, panel) + select one.
   - On save: set `leads.accepted_quotation_id`, prefill Final/token from selected quote totals where useful.
4. Feasibility upload in section 4 (or new section): reuse `uploadLeadDocument` / feasibility upload action; link or create `feasibility_reports` row; optional gate “uploaded” vs “approved”.
5. Update copy/tests for Won gate incomplete-state messages.

### Files
- `src/components/leads/move-to-won-button.tsx`
- `src/lib/leads/won-gate.ts`
- `src/actions/leads.ts`
- Possibly `src/components/leads/feasibility-panel.tsx` (shared upload UI)

### Open questions
- Confirm “approved quotation” = `status === 'accepted'` only, or also `sent`?
- Is feasibility **required** to confirm Won, or optional attach?
- Keep panel qty / inverter / payment breakdown as-is after removals?

---

## Item 2 — Pending amount after token

### Request
Token money is recorded, but there is no internal place to see **pending / remaining** amount. Audit and add visibility.

### Current state (audit)
| Surface | Remaining balance? |
|---------|-------------------|
| Customer portal | **Yes** — Paid + Balance due (`grand_total − paid`) |
| Internal `PaymentPanel` | **No** — milestones only |
| Won modal | Planned Token/Pre-dispatch/Final sum only |
| Customer detail Overview | Does not show won amounts or balance |

Data available:
- Planned: `leads.won_token_amount`, `won_pre_dispatch_amount`, `won_final_amount`
- Actual: `payments` rows (`milestone`, `amount`, `verification_status`)
- Quote total: `quotations.grand_total` / `accepted_quotation_id`

### Plan
1. Add shared helper e.g. `summarizeLeadPayments(lead, payments, quotation)` (mirror portal `summarizePortalPayments`):
   - Contract total (accepted quote grand total **or** sum of won_* buckets)
   - Verified paid / pending verification / remaining
2. Surfaces to add (recommend all three, minimal UI):
   - **Customer → Payments tab** (`PaymentPanel` / `customer-detail-view.tsx`): summary strip — Total · Token paid · Remaining
   - **Won / post-won Sales tab** summary card
   - Optionally **Payments queue** row hint
3. Clarify semantics in UI labels:
   - **Planned remaining** = won_token + pre_dispatch + final − recorded amounts  
   - **Quote remaining** = grand_total − verified payments  
   Prefer quote remaining when `accepted_quotation_id` exists.

### Files
- `src/components/leads/payment-panel.tsx`
- `src/components/leads/customer-detail-view.tsx`
- `src/lib/domain/portal.ts` (reuse or extract balance math)
- Possibly `src/actions/payments.ts` for aggregated fetch

### Open questions
- Remaining vs which total: accepted quotation vs won breakdown sum?
- Count only `verified` payments toward “paid”, or also pending verification?

---

## Item 3 — Follow-up Action clear + Create Quotation prefill

### Request
- After Save call, clear the Action-related text area(s).
- Create Quotation from lead popup should auto-fill lead/customer on the quotation.

### Current state (audit)
- Call UI is on **Sales** tab (`SalesActionsPanel`), not a tab literally named “Action”.
- Fields: Notes textarea, **Action** input, When datetime.
- On save: Notes **clears**; Action + When **do not**.
- Create Quotation → `/quotations/new?leadId=…&kind=solar` already passes `leadId`.
- Prefill of name/phone/address **already implemented** in `NewQuotationWorkspace` via `getLeadForQuote`.
- Gap: `meter_type` omitted from `initialLead` mapping on new page → meter-derived defaults may not apply; system size from `recommended_system_kw` not applied.

### Plan
1. In `saveCall` success path: also `setAction("")` (and optionally reset When).
2. Verify Create Quotation path end-to-end; fix `quotations/new/page.tsx` `initialLead` to include `meter_type` (and any other fields used by defaults).
3. If user still sees empty customer fields, check solar vs non-solar builder and that `defaultValues` are not overwritten by empty form defaults after mount.

### Files
- `src/components/leads/sales-actions-panel.tsx`
- `src/app/(dashboard)/quotations/new/page.tsx`
- `src/components/quotations/new-quotation-workspace.tsx`

---

## Item 4 — Save Quotation button vs validation

### Request
Save should not look enabled (bright blue) when the quote cannot be created — e.g. missing customer name — **or** show a clear error explaining why.

### Current state (audit)
- Button enabled when `systemComplete` only (panel, qty, kW, cost, inverter, meter phase, mount, min price).
- **`customerComplete` (name + phone) is NOT part of Save enablement.**
- Zod still requires `customerName` / `customerPhone` on submit → silent/confusing failure feel.

### Plan (do both)
1. Enable Save only when `customerComplete && systemComplete && !belowMin && !pending`.
2. When disabled, show a short inline hint listing missing requirements (Customer name, phone, panel, inverter, meter phase, …).
3. On submit failure, surface `formState.errors` / server message near the button (not only console).

### Files
- `src/components/quotations/quotation-builder-form.tsx`
- Mirror on appliance builder if same issue exists

---

## Item 5 — Remove Status, Notes, Terms from New Quotation

### Request
Remove **Status**, **Notes**, and **Terms** from the New Quotation page.

### Current state (audit)
- Solar builder “Quote Details” accordion: Status select, Payment terms (`terms`), Notes — `quotation-builder-form.tsx`
- Non-solar: Notes/Terms under Discount & terms — `quotation-builder-form-appliance.tsx`

### Plan
1. Remove those fields from solar (and non-solar if same product rule) New Quotation UI.
2. Defaults on save: `status: "draft"`; `notes`/`terms` null or company template defaults without user edit.
3. Keep fields on **Edit** quotation only if product still needs them later — confirm; default this plan = **remove from builder entirely** for new+edit unless asked otherwise.
4. Payment schedule for PDF can still come from template defaults (`formatDefaultPaymentTerms`), not the removed Terms box.

### Files
- `src/components/quotations/quotation-builder-form.tsx`
- `src/components/quotations/quotation-builder-form-appliance.tsx` (if in scope)

### Open questions
- Remove on Edit quotation as well, or only New?
- Sales still need to mark quote `sent`/`accepted` elsewhere (list actions / detail)?

---

## Item 6 — Premium / Regular switch must not wipe system details

### Request
Switching Premium ↔ Regular after filling system details should only change pricing, not erase the form.

### Current state (audit)
```ts
// new-quotation-workspace.tsx
const formKey = `${initialCustomer.id}-${kind}-${tier}`;
<QuotationBuilderForm key={formKey} quoteTier={tier} ... />
```
Changing tier remounts the entire form → state reset.

### Plan
1. Remove `tier` from `formKey` (key by customer + kind only).
2. Pass `quoteTier` as a prop; existing `useEffect` that recalculates per-kW from panel + count + project type should refresh prices.
3. Ensure tier change updates `ratePerKw`, `systemCost`, `minSalePrice`, `tierType` without clearing panel/inverter/meter/customer.
4. Regression-test commercial + residential.

### Files
- `src/components/quotations/new-quotation-workspace.tsx`
- `src/components/quotations/quotation-builder-form.tsx` (verify pricing sync on `quoteTier` change)

---

## Item 7 — Catalog Brands section space

### Request
Brands section takes needless space — tighten layout.

### Current state (audit)
- `CatalogAdmin` brands tab: add form + full-width list rows with generous padding — `catalog-admin.tsx`

### Plan
1. Compact brands into a denser grid/table (or chip list with inline edit).
2. Collapse “Add brand” into a single-row inline form.
3. Optionally show brands as a slim sidebar / accordion under Items instead of a full-height tab body — prefer **compact table first** (least workflow change).

### Files
- `src/components/catalog/catalog-admin.tsx`

---

## Item 8 — Catalog Items List columns

### Request
Remove **Rate**, **Kind**, and **GST** columns from the items list.

### Current state (audit)
Columns today: Item · Brand · Kind · Capacity · Rate · GST% · Actions

### Plan
1. Drop Kind / Rate / GST% from table header + cells.
2. Keep Item, Brand (or remove Brand later if Item 9 removes brand from items), Capacity, Actions.

### Files
- `src/components/catalog/catalog-admin.tsx`

---

## Item 9 — Add Item form

### Request
- Remove **Model**, **Brand** from Add Item form.
- Rename **Template** → **Type**.
- Ask for **price (rate) and GST only when Type/category is non-solar**.
- Move Type **above** Rate.

### Current state (audit)
Field order: Name, Model, Capacity, Unit, Base rate, GST%, Template, Brand, Category, Image…

### Plan
1. Remove Model + Brand controls from create/edit item UI (keep DB columns nullable for old rows).
2. Label `template_kind` control as **Type**.
3. Reorder: Name → Capacity → Unit → **Type** → Category → (conditional Rate + GST if Type is `non_solar`) → Image.
4. For solar/premium/both: persist rate `0` / GST `0` or hide and default; server validation should allow zero for solar kinds.
5. Align list columns with Item 8.

### Files
- `src/components/catalog/catalog-admin.tsx`
- `src/actions/catalog.ts` (validation if rate required today)

### Open questions
- “Only if category is non-solar” vs Type=`non_solar` — implement on **Type** as stated; category alone is ambiguous when Type is `both`.

---

## Item 10 — Customer header: stages, portal code, WhatsApp share

### Request
Below customer name:
- Show **customer stages** (stepper) instead of current single stage badge (“Token + …”).
- Show portal **access code / ID** with **open-link** and **copy-link** icons.
- Remove current stage badge and redundant ID display.
- Rightmost (with Call / WhatsApp): add WhatsApp action that opens chat with **pre-filled message** (portal link, code, registered mobile).

### Current state (audit)
- `CustomerDetailModal` header: name → Badge(stage) + city + portal_code text → Call + WhatsApp (no message body)
- `CustomerDetailView` also shows stage Badge + “Portal CODE”
- `StageStepper` exists (`stage-stepper.tsx`) with `minimal` variant
- Portal URL pattern: `/portal/{code}`
- WhatsApp today: `https://wa.me/91…` with no `?text=`

### Plan
1. Header redesign in `customer-detail-modal.tsx` (primary) and align `customer-detail-view.tsx` / list cards if needed:
   - Under name: `StageStepper variant="minimal"` (read-only unless intentional click-to-advance)
   - Portal row: mono code + ExternalLink (`/portal/{code}`) + Copy (full absolute URL)
2. Remove duplicate stage Badge and plain “Portal CODE” chip from the same header area.
3. Add second WhatsApp control (or enhance existing) with encoded text, e.g.  
   `Hello {name}, your RK Solar customer portal: {url} · Code: {code} · Registered mobile: {phone}`
4. Ensure absolute URL uses production origin (env `NEXT_PUBLIC_APP_URL` or `window.location.origin`).

### Files
- `src/components/leads/customer-detail-modal.tsx`
- `src/components/leads/customer-detail-view.tsx`
- Possibly `customers-list.tsx` for consistency
- Small util: `buildPortalWhatsAppHref(lead)`

---

## Item 11 — New portal code sequence

### Request
New format: **`RKSO` + `ddMMyy` + `NNN`**  
Example shape: `RKSO050926042` (5 Sep 2026 + sequence 042).  
NNN = random/sequence number (3 digits).

### Current state (audit)
- `generatePortalCode()` in `src/lib/domain/portal.ts`: `"RK"` + 6 random chars from ambiguous-safe alphabet (e.g. `RK7H3K2P`).

### Plan
1. Replace generator:
   - Prefix `RKSO`
   - Date `ddMMyy` in Asia/Kolkata (or server local) at issuance time
   - `NNN`: prefer **per-day sequence** (DB counter / query max for day) for uniqueness; fallback random 000–999 with collision retry if no counter table.
2. Migration: no change required to column type if `portal_code` is already text/varchar wide enough (verify length ≥ 13).
3. Existing codes remain valid; only **new** issuances use RKSO format.
4. Update any UI copy that says “RK + 6 characters”.
5. Uniqueness: enforce unique index on `leads.portal_code` if not already; retry on conflict.

### Files
- `src/lib/domain/portal.ts`
- Call sites in `src/actions/leads.ts` (and install/accept paths)
- Optional migration for sequence table `portal_code_daily_seq(day, last_n)`

### Open questions
- Confirm NNN is **daily sequence** vs pure random.
- Timezone for `ddMMyy`: IST assumed.

---

## Item 12 — Portal: remove “Use a different code”

### Request
Remove the “Use a different code” link — customers won’t have multiple codes.

### Current state (audit)
- Link in `portal-dashboard.tsx` header → `/portal`

### Plan
1. Remove the link from dashboard header.
2. Keep `/portal` lookup page for first-time entry (staff-shared link / bookmark) — only remove the in-dashboard switcher.
3. Soften any copy implying multiple codes.

### Files
- `src/components/portal/portal-dashboard.tsx`

---

## Item 13 — Customer portal: reference person fields

### Request
Customer needs fields to enter **reference person** details (missing today).

### Current state (audit)
- DB: `leads.referrer_name`, `referrer_phone` exist
- Staff ingest + public referral form capture them
- **Customer portal has no edit UI** for referrer
- Customer Overview / Edit Lead also omit referrer display/edit

### Plan
1. Portal Overview (or Profile section): form fields **Reference name**, **Reference phone** with Save.
2. Server action: customer-authenticated update restricted to referrer fields (+ maybe address) on own lead via portal code + phone session.
3. Optionally show read-only referrer on internal Customer Overview.

### Files
- `src/components/portal/portal-dashboard.tsx`
- New action e.g. `src/actions/portal.ts` or extend existing portal actions
- Types: `src/lib/domain/types.ts` already has fields

### Open questions
- Editable anytime, or only until a stage lock?
- Required or optional?

---

## Item 14 — Quotation PDF / open UX issues

### Request
1. BOM fonts and images are too small  
2. Reduce PDF file size (~7 MB too large)  
3. Panel logo always Adani regardless of selection  
4. Orange text looks yellow in generated PDF — make true orange  
5. When quotation is opened, no way to go back

### Current state (audit)
| Issue | Finding |
|-------|---------|
| BOM size | Thumbs ~34×34px; compact type in `solar-proposal-css.ts` / `solar-bom-material-pages.tsx` |
| PDF size | Browser Print→PDF; many PNG BOM assets + cover images; no compression pipeline |
| Panel logo | Module brand logo map exists (`module-brand-logos.ts`) but **unused**; `/public/brand/modules/` assets missing; BOM shows brand as **text**. Adani may be coming from a hardcoded sample image/cover asset or leftover brand art — needs visual trace during implementation |
| Orange vs yellow | Accent `#ffa800` — prints warm/yellowish; cover CSS comments even say “yellow”. Need deeper orange (e.g. `#E87A1A` / `#F09000`) and avoid yellow-tinted fills on text |
| Back nav | Print toolbar Back → `/quotations/{id}` detail; if user lands on print/detail without history, feel “stuck”. Detail page may lack clear back to list |

### Plan
1. **BOM readability:** increase image size (e.g. 48–64px), bump table font sizes / line-height for material pages only.
2. **PDF weight:**
   - Compress/optimize BOM PNGs (lossy or WebP→PNG smaller)
   - Deduplicate images; avoid embedding unused brand packs
   - Prefer CSS/SVG where possible for icons
   - Document “Save as PDF” settings (//print background, paper size) if needed
3. **Panel branding:** wire `resolveModuleBrandImageUrl(panelName/brand)` into System Package / BOM brand cell; add real logos under `public/brand/modules/`; remove or fix any hardcoded Adani image reference found in template/cover.
4. **Color:** set `--sp-accent` / brand orange to a print-safe orange (higher chroma, less yellow); re-check PDF output on Chrome print.
5. **Back navigation:**
   - Quotation detail: prominent Back → `/quotations`
   - Print view: Back uses `router.back()` with fallback to detail, plus link to list
   - Ensure open-from-list doesn’t only leave print tab without chrome

### Files
- `src/components/quotations/solar-proposal-css.ts`
- `src/components/quotations/solar-bom-material-pages.tsx`
- `src/components/quotations/solar-proposal-document.tsx`
- `src/lib/quotations/module-brand-logos.ts` (+ assets)
- `src/lib/quotations/brand.ts`
- `src/components/quotations/print-toolbar.tsx`
- Quotation detail page / `quotation-detail-actions.tsx`

---

## Cross-cutting notes

### Auth / roles
Won, payments, catalog, portal updates must respect existing RBAC (`canManageCatalog`, payment verify, etc.).

### Migrations likely needed
| Item | Migration |
|------|-----------|
| 1 | Maybe none (reuse docs + `accepted_quotation_id`); feasibility already has table |
| 11 | Optional daily sequence table; verify `portal_code` length |
| 13 | None if columns exist |
| Prior inverter work | `041_rate_card_inverters.sql` if not applied |

### Out of scope unless asked
- Delivery sync to `Deliverables/rk-solar`
- Bright-Solar / other forks
- Changing payment milestone business rules beyond displaying remaining

### Success criteria (summary)
1. Won modal: no meter type/name/plan/system size; feasibility attach; quotation visible/selectable  
2. Staff can see remaining amount after token  
3. Action field clears on Save call; Create Quotation prefills customer  
4. Save disabled or explains missing customer name  
5. No Status/Notes/Terms on new quote UI  
6. Tier switch preserves system details, updates ₹/kW only  
7–9. Catalog Brands/Items/Add Item match new layout rules  
10–12. Customer header + portal code UX + new RKSO code + no “different code”  
13. Portal reference person fields work  
14. PDF clearer, smaller, correct panel brand, true orange, clear Back  

---

## Sign-off

| Role | Decision |
|------|----------|
| Product | Confirm open questions in Items 1, 2, 5, 9, 11, 13 |
| Build | Implement by phase A → D after approval |
| QA | Checklist against Success criteria above on desktop + print PDF |

**Status:** Phases A–D implemented (2026-09-05). Remaining: product open questions + optional inverter carry-over.

---

## Phase A completion notes (2026-09-05)

| Item | Done |
|------|------|
| 3 | Save call clears Action + When; `meter_type` passed into Create Quotation prefill |
| 4 | Save gated on customer + system; blockers hint under button; Zod errors surfaced |
| 5 | Status / Notes / Terms removed from solar + non-solar builders (save as draft / empty) |
| 6 | Tier removed from React `key` — Premium/Regular only recalculates per-kW pricing |
| 7 | Brands tab = compact inline add + chip list |
| 8 | Items list: Item · Brand · Capacity · Actions (no Rate/Kind/GST) |
| 9 | Add Item: no Model/Brand; Type above Rate; Rate+GST only for non-solar |
| 12 | Removed “Use a different code” from portal dashboard |

## Phase B completion notes (2026-09-05)

| Item | Done |
|------|------|
| 10 | Customer modal: stage stepper under name; portal code + open/copy; Call / WhatsApp / Share portal (prefilled); stage badge removed from detail header |
| 11 | New codes: `RKSO` + IST `ddMMyy` + daily `NNN` via `issuePortalCode` (Won / accept quote / install complete) |
| 13 | Portal Overview: Reference name/phone form → `portalUpdateReferrer`; shown on customer overview |

## Phase C completion notes (2026-09-05)

| Item | Done |
|------|------|
| 1 | Won modal: removed meter type/ownership/payment plan/system size; quotation picker; optional feasibility upload; sets `accepted_quotation_id` |
| 2 | Payments panel: Project total / Paid / Remaining (accepted quote or Won plan) |

## Phase D completion notes (2026-09-05)

| Issue | Done |
|-------|------|
| BOM readability | Material thumbs 56×56; table type ~12px; page row caps adjusted for larger rows |
| PDF size | Compressed cover (~2.3MB→105KB), QR, non-solar cover, BOM PNGs; brand assets ~1MB total |
| Panel logo | BOM-01 no longer hardcoded Adani; `resolveModuleBrandImageUrl` + `/brand/modules/*`; System Package shows brand logo |
| Orange | Accent `#e87a1a` (print-safe) across brand, proposal CSS, toolbar, globals |
| Back nav | Detail ← Quotations; Print Back = history.back with detail fallback + All quotations; Print opens same tab |

**Next step:** All reviseplan phases A–D complete. Optional: finish Inverters tab carry-over; QA print PDF on Chrome.

