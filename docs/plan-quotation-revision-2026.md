# Solar Quotation & Rate Card — Revision Plan (2026)

Client walk-through revision notes. Maps target architecture to current RK Solar (`Apps/RK-Solar`) implementation.

---

## 1. Problem summary

| Issue | Current | Target |
|-------|---------|--------|
| New quote gating | Customer picker + template dropdown before builder | **New Solar Quote** opens builder immediately |
| Pricing model | Residential: lump-sum rate-card packages; BOM lines editable at ₹0 | **Per-kW turnkey rate** (GST incl.) × calculated kW |
| Tier selection | Separate template kinds (`solar` / `premium` / `non_solar`) | **Premium \| Regular toggle** on solar builder |
| Non-solar | Same picker; `non_solar` = regular BOM | **Dedicated “New Non-Solar Quote”** (appliances, no solar BOM) |
| BOM in PDF | Premium/general use `BomQuotationDocument`; solar uses summary BOM | PDF BOM tables from **LIST OF MATERIALS PDFs**, **images only, no line prices** |
| Rate editing | Sales can edit every BOM line rate | **Locked line rates**; only admins edit rate card |

---

## 2. Target workflows

### Solar (90% of quotes)

```
[New Solar Quote] → Quote Builder (no intermediate screens)
  ├── Customer / lead (inline, searchable)
  ├── Tier toggle: [ Premium (default) | Regular ]
  ├── Panel model dropdown + panel qty → auto kW
  ├── Inverter model + phase
  ├── Auto price = kW × rate/kW (from rate card, tier + residential/commercial)
  ├── Subsidy → net payable
  └── Save → Solar proposal PDF + BOM pages (tier BOM, images, no component prices)
```

### Non-solar

```
[New Non-Solar Quote] → Appliance builder
  ├── Customer / lead
  ├── Add appliances (heat pump, SWH, RO, etc.)
  ├── Unit qty × price + GST
  └── PDF without solar BOM / net-meter clauses
```

---

## 3. Data schema (target)

### Rate card master (extend or replace package lump prices)

Per **panel model** row:

| Field | Example |
|-------|---------|
| `panel_name` | Adani 540W Mono PERC |
| `panel_wattage` | 540 |
| `category_type` | Residential / Commercial |
| `regular_rate_per_kw` | 48000 (GST incl.) |
| `premium_rate_per_kw` | 52000 (GST incl.) |

### Quotation record (extend)

| Field | Notes |
|-------|-------|
| `quote_type` | Solar / Non-Solar |
| `tier_type` | Premium / Regular |
| `panel_id` | FK → rate card row |
| `panel_qty` | User input |
| `system_kw` | `(wattage × qty) / 1000` |
| `total_system_cost` | `system_kw × rate_per_kw` |
| `subsidy_amount` | Auto from kW slabs |
| `net_payable_amount` | Total − subsidy |

**Migration:** `034_quotation_per_kw_rate_card.sql` (planned).

---

## 4. BOM sources (PDFs)

| PDF | Catalog seed | Images | Print |
|-----|--------------|--------|-------|
| LIST OF MATERIALS (PRIMIUM).pdf | `seed_premium_bom.sql` | `public/brand/bom-premium/` | Premium tier / premium template |
| LIST OF MATERIALS (REGULAR).pdf | `seed_regular_bom.sql` | `public/brand/bom-regular/` (extract script) | Regular tier / general template |

Extract images: `scripts/extract-premium-bom.py` (done), `scripts/extract-regular-bom.py` (add).

Print rule: BOM table shows **# · image · component · qty** — **no unit rates** on material pages.

---

## 5. Implementation phases

### Phase 1 — UX foundation ✅

- [x] Split CTAs: **New Solar Quote** / **New Non-Solar Quote**
- [x] Open builder directly (customer fields in builder, no pre-gate screen)
- [x] Premium / Regular toggle UI on solar builder
- [x] Lock BOM line rates for non-admin on premium/general builder
- [x] This plan document

### Phase 2 — Per-kW rate card ✅

- [x] Migration `034`: per-kW columns on rate card companies; `tier_type`, `rate_per_kw_snapshot`, `net_payable_amount` on quotations
- [x] Rate card admin UI: per-kW fields per panel brand (residential + commercial, regular + premium)
- [x] Builder: panel dropdown + qty → kW; fetch rate by tier + project type
- [x] Legacy lump package picker remains as fallback when per-kW rates are not configured

### Phase 3 — Unified solar PDF + BOM ✅

- [x] Tier BOM (premium/regular catalog) injected into solar proposal print after system summary
- [x] Dynamic BOM page chunking (11 items/page) with component thumbnails, qty only — no line prices
- [x] Portfolio / “Our Completed Projects” gallery on thank-you page (`previousWorkPhotos`)
- [x] Regular BOM images extracted to `public/brand/bom-regular/`; seed URLs updated
- [x] Shared `bom-image.ts` resolver; regular BOM PDF uses same image+qty table layout

### Phase 4 — Non-solar appliance flow ✅

- [x] Appliance catalogue (`seed_appliance_catalog.sql`) — heat pumps, SWH, RO
- [x] Dedicated appliance builder (`quotation-builder-form-appliance.tsx`)
- [x] Dedicated non-solar PDF template (`appliance-quotation-document.tsx`)
- [x] Remove solar-specific fields from non-solar save path (`usesResidentialBomFields` → premium only)
- [x] Print/edit/new workspace wired for `non_solar` appliance flow

---

## 6. Current file map

| Area | Path |
|------|------|
| New quote page | `src/app/(dashboard)/quotations/new/page.tsx` |
| Workspace router | `src/components/quotations/new-quotation-workspace.tsx` |
| Solar builder | `src/components/quotations/quotation-builder-form.tsx` |
| BOM builder | `src/components/quotations/quotation-builder-form-simple.tsx` |
| Rate card admin | `src/components/catalog/rate-card-manager.tsx` |
| Solar PDF | `src/components/quotations/solar-proposal-document.tsx` |
| BOM PDF | `src/components/quotations/bom-quotation-document.tsx` |
| Premium seed | `supabase/seed_premium_bom.sql` |
| Regular seed | `supabase/seed_regular_bom.sql` |

---

## 7. Action items (from client notes)

1. Remove intermediary gating screens for solar quotes.
2. Implement Premium / Regular toggle bound to pricing + BOM tier.
3. Deploy per-kW rate card master (residential + commercial).
4. Isolate non-solar with separate navigation entry.
5. Finalize PDF: dynamic BOM tables, component thumbnails, project showcase gallery.
