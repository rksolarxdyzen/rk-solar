# Module 3 — Multi-template Quotation Engine

**App:** `Apps/RK-Solar`  
**PRD:** Module 3 (solar + non-solar quotes, %/₹ discounts, terms)  
**Decision:** Lean **Sumeru-style** schema (`quotations.lead_id`) + Quotation-Generator **math/print patterns**. Do not copy Sumeru brand, multi-layout Dyzen proposals, or QG standalone customers.

---

## 1. Source decision

| Option | Verdict |
|--------|---------|
| Drop-in Quotation-Generator | **No** — customers-only, solar-only layouts, no leads |
| Full Sumeru quote engine | **No** — brand, rate-card depth, commercial GST extras |
| Lean port | **Yes** — catalog + quotations + line snapshots + HTML print |

---

## 2. Vertical slice (v1 — this build)

1. Catalog: categories, brands, items (solar + non-solar seed).
2. Quotations linked to leads; customer snapshot from lead.
3. `template_kind`: `solar` | `non_solar`.
4. Line items with qty/rate/GST + line discount ₹; header discount ₹ (UI also offers %).
5. Solar extras: optional `system_size_kw`, `meter_charges`, `subsidy` on quotation.
6. Status: `draft` → `sent` → `accepted` (and `rejected`).
7. Lead stages: `survey_completed` → `quoted` (on first save) → `quote_accepted` (on accept).
8. Print route (browser PDF).
9. Create CTA from survey-complete lead detail.

**Defer:** full rate-card packages, multi-layout proposal docs, WhatsApp send, commercial GST modes, payment Module 4.

---

## 3. Authorities

- `view_quotations`
- `create_quotations` / `manage_quotations` (upsert + send)
- `edit_quotation_pricing` (discounts / overrides)
- `accept_quotations`
- `manage_catalog_items`

Seeded on Admin + Sales Manager; Sales Executive defaults in app code.

---

## 4. Exit criteria

- [x] Create solar or non-solar quote from `survey_completed` lead
- [x] Edit lines + discounts; totals recalculate
- [x] Accept quote → lead `quote_accepted`
- [x] Print view
- [x] Catalog list (basic) for picking items
- [x] Catalog admin CRUD (items / brands / categories)
