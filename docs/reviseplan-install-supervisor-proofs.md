# KT Renewable Energy — Installation Supervisor, install proofs & feasibility PDF revise plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-17  
**Status:** Implemented 2026-09-17 (`046_installation_supervisor_proofs.sql`)  
**Source:** User revisions (Supervisor owns finalized leads before crew; richer install proofs; feasibility PDF upload)  
**Related:** `docs/plan-installation.md`, `docs/plan-payments.md`, `docs/workflow.md`, `docs/reviseplan-accounts-won-dealers.md`

---

## Purpose

Define how pre-dispatch–verified (“finalized”) files land with an **Installation Supervisor** (not directly with crew), what proofs installation must capture (geo, panels, serials, inverter OCR, completion video), and how feasibility switches from **URL paste → PDF upload** — including **error handling** at UI, server, and storage layers.

---

## Product language (clarify)

| User wording | Meaning in this app |
|--------------|---------------------|
| **Pre-dispatch cleared** | Accounts verifies pre-dispatch payment → stage `pre_dispatch_verified` |
| **Automatically goes to Installation** | Today the lead appears on `/installation` and Ops/Admin can assign crew immediately |
| **Supervisor** | New (or rebranded) role that **receives finalized leads first** and **assigns** them to `installation_crew` |
| **Installation team** | Existing `installation_crew` role — site work + proofs only after assignment |
| **Geo-tag** | Capture device GPS (lat/lng) on install proofs / completion |
| **Panels images** | Photos of installed panels (may be separate from barcode/DCR crop) |
| **Write number of serial numbers** | Explicit count + typed serial list (not only photo) |
| **Inverter serial scanner + OCR** | Capture inverter nameplate/serial photo → OCR → editable text field |
| **Video for site completion** | Required completion video proof (in addition to photos) |
| **Feasibility PDF upload** | Upload `.pdf` to Storage instead of pasting an external URL |

---

## Implementation order (recommended)

| Phase | Scope | Why first | Status |
|-------|--------|-----------|--------|
| **A — Supervisor handoff** | Role + queue + assign-only gate; crew cannot see unassigned finalized files | Unblocks correct ownership after payment verify | Done |
| **B — Feasibility PDF upload** | Replace URL field with `proofs` upload + validation | Isolated; reuses existing storage patterns | Done |
| **C — Install proof kinds & gates** | Geo, panel images, serial count/list, completion video | Extends existing `installation_photos` | Done |
| **D — Inverter OCR** | Camera/file → OCR → editable serial; persist | Heavier UX; optional offline fallback | Done |
| **E — Hardening & QA** | Error matrix, migrations on prod, smoke scripts | Ship-ready | Done (run `046` on prod) |

---

## Current state (audit)

### After pre-dispatch verify
| Layer | Today |
|-------|--------|
| Stage | `verifyPayment` → `pre_dispatch_verified` (`src/actions/payments.ts`) |
| Queue | `/installation` lists `pre_dispatch_verified` + later install stages |
| Assign | `assignInstallationCrew` allowed for `admin` / `ops_coordinator` / `assign_installation_crew` |
| Crew list | Roles `installation_crew`, `ops_coordinator`, `admin` |
| Gap | No dedicated **Supervisor** identity; Ops and crew share the same board entry point; finalized leads feel “already in Installation” |

### Installation proofs
| Layer | Today |
|-------|--------|
| Kinds | `site` \| `panel_barcode` \| `other` (`installation.ts`) |
| Schema | `file_url`, `panel_index`, `serial_hint`, **`latitude` / `longitude` columns exist but install UI does not set them** |
| Gate | ≥1 site photo + ≥ `expected_panel_count` barcode photos |
| Upload | `ProofUploadField` → `proofs` bucket (images + video MIME already allowed) |
| Missing | Explicit panel overview images, required geo, typed serial count, inverter serial + OCR, **required** completion video |

### Feasibility
| Layer | Today |
|-------|--------|
| UI | `FeasibilityPanel` — **“File URL (optional)”** text input |
| Server | `submitFeasibilityReport({ fileUrl })` — optional URL, no file upload |
| Storage | Not used for feasibility PDFs |
| Gap | User wants **PDF upload**, not URL |

### Existing assets to reuse
- Survey geo pattern: `survey-complete-panel.tsx` (`navigator.geolocation`)
- Proofs pipeline: `proof-upload-button.tsx`, `actions/uploads.ts`, `lib/uploads/proof-mime.ts` (PDF + video)
- Ops role as closest cousin to Supervisor (`ops_coordinator`)

---

## Item 1 — Installation Supervisor role & handoff

### Request
When pre-dispatch is cleared, leads should go to a **Supervisor** first. Supervisor assigns installations to the installation team.

### Recommended product flow

```
Accounts verifies pre-dispatch
      │
      ▼
pre_dispatch_verified          ← “Finalized — awaiting Supervisor”
      │  (Supervisor queue only; crew does NOT see yet)
      ▼
Supervisor assigns crew
      │
      ▼
installation_assigned          ← crew workspace unlocked
      ▼
… proofs … → installation_completed
```

**Do not** auto-set `installation_assigned` on payment verify (already true today — keep that).  
**Do** change visibility and who may assign.

### Plan

1. **Role strategy (prefer A):**
   - **A — Rebrand / extend `ops_coordinator`** → display name **“Installation Supervisor”**, keep slug for DB compatibility; grant exclusive assign authority.
   - **B — New enum role `installation_supervisor`** + migration on `user_role` / `roles` — cleaner naming, more migration risk.
   - **Default: A** unless product insists on a new slug.

2. **Authorities**
   - Keep `assign_installation_crew` on Supervisor (+ Admin).
   - Optionally add `view_supervisor_install_queue` for clarity.
   - **Remove** crew’s ability to call `assignInstallationCrew` (already blocked) and **hide** unassigned finalized leads from crew list.

3. **Queue split**
   - `/installation` tabs or sections:
     - **Awaiting assignment** (`pre_dispatch_verified`, no `assigned_crew_id`) — Supervisor only
     - **My jobs / In progress** — assigned crew (+ Supervisor/Admin overview)
   - Nav label: “Installation” subtitle → “Supervisor assigns crew after pre-dispatch”

4. **Server rules**
   - `listInstallationQueue`: filter by role
     - Supervisor/Admin: all stages from `pre_dispatch_verified` onward
     - Crew: only rows where `assigned_crew_id = me` and stage ∈ install stages
   - `assignInstallationCrew`: require Supervisor/Admin; target profile must be `installation_crew` (not Ops self-assign unless Admin)

5. **Notifications (optional v1 stub)**
   - On `pre_dispatch_verified`: outbox event `audience: supervisor`
   - On assign: notify assigned crew

### Error handling

| Case | Handling |
|------|----------|
| Crew opens finalized unassigned lead | 403 / empty queue — message: “Waiting for Supervisor assignment” |
| Non-supervisor calls assign | `Missing authority: assign_installation_crew` |
| Assign to non-crew user | `Selected user is not an installation crew member` |
| Assign when stage ≠ `pre_dispatch_verified` / already assigned stages | Clear stage-specific error (already partially present) |
| Race: two supervisors assign | Last-write-wins OR optimistic lock on `assigned_crew_id IS NULL`; prefer reject if already assigned |
| Payment verify fails mid-way | Keep existing reconcile (`044`); do not advance past `pre_dispatch_verified` |

### Files
- Migration (roles label / optional new role): `046_installation_supervisor.sql` (new)
- `src/actions/installation.ts`, `src/app/(dashboard)/installation/page.tsx`
- `src/components/leads/installation-queue-list.tsx`, `installation-panel.tsx`
- `src/lib/brand.ts`, `src/lib/domain/authorities.ts`, `src/lib/nav-access.ts`
- Docs: `docs/plan-installation.md`, `docs/workflow.md`

### Open questions
- Keep slug `ops_coordinator` (rename UI only) vs new `installation_supervisor`?
- May Admin still assign without Supervisor?
- Should Sales see Supervisor queue read-only?

---

## Item 2 — Installation proofs: geo, panels, serials, completion video

### Request
Add geo-tag, panel images, option to write number of serial numbers, video for site completion.

### Plan

1. **Extend proof kinds** (migration + domain):
   | Kind | Purpose |
   |------|---------|
   | `site` | Overview (existing) |
   | `panel_image` | Installed panel photo(s) |
   | `panel_barcode` | Barcode/DCR crop (existing) |
   | `inverter_serial` | Inverter nameplate / serial photo |
   | `completion_video` | Site completion video |
   | `other` | Optional |

2. **Geo-tag**
   - On each proof upload (or at least first site + completion video): call `navigator.geolocation.getCurrentPosition`
   - Persist `latitude` / `longitude` on `installation_photos` (columns already exist)
   - Lead-level optional snapshot: `leads.install_geo_lat/lng` + `install_geo_captured_at` for map summary
   - UI: show captured coords; “Retry location” button

3. **Panel images + serial numbers**
   - Require ≥ N `panel_image` (default N = `expected_panel_count`, Supervisor-set)
   - **Serial entry mode:**
     - Field: “Number of serial numbers” (integer ≥ 1, default = expected panels)
     - Dynamic list of text inputs `serial[i]` OR one-per-barcode `serial_hint` (existing)
   - Persist: either expand `serial_hint` per photo **or** new table `installation_panel_serials (lead_id, panel_index, serial_text, source: typed|ocr)`
   - **Default:** new child table for clarity + unique serial optional check

4. **Completion video**
   - Require ≥1 `completion_video` with video MIME (`mp4`/`webm`/`mov`)
   - Max size e.g. 100–150 MB (align with `proof-mime` / storage limits); compress guidance in UI
   - Gate in `installationProofGate` before `completeInstallation`

5. **Updated completion gate (v2)**
   - ≥1 site photo **with geo** (or geo on lead)
   - ≥ expected panel images
   - ≥ expected panel barcodes **or** typed serials satisfying count (product choice — **default: barcodes OR typed serials ≥ count**)
   - ≥1 inverter serial (photo and/or text)
   - ≥1 completion video
   - Clear missing list in UI + server throw

### Error handling

| Case | Handling |
|------|----------|
| Geo denied / unavailable | Block complete if geo required; allow upload with warning + `geo_status: denied`; Supervisor override authority optional |
| Geo timeout | Retry UI; store null + toast “Location timed out — retry on site” |
| Wrong MIME for video | Reject client + server (`proof-mime`); friendly message |
| File too large | Client pre-check; server Storage error → “Video too large; max X MB” |
| Serial count mismatch | Cannot complete: “Enter N serial numbers (have M)” |
| Duplicate serials (optional) | Warn or hard-block per company setting |
| Crew uploads before assign | Existing error — keep |
| Partial upload then network drop | Idempotent insert; list refresh; don’t mark complete |
| Storage RLS / missing service role | Same pattern as liaison docs — actionable error mentioning migration / `SUPABASE_SERVICE_ROLE_KEY` |

### Files
- `supabase/migrations/047_installation_proofs_v2.sql`
- `src/lib/domain/installation.ts` (kinds + gate)
- `src/actions/installation.ts`
- `src/components/leads/installation-panel.tsx`
- Shared: `ProofUploadField`, geo helper extracted from survey panel

### Open questions
- Is geo **required** to complete, or best-effort?
- Must every panel have both photo **and** serial, or serial alone enough?
- One completion video max or multiple allowed?

---

## Item 3 — Inverter serial scanner with OCR → text

### Request
Inverter serial number scanner with OCR-to-text.

### Plan

1. **UX**
   - Section “Inverter serial”
   - Actions: **Upload / Scan photo** → show preview → **Run OCR** → fill editable `<Input>`
   - User must confirm/edit before Save (OCR is assistive, not final)

2. **OCR approach (choose one)**
   | Option | Pros | Cons |
   |--------|------|------|
   | **Client OCR (Tesseract.js / WASM)** | No new backend; works offline-ish | Bundle size; weaker on glare |
   | **Server OCR (API / Cloud Vision)** | Accuracy | Cost, keys, latency, PII |
   | **Default v1: Client Tesseract.js** dynamic import on demand | Fits current stack | Need loading + error UX |

3. **Persistence**
   - Photo as `photo_kind = inverter_serial`
   - Text: `leads.inverter_serial_number` **or** `installation_photos.serial_hint` on that row
   - **Default:** lead column `inverter_serial_number TEXT` + photo row

4. **Optional barcode decode**
   - If nameplate is a 1D/QR code, try `@zxing/browser` before OCR; fall back to OCR

### Error handling

| Case | Handling |
|------|----------|
| OCR library fail to load | “Scanner unavailable — type serial manually” (never block typed entry) |
| OCR returns empty / garbage | Keep photo; empty input + “Couldn’t read serial — type it” |
| Camera permission denied | Fall back to file picker |
| HEIC / unsupported image | Convert via existing `prepareProofFileForUpload` or reject with friendly MIME error |
| Timeout | AbortSignal ~15s; allow retry |
| Server rejects empty serial on complete | Explicit gate message |

### Files
- `src/components/installation/inverter-serial-capture.tsx` (new)
- `src/lib/ocr/inverter-serial.ts` (new)
- `package.json` (+ `tesseract.js` if client path)
- Migration for `leads.inverter_serial_number` if chosen

### Open questions
- Client vs server OCR for v1?
- Is inverter serial **required** to complete install?

---

## Item 4 — Feasibility PDF upload (not URL)

### Request
Feasibility PDF upload instead of URL.

### Plan

1. **UI** (`FeasibilityPanel`)
   - Remove primary “File URL” field (keep optional “External link” collapsed advanced? **Default: remove**)
   - Add `ProofUploadField` / file input: `accept="application/pdf,.pdf"`
   - Show filename + “Replace” after upload
   - Require PDF before submit (unless notes-only allowed — **default: PDF required**)

2. **Server**
   - New action `uploadFeasibilityPdf(FormData)` → Storage path  
     `proofs/{company_id}/feasibility/{lead_id}/{uuid}.pdf`
   - `submitFeasibilityReport` accepts `storagePath` + public `fileUrl` from upload result
   - Validate content-type `application/pdf`; max size e.g. 20 MB
   - On approve/reject unchanged

3. **Schema (optional)**
   - `feasibility_reports.storage_path TEXT`
   - Keep `file_url` as public URL for open link

4. **Authorities**
   - Reuse `upload_feasibility_report`; ensure role can upload to `proofs` (extend `canUploadProof` in `uploads.ts` for feasibility role)

### Error handling

| Case | Handling |
|------|----------|
| Non-PDF selected | Client reject before upload |
| Upload Storage 403 | Message: check proofs policies / service role (same as other proofs) |
| Submit without file | `Feasibility PDF is required` |
| Corrupt / empty PDF | Size & magic-byte check if cheap; else Storage OK + open-in-new-tab smoke |
| Replace report | Soft-delete or supersede previous `submitted` row; don’t orphan Storage objects without cleanup job |
| Approve with missing file_url | Block approve |

### Files
- `src/components/leads/feasibility-panel.tsx`
- `src/actions/feasibility.ts`
- `src/actions/uploads.ts` (authority allowlist)
- Optional migration `048_feasibility_storage_path.sql`

---

## Cross-cutting error & UX standards

1. **Server actions** always throw `Error` with human-readable messages (no raw Postgres when avoidable); map `column does not exist` → “Run migration 047…”.
2. **UI** shows inline `error` banner + disable double-submit (`useTransition`).
3. **Uploads** use `friendlyUploadError` / `prepareProofFileForUpload` consistently.
4. **Audit** log: supervisor assign, proof add (kind), complete, feasibility upload/approve.
5. **RLS**: Supervisor needs lead SELECT (view_all_leads or assign list); crew only assigned leads — verify policies don’t leak finalized queue.
6. **Mobile-first**: install/OCR flows designed for phone camera on site.

---

## Suggested schema sketch

```sql
-- 046 — Supervisor (example if new role; or UPDATE roles.name for ops_coordinator)
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'installation_supervisor';

-- 047 — Install v2
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS inverter_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS install_geo_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS install_geo_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS install_geo_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_serial_count INT;

CREATE TABLE IF NOT EXISTS installation_panel_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  panel_index INT NOT NULL,
  serial_text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'ocr', 'barcode')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, panel_index)
);

-- photo_kind CHECK expanded in app; optional DB check constraint update

-- 048 — Feasibility
ALTER TABLE feasibility_reports
  ADD COLUMN IF NOT EXISTS storage_path TEXT;
```

---

## Test plan (when implementing)

### Supervisor
- [ ] After pre-dispatch verify, crew user does **not** see lead in queue
- [ ] Supervisor sees lead under “Awaiting assignment”
- [ ] Assign → stage `installation_assigned`; crew sees job
- [ ] Double-assign rejected
- [ ] Non-supervisor assign API fails

### Install proofs
- [ ] Complete blocked without geo (if required), panel images, serial count, video
- [ ] Video non-PDF/image rejected; PDF rejected for video kind
- [ ] Geo denied shows actionable message
- [ ] Serial count UI enforces N fields

### OCR
- [ ] OCR failure still allows manual type + save
- [ ] Confirmed serial persists and appears on complete audit

### Feasibility
- [ ] PDF upload succeeds; open link works
- [ ] URL-only path removed or hidden
- [ ] Approve still advances token gates with PDF present

### Regression
- [ ] Payment verify still stops at `pre_dispatch_verified` (migration `044` reconcile)
- [ ] Accounts receivables / Won subsidy unchanged
- [ ] `next build` + smoke scripts green

---

## Out of scope (unless requested)

- Full warehouse dispatch / inventory deduction
- Offline-first PWA install app
- Server-side paid OCR provider (unless Option B chosen)
- Auto-assign crew by geography
- Porting to MK / other forks

---

## Status log

| Date | Note |
|------|------|
| 2026-09-17 | Plan authored from user request + codebase audit; **implemented** (rebrand `ops_coordinator`, proofs v2, feasibility PDF, client OCR) |
