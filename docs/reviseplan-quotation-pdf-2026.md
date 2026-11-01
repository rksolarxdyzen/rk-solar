# Revise plan — Quotation PDF fixes (RKSO Portal, Sep 2026)

**App:** `Apps/RK-Solar` (RK Solar)
**Scope:** Solar proposal print / PDF only (`/quotations/[id]/print` and the template preview). No workflow, gate, or payment-ledger changes.
**Status:** Implemented 2026-09-28 (not yet deployed). Migration `054`.

### Client answers (2026-09-28)

1. **ADV:** yes, a tag on the advance line of the payment schedule.
2. **Bank:** remove SBI and show ICICI only. Done in `brand.ts` defaults; migration `054` rewrites any saved settings that still mention SBI.
3. **Page 7:** align the numbers and lines. The chart was rebuilt (Y labels sit on the grid lines, "0" is on the baseline, year labels sit under the bars), scope badges line up with the text, and the Terms list fits on the page.
4. **Rupee:** show the "₹" symbol, using the Noto Sans font for that character only.
5. **Branch and QR (follow-up):**
   - The PDFs show "Branch Name — Vasad" (the `BRAND.bank.branch` default; `054` fills an empty saved branch).
   - The payment QR (`public/brand/`) is replaced with the ICICI eazypay QR from the client's `ICICI QR.pdf`. It decodes to `upi://pay?pa=&pn=RK Solar…`.
   - "UPI ID: " is printed below the QR on the Solar, BOM and appliance quotations. It is editable in the Template editor as the `upiId` field.

### Implementation deltas vs the plan below

- **Bank:** kept the single flat bank fields (ICICI only), so the multi-bank array was not needed. The Branch line is hidden until a branch is entered in the Template editor.
- **Page 6:** caption matching was dropped. The saved captions follow the slot, so matching on them would re-swap the text. Instead, `OTHER_PRODUCTS` is reordered to Heater, Heat Pump, **Street Light**, **Water Pump**, which matches the uploaded flyers. Slot captions follow the product titles, and the editor names each slot.
- **Page 7:** the scope row now takes only its content height. The documents table and Terms are tighter, and the chart box uses `border-box`, so the chart and Terms end on the same line.

---

## 1. Goal

The client should get the same PDF from **Print → Save as PDF** that the screen preview shows:

- Colours stay the same when printed.
- Nothing is cut off.
- Each product has the right text.
- Bullets, ₹ symbols and numbers render cleanly.
- Payment and bank wording is complete and does not tie the quotation to one state.

---

## 2. How the client's page numbers map to the PDF

A typical Premium quotation has more than 10 component rows. Its pages are built by `SolarProposalDocument` (`src/components/quotations/solar-proposal-document.tsx`):

| PDF page | Section | Rendered by |
|---|---|---|
| 1 | Cover | `solar-proposal-cover.tsx` |
| 2 | **Offer**: price table, payment schedule, payment details, bank details | `solar-proposal-document.tsx` (the first `sp-page` section) |
| 3 | **System package**: panel, inverter, cables, structure, BOS, **Warranty & service** | `solar-proposal-document.tsx` |
| 4–5 | Component list (paged) | `SolarBomMaterialPages` in `solar-bom-material-pages.tsx` |
| 6 | **Our Other Products**: 4 products with image, title and bullet features | `PreviousWorkSection layout="catalog"` + `other-products.ts` |
| 7 | **Scope of work & savings**: numbered scope lists, KPI cards, 15-year chart, documents, T&C | `solar-proposal-document.tsx` (`sp-page-merged`) |
| 8 | Thank you / contact / branches | `solar-proposal-document.tsx` |

Notes:

- The client's "Page 1 – Payment Details" is the **Offer** page. It is the first content page after the cover, and PDF page 2.
- The page count changes when there are 10 or fewer component rows (typically Regular). In that case the component table sits inline on page 3, and the products gallery appears as a grid on the same page instead of on its own page 6.

---

## 3. Client notes → root cause → fix

### G. Background colour changes when printing

**Cause.**

- `print-color-adjust: exact` is declared only on `.sp-print-root` (`solar-proposal-css.ts`, lines 5–12). That class is **never used** in the print route or the preview.
- So Chrome and Edge fall back to their default print behaviour. They drop or lighten backgrounds unless the user ticks **"Background graphics"**.
- Affected: navy table headers, the `%` pills, the KPI band gradient, the page-top accent bar, scope number badges, the thank-you band and the bullet squares.

**Fix.**

1. Put `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on `.sp-root, .sp-root *`, and on `html, body` inside `@media print`.
2. Either wrap the print page in `.sp-print-root` or delete that dead rule.
3. In `@media print`, also set `html, body { background: #fff; margin: 0; }` so no grey canvas shows between pages.
4. Make the print toolbar tip say: "If colours look faded, enable *Background graphics* in the print dialog." This covers Firefox and Safari, which ignore the property.

**Files:** `solar-proposal-css.ts`, `app/(print)/quotations/[id]/print/page.tsx`, `print-toolbar.tsx`.

---

### (i) Page 1 (Offer) — Payment Details: "Cash or Cheque / ADV"

**Today.**

- The payment details panel prints `template.paymentDetailsIntro`. Its default is "Payment can be paid in Cash or Cheque:".
- A saved company template can override that text, so production may show something else.
- The first payment schedule line reads "Advance / Booking Amount Along With Documents", with no short "ADV" tag.

**Fix.**

1. Change the default intro to **"Payment Mode: Cash / Cheque / Online (NEFT · RTGS · UPI)"**. It stays editable in the Template editor under **Offer → Payment details intro**.
2. In the payment schedule, prefix the booking line with **ADV**, e.g. `ADV — ₹ 5,000 — Advance / Booking Amount Along With Documents`. Do this through a `short` field on each `paymentSteps` entry (`ADV`, `MAT`, `FINAL`), rendered as a small tag next to the `%` pill.
3. On deploy, if the saved company template still holds the old intro text, update it in the Template editor. The code default does not override saved templates.

**Files:** `solar-proposal-calculations.ts` (`paymentSteps`, `formatDefaultPaymentTerms`), `solar-proposal-document.tsx`, `quotation-template.ts`.

> **Confirm with client:** is "ADV" only a label for the advance line, or should the payment-mode line itself read "Cash / Cheque / ADV"? The plan uses the label approach by default.

---

### (ii) Page 3 — Warranty & Service: "Free Maintenance Service – 5 Years" cut off

**Cause.**

- The warranty grid uses `.sp-bom-grid.two`/`.four` with uppercase 10.5px labels.
- The Regular tier label "FREE MAINTENANCE SERVICE" wraps onto 2–3 lines, which pushes the value down.
- Page 3 is a fixed-height A4 box (`.sp-page { height: 297mm; overflow: hidden; }`). Warranty is the **last** section, so anything that overflows gets clipped. The first thing lost is the bottom-right value, "5 years".
- It gets worse in print, because the Google fonts (`@import` DM Sans / Outfit) may not have loaded before `window.print()` runs at 400 ms. The wider fallback font makes everything taller.

**Fix.**

1. Render warranty as a compact **label : value table**: one row per item, value right-aligned, `white-space: nowrap` on the value. It must never wrap below its label.
2. Move **Warranty & service** above **Balance of system**, so it is not the last block on the page.
3. Tighten page 3 spacing in print: hero image max height, and section padding 10px instead of 12–14px.
4. In `PrintToolbar`, wait for `document.fonts.ready` before auto-printing instead of a fixed 400 ms timeout.

**Files:** `solar-proposal-document.tsx`, `solar-proposal-css.ts`, `tier-quote-copy.ts` (casing: "5 Years"), `print-toolbar.tsx`.

---

### (iii) Page 6 — Solar Street Light shows Water Pump details (and vice versa)

**Cause.**

- The text comes from `OTHER_PRODUCTS[index]`, in the order Water Heater, Heat Pump, **Water Pump**, **Street Light**.
- The photo comes from the template's `previousWorkPhotos[index]`, which admin uploads into slots labelled only **"Our Other Products 1…4"** in the Template editor.
- On production, the street light flyer is in slot 3 and the water pump flyer is in slot 4, so the image and the text are swapped.
- The code defaults (`03-array.jpg`, `04-panels-closeup.jpg`) are generic stock photos, so the mismatch only shows with the real uploaded photos.

**Fix.**

1. Label the editor slots with the product name: "Slot 3 — Solar Water Pump", "Slot 4 — Solar Street Light". Also show the product title under each preview.
2. Match text by **caption** instead of index: if `photo.caption` equals an `OTHER_PRODUCTS[].title`, use that copy. Fall back to the index only when there is no match. `uploadPreviousWork` should set the caption to the product title of the slot.
3. One-time data fix on production: in the Template editor, swap the images in slots 3 and 4, or rely on caption matching once captions are set. No migration needed, because the template is stored as JSON in `quotation_company_settings.quotation_template`.

**Files:** `solar-bom-material-pages.tsx` (`PreviousWorkSection`), `other-products.ts`, `quotation-template-editor.tsx`, `lib/quotations/actions/template.ts`.

---

### (iv) Page 7 — Alignment of numbers and lines

**Cause** (Scope of work & savings page):

- **Scope number badges:** `.sp-scope-list li` is a 22px grid with a 22px-tall badge. The text line-height is about 15.6px at 11px, so the badge sits above the first text line and multi-line items look staggered.
- **Chart Y-axis:** `.sp-bar-y` is only **26px** wide at 8px font. Values like `1,23,456` overflow into the bars, so the labels and bars do not line up.
- **Chart X-axis:** the year labels are absolutely positioned at `bottom: -14px`. The "Year / Amount" row (`.sp-chart-axis`) is padded 28px on the left, which does not match the Y-axis width.
- **Documents table:** `td.sr` has no fixed width or centring, so the number column and row lines drift.
- **Money columns:** figures are proportional, not `tabular-nums`, so the digits do not line up vertically.

**Fix.**

1. Scope list: make the badge 18×18 and use `align-items: start` with `margin-top: 1px`, so it sits on the first text baseline. Keep the gap at 8px.
2. Chart:
   - Widen the Y-axis to 44px and show short labels (`1.2L`, `90k`) using an Indian short formatter.
   - Offset the bar area by the same 44px and align `.sp-chart-axis` padding to it.
   - Add light horizontal grid lines at the 0, 25, 50, 75 and 100% ticks.
3. Documents table: set `td.sr { width: 28px; text-align: center; }` and give rows a uniform 1px border.
4. Add `font-variant-numeric: tabular-nums` to `.amt`, the KPI values, the chart labels and `.sp-pay-list`.

**Files:** `solar-proposal-css.ts`, `solar-proposal-document.tsx`, `format.ts` (short INR helper).

> **Verify with client:** send a before/after screenshot of page 7, so "numbers and lines" is confirmed to mean the scope badges and the chart. If it means something else, add it here before implementing.

---

### (v) Bank Details — add Branch

**Today.**

- The Offer page already prints `Branch — {company.branch || "—"}`.
- The value comes from `quotation_company_settings.branch`, set in Template editor → Bank. `BRAND.bank.branch` is `""`.
- Production has no branch set, so the PDF shows **"Branch — —"**. That reads as a missing field.
- RK has **two banks** (ICICI and SBI) packed into single fields, so one "Branch" field is not enough.

**Fix.**

1. Show bank details **per bank**, in two small blocks:
   - **ICICI:** A/C, IFSC, Branch.
   - **SBI:** A/C (both numbers), IFSC, Branch.
2. Store them as a `banks: [{ bankName, accountNumber, ifscCode, branch }]` array inside the template JSON, edited in Template editor → Bank. Keep the legacy flat fields as the fallback for one-bank companies. No SQL needed.
3. Hide the Branch line when it is empty instead of printing "—". The appliance and BOM documents already do this.
4. Set the default branch values in `brand.ts` once the client confirms them.

**Files:** `quotation-template.ts`, `quotation-template-editor.tsx`, `quotation-print.ts`, `solar-proposal-document.tsx`, `brand.ts`, `lib/quotations/actions/template.ts`.

> **Need from client:** branch name and address for the ICICI (`ICIC0002009`) and SBI (`SBIN0000299`) accounts.

---

### (vi) Page 6 — Product Details bullet points not appearing in the PDF

**Cause.**

- `.sp-other-features li::before` draws each bullet as an empty `content: ""` 5×5 box, coloured only with `background: var(--sp-navy)`.
- Backgrounds are dropped in print (see G), so the bullets disappear.
- On screen, they show.

**Fix.**

1. Draw the bullet as a **text glyph** so it survives any print setting: `content: "•"` or `"■"`, with `color: var(--sp-navy)`, 10px, `top: 0`, no background.
2. The G fix (`print-color-adjust`) also helps, but the glyph means bullets do not depend on it.
3. Check the same pattern elsewhere and convert any `::before` background-only markers.

**Files:** `solar-proposal-css.ts`.

---

### (vii) Pages 2 and 7 — Rupee symbol (₹) wrong

**Cause.**

- `fmtMoney` outputs `"₹ 1,23,456"` (`solar-proposal-calculations.ts`, line 89). The KPI units print a bare `"₹"`.
- The fonts loaded from Google Fonts (DM Sans / Outfit, Latin subset) **do not include U+20B9 (₹)**. The browser substitutes another system font for just that character.
- In the PDF, that glyph comes out with a different weight and baseline, or as a box or wrong glyph on some printers or PDF viewers.

**Fix.**

1. Load a font that has ₹ only for that character:
   - Add `Noto Sans` to the Google Fonts import with `&text=₹`, or add an `@font-face` with `unicode-range: U+20B9`.
   - Put it second in the font stack: `"DM Sans", "Noto Sans", …`.
2. Wrap the symbol in `<span class="sp-inr">₹</span>` from one helper (`fmtInr()` in `format.ts`), with matching weight and a baseline nudge.
3. Replace all proposal uses: the payment schedule (page 2), the price table header ("Amount (₹)"), the KPI units (page 7), and the bar tooltips.
4. Fallback option if the client prefers it: print "Rs." instead. This is one switch in `fmtInr`.

**Files:** `solar-proposal-css.ts`, `solar-proposal-calculations.ts`, `format.ts`, `solar-proposal-document.tsx`.

---

### (viii) Page 2 — "GEB meter file submit" → "State Electricity Board"

**Today.** The payment step label is hard-coded in two places: "After Installation Before **GEB** Meter File Submit" (`solar-proposal-calculations.ts`, lines 116 and 343).

**Fix.**

1. Add a template field **`electricityBoardLabel`**, default **"State Electricity Board"**.
2. Build the label from it: `After Installation Before {electricityBoardLabel} Meter File Submit`.
3. Admin can later set "MSEDCL", "GEB / MGVCL" and so on per company or state in Template editor → Offer.
4. Use the same field for the other printed "GEB" references in the quotation PDF only, such as the GEB meter label default in the builder.
   - The Won gate "Electricity / GEB consumer number" stays as it is. It is CRM data entry, not the PDF.

**Files:** `quotation-template.ts`, `solar-proposal-calculations.ts`, `solar-proposal-document.tsx`, `quotation-template-editor.tsx`.

---

## 4. Decisions

| # | Decision |
|---|---|
| D1 | Print colours are forced with `print-color-adjust: exact` on the whole proposal. Bullets and markers must also not rely on backgrounds. |
| D2 | Product text on page 6 is matched to photos by caption or product title, not by slot index alone. |
| D3 | The electricity board wording comes from a template field, default "State Electricity Board". It is not a code change per state. |
| D4 | Bank details support multiple banks, each with its own Branch, in the template JSON. No new SQL migration. |
| D5 | ₹ is rendered through one helper with a font that contains the glyph. "Rs." is only a fallback. |
| D6 | PDF only. No change to payment milestones, gates or the Accounts ledger. |

---

## 5. Phases

### Phase A — Print fidelity (G, vi, vii, ii-fonts)

1. `print-color-adjust` on `.sp-root *`, a white print canvas, and removal of the dead `.sp-print-root` rule.
2. Glyph bullets on page 6.
3. A ₹-capable font plus the `fmtInr` helper, replacing every proposal ₹.
4. Auto-print waits for `document.fonts.ready`.

### Phase B — Content and wording (i, v, viii)

1. Payment mode intro default, and ADV / MAT / FINAL tags on the schedule.
2. `electricityBoardLabel` template field, used in the payment steps and default terms.
3. Multi-bank block with Branch in the editor and the PDF; hide empty lines.

### Phase C — Layout (ii, iii, iv)

1. Warranty label/value table; reorder page 3; tighten print spacing.
2. Match page 6 text by caption; name the editor slots after the products; production swap of slots 3 and 4.
3. Page 7: badge alignment, chart axis width and grid lines, docs table widths, tabular numbers.

---

## 6. Test plan (feature QA gate)

Run on `localhost` with `Apps/RK-Solar/.env.local`, the **anon key and user logins only**. Log in as Admin and as a sales user.

| # | Check | Expect |
|---|---|---|
| T1 | Print a Premium quote (more than 10 BOM rows) in Chrome with **Background graphics off** → Save as PDF | Navy headers, `%` pills, KPI band and accent bars keep their colours |
| T2 | Page 6 in that PDF | Each product shows bullet markers; Street Light text sits beside the street light image, Water Pump text beside the pump image |
| T3 | Page 2 and page 7 ₹ | Same weight and baseline as the digits; no box or odd glyph (check in Chrome PDF viewer and Adobe Reader) |
| T4 | Page 2 payment schedule | "…Before State Electricity Board Meter File Submit"; ADV tag on the advance line; payment mode line present |
| T5 | Change `electricityBoardLabel` to "MSEDCL" in the Template editor | The PDF shows MSEDCL; other companies are unaffected |
| T6 | Bank block | ICICI and SBI each show A/C, IFSC, Branch; empty Branch hidden (no "—") |
| T7 | Page 3, Regular tier | "Free Maintenance Service — 5 Years" fully visible; nothing clipped at the page bottom |
| T8 | Page 7 | Scope badges line up with the first text line; chart Y labels do not overlap the bars; docs numbers centred |
| T9 | Regular quote with 10 or fewer BOM rows (inline layout) | Same fixes apply; page count and no overflow |
| T10 | `npx tsc --noEmit` and lint on the touched files | Exit 0 |

Report each item as PASS / FAIL / SKIP (with reason) / BLOCKED (with reason) in the implementation reply.

---

## 7. Deploy and production steps

1. Run `sync-from-app.ps1` → `DeployScripts/deploy-rk-solar.ps1`. The next version is **v53**.
2. Run SQL **`054_quotation_bank_icici_only.sql`** on production Supabase. It removes SBI from the saved bank settings.
3. After deploy, in production Template editor:
   - Check the Payment details intro.
   - Enter the ICICI and SBI branches.
   - Confirm the Other Products slots 3 and 4 match their labels.
   - Save.

---

## 8. Open questions for the client

1. Does "ADV" mean a tag on the advance line (planned default), or should it appear in the payment-mode sentence?
2. What are the branch name and address for the ICICI and SBI accounts?
3. Page 7 "numbers and lines": is it the scope list numbers and the savings chart (assumed), or another element? Please share a screenshot if it is something else.
4. ₹ glyph or "Rs." (default is the ₹ glyph)?

---

## 9. Exit criteria

- All eight notes plus the background issue pass T1–T10 in a Chrome PDF, with the default print settings.
- The Template editor exposes the electricity board label, per-bank Branch, and named product slots.
- `Global Instructions/memory.md` and the knowledge card are updated after implementation.
