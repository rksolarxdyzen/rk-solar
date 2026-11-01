# KT Renewable Energy — Regular / General BOM revise plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Created:** 2026-09-16  
**Status:** Implemented 2026-09-16  
**Source:** User request to put `LIST OF MATERIALS (REGULAR) (1).pdf` components into the **general (Regular) quotation**, matching Premium behavior  
**Related prior docs:** `docs/plan-quotation-revision-2026.md`, `docs/reviseplan.md` (Phases A–D done)

---

## Purpose

Audit how Premium vs Regular (general) Bill of Materials works today, compare against the Regular materials PDF, list gaps, and define an implementation plan so Regular solar quotations get a full component list in the PDF the same way Premium does.

---

## Product language (clarify)

| User wording | Meaning in this app |
|--------------|---------------------|
| **Premium quotation** | Solar builder · tier toggle **Premium** · PDF uses `PREMIUM-BOM-*` (19 lines) |
| **General quotation** | Solar builder · tier toggle **Regular** · display label “Solar quotation” · PDF should use `REGULAR-BOM-*` (13 lines) |
| **Non-solar quotation** | Appliance / general products (SWH, RO, etc.) — **no** residential solar BOM |

This plan is **not** about non-solar appliance PDFs. It is about the **Regular tier solar proposal** component list.

---

## Source PDF (audit)

**File:** repo root `LIST OF MATERIALS (REGULAR) (1).pdf` (2 pages)  
Title on PDF: **LIST OF MATERIALS FOR RESIDENTIAL**  
Footer notes: Available inverter given · Regular structure height **8×5** · **5 years** maintenance free · company may change materials · T&Cs apply

| # | Component (PDF) | Spec (summary) | Make (PDF) |
|---|-----------------|----------------|------------|
| 1 | PV Solar Modules DCR | N-Type TOPCon Mono Bi-Facial | Adani, Waaree, Pahal |
| 2 | Grid-Tie Solar Inverter | IP65, single/three phase, >98% | **APS, XWATT** |
| 3 | Module Mounting Structure | 80µ HDGI · leg/rafter 60×40 · purlin 40×40 | ISI |
| 4 | Nut-Bolt | M6 + washer | SS 304, ISI |
| 5 | End & Mid Clamp | 35×50 mm Al anodized | ISI |
| 6 | Maintenance Free Chemical Earthing | 250µ Cu rod · 1 m × 14 mm | Standard, ISI |
| 7 | Lightning Protection | Multi spike · 14 mm · 1 m | Standard, ISI |
| 8 | Solar DC Cables | 2.5–4 Sq.mm | Polycab, KEI |
| 9 | AC Cables | 2.5–4 Sq.mm Cu · UV & fire | Polycab, KEI |
| 10 | Earthing Cables | 6 Sq.mm Al | ISI |
| 11 | Lightning Arrester Cable | 16 Sq.mm Al | ISI |
| 12 | AC/DC Protection | DC/AC MCB, SPD | IJMAX, ITEK, SCHUTZ |
| 13 | Cable Conduit Pipe | 25 Sq.mm white | Standard, MMS |

**Premium contrast:** Premium PDF has **19** lines (adds U Hook, Base Plate, Foundation, Earththing Bucket, Cable Tie, Auto Cleaning, heavier 80×40 structure, etc.).

---

## Current architecture (audit)

### How Premium gets its component list

1. Catalogue seed: `supabase/seed_premium_bom.sql` → `PREMIUM-BOM-01`…`19`, `template_kind = 'premium'`, images under `public/brand/bom-premium/`.
2. Quote save: solar builder with `tier_type = 'premium'`.
3. Print: `listBomCatalogItems()` loads all `PREMIUM-BOM-%` / `REGULAR-BOM-%` → `buildTierBomPrintLines(..., tier: 'premium')` → `SolarBomMaterialPages` (images + **Included** qty).
4. Catalogue admin: Premium tab matches `template_kind = premium` / `PREMIUM-BOM-*`.

### How Regular is supposed to work

| Layer | Intended | Actual today |
|-------|----------|--------------|
| Seed | `seed_regular_bom.sql` · 13 × `REGULAR-BOM-*` | Exists; **tagged `template_kind = 'non_solar'`** (misleading) |
| Images | `public/brand/bom-regular/` | **12 PNGs** — **missing `10-*.png`** (earthing cables). Seed points BOM-10 at premium `14-earthing-cables.png`; resolver maps `"10"` → premium file |
| Extract script | `scripts/extract-regular-bom.py` | Looks for `LIST OF MATERIALS (REGULAR).pdf` only — **not** `(1).pdf`; `_items.json` **skips #10** |
| Print path | `tierFromQuote` → `regular` → `REGULAR-BOM-*` | Code path **exists** and mirrors Premium |
| Tier copy | `tier-quote-copy.ts` Regular (60×40, 5 yr maintenance) | Aligned with PDF notes |
| Catalogue UI | Manage Regular BOM like Premium | **Broken:** Regular BOM models are **excluded** from Non-solar tab (`isBomCatalogModel` filter) and **not** matched for Solar tab (`catalogItemMatchesTemplate` only special-cases `PREMIUM-BOM` for premium) → Regular BOM is **hard to see/edit** in Catalogue |
| Builder line items | Premium historically used BOM lines in builder | Current solar builder is **per-kW turnkey**; BOM is **print-only** for both tiers (correct per 2026 plan) |

### Print / PDF behavior (both tiers)

- Shared: `solar-bom-material-pages.tsx`, `bom-image.ts`, Qty column = **Included**.
- Regular page titles: “List of materials” / “Residential package”.
- Empty Regular BOM in a live PDF almost always means: **seed not applied** on that Supabase project, or all `REGULAR-BOM-*` inactive — not a missing React page.

---

## Gap analysis (PDF vs seed vs assets)

| # | PDF | Seed `REGULAR-BOM-*` | Image file | Spec/make drift |
|---|-----|----------------------|------------|-----------------|
| 01–09, 11–13 | Present | Present | Present (except noted) | Minor naming OK |
| 02 Inverter | Make **APS, XWATT** | Brand VSOLE; warranty text Waaree | Present | **Update makes** to match PDF |
| 10 Earthing cables | Present | Present | **No** `bom-regular/10-*.png` | Re-extract or copy dedicated asset |
| Categories | — | Named “Regular — …” but `kind = non_solar` | — | Retarget to solar Regular |

---

## Goals (success criteria)

1. Creating a **Regular** solar quotation and opening Print/PDF shows a **full 13-line** component list (same layout as Premium: # · image · component · Included).
2. Component names, specs, and makes match **`LIST OF MATERIALS (REGULAR) (1).pdf`** (allow small typography cleanup).
3. Every Regular line has a dedicated thumbnail under `/brand/bom-regular/` (including #10).
4. Catalogue can list/edit Regular BOM the way Premium BOM is managed (clear Solar/Regular ownership — not buried as non-solar).
5. Non-solar appliance quotes remain **unchanged** (no solar BOM forced in).
6. Re-runnable seed + extract script documented; Deliverables synced after build.

---

## Non-goals

- Changing Premium 19-line BOM or Premium PDF layout.
- Bringing back editable BOM unit rates for sales.
- Redesigning non-solar appliance quotation PDF.
- Porting to Bright-Solar / other forks unless asked.

---

## Implementation plan

### Phase 0 — Confirm product intent (short)

Confirm with stakeholder:

1. “General” = **Regular tier solar** (not non-solar appliances).  
2. Print-only BOM (current model) is OK — no need to insert 13 priced lines into the builder.  
3. Inverter makes should follow PDF (**APS, XWATT**) even if rate-card inverters differ.

### Phase 1 — Assets from the new PDF

1. Point `scripts/extract-regular-bom.py` at:
   - `LIST OF MATERIALS (REGULAR) (1).pdf` (repo root and/or `Apps/RK-Solar/`).
2. Re-run extract; ensure **all 13** slots produce PNGs (especially **#10 Earthing Cables**).
3. Refresh `public/brand/bom-regular/_items.json`.
4. Update `bom-image.ts` `REGULAR_IMAGE_BY_NUM["10"]` to a local `10-earthing-cables.png` (stop borrowing premium `14-` once local exists).
5. Compress new PNGs to keep PDF size down (same approach as Phase D).

### Phase 2 — Seed & catalogue ownership

1. Revise `supabase/seed_regular_bom.sql`:
   - Keep models `REGULAR-BOM-01`…`13`.
   - Align item names / capacity / warranty / brand text with the PDF table.
   - Set **`template_kind = 'solar'`** (or `'both'` if both tabs must see them — prefer `solar`).
   - Categories: keep “Regular — …” names; set category `kind` to **`solar`** (not `non_solar`).
   - Image URLs → `/brand/bom-regular/…` including #10.
2. Fix `catalogItemMatchesTemplate`:
   - For `templateKind === 'solar'`, treat `model.startsWith('REGULAR-BOM-')` as a match (mirror Premium’s special-case).
3. Catalogue admin (optional UX polish):
   - Solar tab shows Regular BOM rows, **or** add a clear “Regular BOM” filter/section so ops can edit like Premium.
4. Apply seed on the target Supabase project (re-runnable `DELETE … REGULAR-BOM-%` then insert).

### Phase 3 — Print path verification (parity with Premium)

1. Confirm `tier_type = 'regular'` on save from QuoteTierToggle.
2. Confirm print page: `tierFromQuote` → `buildTierBomPrintLines` → 13 lines, images resolve, Qty = Included.
3. System package page: Regular structure copy already 60×40 / 5 yr — spot-check vs PDF footer.
4. Overlay panel/inverter make from quote onto BOM-01 / BOM-02 (already in `overlayQuoteEquipmentOnBom`).
5. Edge cases: 0 catalog rows → empty state / ops message; mixed inactive items.

### Phase 4 — QA + delivery

1. QA matrix:

   | Check | Premium | Regular |
   |-------|---------|---------|
   | Tier toggle | ✓ | ✓ |
   | PDF component pages | 19 lines | 13 lines |
   | Images present | all | all incl. #10 |
   | Qty column | Included | Included |
   | Catalogue visible/editable | Premium tab | Solar/Regular |
   | Non-solar quote | no solar BOM | no solar BOM |

2. Sync `Deliverables/rk-solar` via `sync-from-app.ps1`.
3. Update `Global Instructions/memory.md` work log.

---

## Files likely touched

| Area | Path |
|------|------|
| Plan (this doc) | `docs/reviseplan-regular-bom.md` |
| Seed | `supabase/seed_regular_bom.sql` |
| Extract | `scripts/extract-regular-bom.py` |
| Assets | `public/brand/bom-regular/*`, `_items.json` |
| Image map | `src/lib/quotations/bom-image.ts` |
| Catalogue match | `src/lib/quotations/types.ts` (`catalogItemMatchesTemplate`) |
| Catalogue UI | `src/components/catalog/catalog-admin.tsx` (if tab polish needed) |
| Print (verify only) | `tier-bom.ts`, print page, `solar-bom-material-pages.tsx` |

---

## Risks & open questions

| Risk / question | Notes |
|-----------------|-------|
| Seed not run in production | Code path ready but PDF empty until SQL applied |
| IFSC-style DB mistakes | Unrelated; don’t mix with this work |
| Inverter brands APS/XWATT vs catalog inverters | PDF BOM “make” is marketing text; quote inverter overlay may still show selected inverter |
| Naming “General” vs “Regular” | UI still says Regular — change label only if product asks |
| Copy PDF into app folder? | Extract script should accept both root and app paths |

---

## Recommended order

| Phase | Work | Status |
|-------|------|--------|
| **0** | Confirm Regular = general solar tier | **Done** (implemented as Regular solar) |
| **1** | Re-extract images from `(1).pdf` + fix #10 | **Done** |
| **2** | Seed + `template_kind` + catalogue matching | **Done** |
| **3** | Print parity QA | Pending ops (re-run seed on Supabase) |
| **4** | Deliverables sync + memory | **Done** |

### Completion notes (2026-09-16)

- Re-extracted 13 Regular BOM images (incl. `10-earthing-cables.png`) from `LIST OF MATERIALS (REGULAR) (1).pdf`
- `seed_regular_bom.sql`: `template_kind = solar`, categories kind `solar`, inverter makes APS/XWATT
- `catalogItemMatchesTemplate`: `REGULAR-BOM-*` matches solar template
- Tier toggle label: **Regular / General**; list label: Regular (general) solar quotation
- Synced to `Deliverables/rk-solar`

**Ops:** Re-run `supabase/seed_regular_bom.sql` on the production Supabase project so Regular PDF lines appear.

**Next step after approval:** ~~Phase 0 confirmation, then Phase 1–2 implementation.~~ Apply seed on prod + QA Regular Print/PDF.

---

## Sign-off

| Role | Decision |
|------|----------|
| Product | Confirm “general” = Regular solar; APS/XWATT makes; print-only BOM OK |
| Build | Implement Phases 1–4 after approval |
| QA | Checklist above on a Regular quote Print/PDF |
