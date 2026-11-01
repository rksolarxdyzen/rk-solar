# KT Renewable Energy — Crew-only install workspace revise plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-17  
**Status:** Implemented 2026-09-17 (four required proofs + optional Other; auto-complete)  
**Source:** User revision (crew ignores stages; sequential panel photos with live barcode + 10s fallback; persist partial work; auto-complete to Documentation)  
**Related:** `docs/reviseplan-install-supervisor-proofs.md` (Supervisor handoff + proofs v2 — implemented), `docs/plan-installation.md`, `docs/workflow.md`  
**Follow-on:** `docs/reviseplan-crew-remaining-2026.md` — **A–D implemented 2026-09-19** (crew brief; hide leftover stage copy; RLS `049`; sequential bulk panels + lock Remove `050`).

---

## Purpose

Redesign the **installation crew** experience so that, after the Supervisor assigns a job, the team never thinks about pipeline stages. They only capture a small, fixed set of proofs. Completing the last required proof **automatically** finishes installation and hands the file to Documentation.

Supervisor assignment, Accounts, and internal `sales_stage` values stay in the database. Crew UI and crew actions must not surface them.

---

## Product language (clarify)

| User wording | Meaning in this app |
|--------------|---------------------|
| **Installation team** | Role `installation_crew` — assigned jobs only |
| **Supervisor** | Role `ops_coordinator` (display: Installation Supervisor) — assigns crew + `expected_panel_count` |
| **Should not care about any kind of stage** | Crew screen has **no stage badges, no Complete button, no “in progress / assigned” copy**. Internal stages (`installation_assigned` → `installation_in_progress` → complete) still update in the background |
| **n photos (n = number of panels)** | Exactly `expected_panel_count` **panel photos** (one per panel, index 1…n). Supervisor sets n at assign (fallback: Won panel quantity) |
| **Inverter serial number** | Typed or scanned **text** on the lead (`inverter_serial_number`). Photo of inverter is **not** required for crew v1 unless we keep it as assist-only |
| **Geotag photo of the customer** | One **customer / people-on-site photo** with GPS (`latitude` / `longitude` required). Distinct from panel photos |
| **Site video** | One **completion video** (existing `completion_video`, max 180s) |
| **Nothing else required** | Hide from crew: assign form, stages, Complete. **Other** proofs are optional extras |
| **Barcode scanned for panel serial, then they can click the photo** | For panel *k*: live barcode attempt + serial field. Camera shutter for the **panel photo** unlocks when a serial is recorded **or** after **10 seconds** with an empty field |
| **Not mandatory to write the serial** | If barcode fails, crew may leave serial blank after 10s, or type it optionally |
| **Panel 1 photo mandatory before 2** | Sequential unlock: panel *k+1* disabled until panel *k* photo exists |
| **Partial photos remain pending** | Incomplete jobs stay on the crew list. Already-uploaded files are never discarded |
| **Once all uploaded, automatically marked complete** | Server, not a crew button: last successful required upload runs the existing complete path → Documentation (`liaison_in_progress`) |
| **Documentation team** | Existing liaison / `/liaison` (Documentation nav) |

---

## Target crew checklist (only this)

Progress text for crew, e.g. “3 of 6 done” — **not** stage names:

1. **Customer geo photo** — 1 image with GPS  
2. **Inverter serial** — saved text (≥ 3 characters)  
3. **Panel 1 … Panel n** — sequential photos; serial optional (barcode / type / skip after 10s)  
4. **Site video** — 1 video  

When all four groups are satisfied, auto-complete. Order of groups is **not** gated except **panels among themselves**.

---

## Recommended product flow

```
Supervisor assigns crew + panel count n
        │
        ▼
Crew “My job” (no stages)
  • Customer geo photo
  • Inverter serial
  • Panel 1 → wait barcode or 10s → photo
  • Panel 2 (only after Panel 1 photo) → …
  • Panel n
  • Site video
        │  (any subset may be saved; job stays open)
        ▼
Last required proof saved
        │  server auto-complete
        ▼
liaison_in_progress     ← Documentation
```

Internal: first proof still moves `installation_assigned` → `installation_in_progress` (silent). Crew never sees that.

---

## Implementation order

| Phase | Scope | Why first | Status |
|-------|--------|-----------|--------|
| **A — Crew workspace UI** | Replace crew panel with the four-task checklist; hide stages / Complete / extra kinds | Makes the product change visible | Done |
| **B — Sequential panel capture** | Panel *k* locked until *k−1* photo; live barcode + 10s shutter unlock; optional typed serial | Core capture rule | Done |
| **C — Auto-complete** | After each successful proof save, if gate v3 passes, call complete (no crew button) | Hands off to Documentation | Done |
| **D — Gate + server rules** | New `installationCrewGate`; sequential insert checks; persist serials per panel | Prevents skipping Panel 2 early | Done |
| **E — Supervisor / QA** | Supervisor still sees stages; crew queue copy; tests | No regression on assign | Done |

---

## Current state (audit)

| Layer | Today (after proofs v2) | Gap vs this request |
|-------|-------------------------|---------------------|
| Crew UI | Full kinds list (`site`, `panel_image`, `panel_barcode`, `inverter_serial`, `completion_video`, `other`), serial-count form, Retry location, **Complete** button, stage-aware copy | Too many tasks; stages and Complete are visible |
| Panel photos | Any order; barcode is a **separate** photo kind **or** a typed serial list | User wants **one photo per panel**, barcode as **scan assist**, not a second photo |
| Sequence | None | Panel 2 must wait for Panel 1 photo |
| Barcode → shutter | Scan is on inverter / after file pick | Need **live** (or preview) scan, then unlock panel shutter; **10s** empty-field unlock |
| Geo | Any site photo + optional Retry location | One **customer** geo photo |
| Complete | Manual button when gate v2 passes | **Automatic** when all required files exist |
| Partial work | Already persisted in `installation_photos` | Keep; do not add a “reset job” |
| After complete | Stage `liaison_in_progress`, notify accounts/sales/liaison | Keep; this **is** Documentation |

---

## Item 1 — Crew sees tasks, not stages

### Plan

1. **Split UI by role**
   - **Supervisor / Admin:** keep assign crew + panel count + read-only proof overview (stages OK).
   - **Crew:** new `CrewInstallWorkspace` (or slim `InstallationPanel` mode `crew`).

2. **Crew screen contents only**
   - Job header: customer name, phone, city, **n panels** (read-only).
   - Checklist of the four groups with counts (e.g. Panels 2/10).
   - No `Badge` of `sales_stage`. No “Assigned / In progress / Complete installation”.

3. **Queue (`/installation`)**
   - Crew: “My jobs” / “Finish remaining photos” — not Pre-Dispatch Verified.
   - After auto-complete, job **leaves** the crew list (stage is no longer an install stage).

### Error handling

| Case | Handling |
|------|----------|
| Crew opens unassigned job | Existing empty queue / 403 — “Waiting for Supervisor assignment” |
| Crew opens completed job | Read-only “Sent to Documentation” or 404 from queue |
| Supervisor still needs stages | Unchanged on Supervisor UI |

### Files

- `src/components/leads/installation-panel.tsx` (split or `mode="crew"|"supervisor"`)
- `src/components/leads/installation-queue-list.tsx`
- `src/components/leads/installation-detail-modal.tsx`
- `src/app/(dashboard)/installation/page.tsx`

---

## Item 2 — Panel capture: barcode + 10s + sequential photos

### UX (per panel k)

```
Open Panel k (enabled only if k==1 or panel k-1 photo exists)
        │
        ▼
Live camera / continuous BarcodeDetector on preview
  + serial field (empty, fills if scan hits)
        │
        ├─ serial recorded (scan or typed) → Enable “Take panel photo”
        └─ 10s elapsed and field still empty → Enable “Take panel photo”
              (optional: crew may still type serial before/after)
        │
        ▼
Take / upload panel photo → stored as photo_kind=panel_image, panel_index=k
        + serial_hint / installation_panel_serials if present
        │
        ▼
Unlock Panel k+1
```

**Defaults (locked for v1 unless product changes):**

- **One** `panel_image` per index; no separate `panel_barcode` upload for crew.
- Barcode uses existing `BarcodeDetector` (same helper as inverter). If the API is missing (iOS Safari gaps), start the **10s timer immediately** and show “Type serial or wait 10s to photograph”.
- Timer starts when Panel *k* card is opened (or camera permission granted), not on page load for all panels.
- If they type a serial before 10s, shutter unlocks immediately (same as a successful scan).
- Serial after photo: allowed (edit field + save) but **not** required to unlock the next panel — **next panel unlocks on photo**, not on serial.

### Server rules

- `addInstallationPhoto` for `panel_image` with `panelIndex = k`:
  - Reject if no photo exists for `k-1` when `k > 1`.
  - Reject if `k > expected_panel_count`.
  - Reject duplicate index (or replace — **default: reject duplicate**; crew can Remove then re-take).
- Do **not** require `serial_hint` on insert.

### Error handling

| Case | Handling |
|------|----------|
| Camera permission denied | File picker + 10s timer; optional type serial |
| Scan garbage | Don’t fill field; timer still runs |
| Upload Panel 2 with no Panel 1 | Server error: “Upload Panel 1 photo first” |
| Network drop mid-job | Partial photos remain; reopen job and continue |

### Files

- New: `src/components/installation/panel-capture-step.tsx`
- `src/lib/ocr/inverter-serial.ts` (reuse `scanInverterSerialFromImage` / live detect)
- `src/actions/installation.ts`

---

## Item 3 — Customer geo photo, inverter serial, site video

### Customer geo photo

- Kind: keep `site` **or** add `customer_geo` — **default: reuse `site`** with required lat/lng (label in UI: “Customer photo (with location)”).
- Capture GPS at shutter (`captureGeoPosition`). If GPS denied, **block this one upload** (this is the geotag proof). Other tasks can still be done.
- Not sequential with panels.

### Inverter serial

- Keep `InverterSerialCapture` (scan assist + mandatory **Save** of text).
- Crew is **not** required to upload an inverter **photo** to finish (`inverter_serial` kind optional).
- Optional **Add several GPS photos** / single GPS camera next to the serial field (`photo_kind = inverter_serial`, lat/lng required on server).

### Site video

- Keep `completion_video` + `videoKind: "installation"` (180s).
- Not sequential with panels.

---

## Item 4 — Auto-complete → Documentation

### Plan

1. Extract `tryAutoCompleteInstallation(leadId)` used after:
   - `addInstallationPhoto`
   - `saveInverterSerial`
   - `saveInstallationSerials` (if still used per panel)
2. Gate **v3** (`installationCrewGate`):

   | Required | Rule |
   |----------|------|
   | Customer geo photo | ≥1 `site` with geo (or lead `install_geo_*`) |
   | Inverter serial | `inverter_serial_number` trim length ≥ 3 |
   | Panel photos | Count of `panel_image` with indexes 1…n **contiguous** = n |
   | Site video | ≥1 `completion_video` |
   | Panel serials | **Not required** |

3. On success: same as today’s `completeInstallation` (stage `liaison_in_progress`, portal code, notify accounts/sales/liaison).
4. **Remove Complete button** for crew. Supervisor/Admin: **default hide Complete too** (auto path is source of truth). Optional Supervisor “force complete” is **out of scope**.

5. Race: two last uploads — complete must be idempotent (if already `liaison_in_progress` / completed, return `{ ok: true, already: true }`).

### Error handling

| Case | Handling |
|------|----------|
| Gate almost complete, GPS missing on customer photo | Job stays pending; checklist shows that item |
| Complete RLS / missing `046` columns | Existing friendly migration error |
| Notify outbox fails after stage update | Keep current complete behaviour (log; don’t roll back photos) |

### Files

- `src/lib/domain/installation.ts` — `installationCrewGate`
- `src/actions/installation.ts` — `tryAutoCompleteInstallation`

---

## Item 5 — What Supervisor still does

Unchanged from previous revise:

- Sees **Awaiting assignment** after pre-dispatch verify.
- Assigns `installation_crew` + **n** (`expected_panel_count`).
- Does **not** upload crew proofs unless Admin assist (optional: Supervisor can view photos read-only).

Crew still cannot assign.

---

## Schema

**No new tables required** if we reuse:

- `installation_photos.photo_kind = site | panel_image | completion_video`
- `panel_index` on panel photos
- `serial_hint` + `installation_panel_serials` for optional serials
- `leads.inverter_serial_number`, `install_geo_*`, `expected_panel_count`

Optional later: `photo_kind = customer_geo` if `site` is too overloaded. **v1: reuse `site`.**

`panel_barcode` / `other` / `inverter_serial` photo kinds: stop offering in crew UI; leftover rows still count only if we map them (v1: **ignore extra kinds for the crew gate**).

---

## Error & UX standards

1. Crew copy is task-based (“Panel 3 of 10”, “Waiting for location”).
2. 10s timer visible (“Scanning… you can photograph in 8s”).
3. Uploads stay idempotent; never delete other panels if one fails.
4. Auto-complete only server-side so a client crash after the last upload still completes on retry/refresh.

---

## Test plan (when implementing)

### Crew
- [ ] No stage badge / Complete button on assigned job
- [ ] Panel 2 control disabled until Panel 1 photo exists
- [ ] Server rejects Panel 2 insert without Panel 1
- [ ] Scan fills serial → shutter enabled before 10s
- [ ] Empty serial → shutter enabled at 10s; photo uploads without serial
- [ ] Optional typed serial saved with panel
- [ ] Leave after 4/10 panels → reopen → same 4 photos; continue at Panel 5
- [ ] Customer photo without GPS refused; panels/video still uploadable
- [ ] Last required item (e.g. video) auto-moves job to Documentation; crew queue empty

### Supervisor
- [ ] Assign still required; crew cannot see unassigned
- [ ] Panel count n drives how many panel slots appear

### Regression
- [ ] Feasibility PDF, payment cap, Won subsidy unchanged
- [ ] `next build` green

---

## Out of scope

- Changing Supervisor assignment or pre-dispatch verify
- Requiring serials to complete
- Offline PWA / background upload queue
- Force-complete by Supervisor
- Port to MK / Recare / other forks
- Live barcode on every browser (fallback: 10s + type)

---

## Open questions (defaults applied)

| Question | Default in this plan |
|----------|----------------------|
| Must inverter **photo** exist? | **No** — text serial only |
| Must every panel have a serial? | **No** |
| Geo on every panel photo? | **No** — only customer geo photo |
| Can crew skip Panel 1 and do video first? | **Yes** — only panels are sequential |
| Replace vs reject second photo for same panel index? | **Reject**; Remove then re-take |
| Label for geo photo? | “Customer photo (with location)” using kind `site` |

---

## Status log

| Date | Note |
|------|------|
| 2026-09-17 | Implemented: required customer GPS photo, inverter serial, n sequential panel photos (barcode + 10s), site video; optional Other; auto-complete to Documentation |
