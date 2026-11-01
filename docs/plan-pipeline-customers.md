# Plan — Pipeline (Leads) vs Customers (Post-Won)

**App:** `Apps/RK-Solar`  
**Goal:** Match Sumeru’s mental model — Pipeline = sales leads only; after Won, work continues under **Customers**.  
**Status:** Implemented — Option A confirmed.

---

## 1. Problem today

KT’s kanban uses **all** active stages (`PIPELINE_SALES_STAGES` ≈ 20 columns): lead → quote → payments → install → Discom → `completed`.

That makes Pipeline a full-lifecycle board, not a leads board. Sumeru keeps Pipeline short and moves fulfillment off the board into **Customers**.

| | Sumeru | KT today |
|--|--------|----------|
| Pipeline | New → Contacted → Survey → Survey done → **Won** | New → … → **Completed** (everything) |
| Customers page | `/customers` — Won + Project Completed | **None** |
| Same table | Yes (`leads` row) | Same approach recommended |

---

## 2. Recommended model (adapt Sumeru, don’t rename KT stages)

**Do not** introduce Sumeru’s `closed_won` / `project_completed` enums unless we must — KT already has a clear “deal closed” signal: **`quote_accepted`**.

### Proposed split

```
PIPELINE (Leads board)
  new_lead → contacted → visit_scheduled → survey_in_progress
  → survey_completed → quoted → quote_accepted   ← last column = “Won”

CUSTOMERS (new /customers)
  quote_accepted + all fulfillment stages through completed
  (token → feasibility → pre-dispatch → install → final → liaison → subsidy → completed)
```

| Surface | Stages |
|---------|--------|
| **Pipeline columns** | Through `quote_accepted` only (exclude `lost` + all post-accept stages) |
| **Customers list / board** | `quote_accepted` … `completed` |
| **Lost** | Pipeline Lost filter only (unchanged) |

**Won moment:** Accept quotation → stage `quote_accepted` → lead appears on **Customers** (and remains visible in Pipeline’s Won column until they leave that column — same as Sumeru’s Won-on-board pattern).

**Optional later:** When first payment is recorded, they can leave the Won column and only show under Customers (Sumeru does this when moving to `project_completed`). For v1 we can keep `quote_accepted` on both Pipeline Won + Customers list for continuity.

---

## 3. Confirmed decision

**A — Confirmed:** Won = `quote_accepted`, displayed as **Won**  
- No new enum value  
- Aligns with Module 3 (accept quote)  
- Customers = everything from accept → completed  

**B:** Add explicit `closed_won` after `quote_accepted`  
- Closer to Sumeru naming  
- Extra stage + migration; more drag for little gain  

**C:** Pipeline stops at `quoted`; Customers start at `quote_accepted`  
- Won column empty / not on pipeline  
- Less like Sumeru (Sumeru keeps Won on pipeline)  

The database value remains `quote_accepted`; staff-facing badges, board columns, and labels say **Won**.

---

## 4. UI / UX (v1 slice)

1. **Shrink Pipeline board** — `PIPELINE_SALES_STAGES` = stages up through `quote_accepted`.
   - Default assembled view groups `visit_scheduled` + `survey_in_progress`.
   - It also groups `survey_completed` + `quoted`.
   - **Disassemble stages** restores one column per underlying stage.
2. **Add `/customers`** — list (Sumeru-style) of leads in customer stages; open same lead modal.
3. **Optional Customers kanban** (v1b) — columns for fulfillment stages (payments / install / liaison / completed), or start with **list + stage badge** like Sumeru and add a board later if needed.
4. **Nav** — Customers link in app shell + `nav-access`.
5. **Dashboard stats** — split “Active leads” vs “Customers / in delivery”.
6. **Stage stepper in lead modal** — show **lead stepper** vs **customer/fulfillment stepper** based on stage (avoid a 20-step bar for tele-callers).
7. **Queues** — Payments / Install / Liaison / Maintenance pages stay as today (ops workspaces); Customers is the CRM “account” list.

No schema change required for **A** (filter + UI only). Migration only if choosing **B**.

---

## 5. Code touchpoints (when building)

| Area | Files |
|------|--------|
| Stage sets | `src/lib/domain/workflow.ts` — `PIPELINE_SALES_STAGES`, add `CUSTOMER_SALES_STAGES`, `isCustomerSalesStage()` |
| List query | `src/actions/leads.ts` — `getCustomers()` (filter by customer stages) |
| Pipeline | `pipeline-board.tsx`, `(dashboard)/pipeline/page.tsx` |
| Customers page | `(dashboard)/customers/page.tsx` + list component (port pattern from Sumeru) |
| Nav | `app-shell.tsx`, `nav-access.ts` |
| Dashboard | `(dashboard)/page.tsx` stage counts |
| Stepper | `stage-stepper.tsx` — pipeline vs customer stage list |
| Docs | `docs/workflow.md`, `README`, `memory.md` |

**Out of scope for this slice:** renaming stages, new DB table `customers`, changing portal, Module 7 tickets.

---

## 6. Exit criteria

- [x] Pipeline shows only lead → Won (`quote_accepted`) columns  
- [x] `/customers` lists post-accept (customer) leads  
- [x] Accept quote still lands in Won and appears under Customers  
- [x] Ops queues (payments/install/liaison) unchanged  
- [x] Dashboard and stage stepper split lead vs customer lifecycle  
- [x] Docs updated  

---

## 7. Suggested build order

1. Domain constants + helpers  
2. `getCustomers` + `/customers` list + nav  
3. Narrow pipeline columns + dashboard counts  
4. Dual stepper in lead detail  
5. Docs / memory  

---

**Result:** Option A implemented with a Sumeru-style customer list. A customer fulfillment board can be added later if needed.
