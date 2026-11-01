# KT Renewable Energy — Accounts ledger, Documentation tabs & feasibility revise plan

**App:** `Apps/RK-Solar` (branded RK Solar)  
**Client package:** `Deliverables/rk-solar`  
**Created:** 2026-09-23  
**Status:** Implemented 2026-09-23 (Phases A–C)  
**Source:** Client revision list (Accounts payment totals + assigned salesperson; Documentation like Recare; feasibility uploaded by Documentation)  
**Related prior docs:** `docs/workflow.md`, `docs/plan-payments.md`, `docs/reviseplan-accounts-won-dealers.md` (A–E done), Recare `docs/reviseplan-ops-quotes-2026.md` Phases B–C  
**Playbooks:** `Solar-Ops-Knowledge/playbooks/payments-milestones.md`, `liaison-meter-subsidy.md`, `team-access-rbac.md`

Do **not** invent `sales_stage` values. Token → Pre-dispatch → Final and post-install Discom / meter / subsidy stay as they are today.

---

## 0. Goal

Give **Accounts** a company-wide money ledger: every Won customer, who owns the file, how much is **received** (verified) vs **pending** on Token / Pre-dispatch / Final / company subsidy.

Give **Documentation** the Recare layout: one **Documentation** workspace with **Pre-install** (feasibility PDF) and **Post-install** (Discom / meter / subsidy). The Documentation team uploads feasibility after **Won**. Accounts money verify stays independent of that PDF. Installation still waits on **verified** pre-dispatch (existing crew gate).

This file is the working checklist. Implement in phase order unless a production blocker overrides.

---

## 1. How to read the client wording

| Client wording | Meaning in this app |
|----------------|---------------------|
| **Account / Accounts** | Role `accounts` (plus Admin). Surfaces: `/accounts/receivables`, `/payments`, Accounts dashboard block. |
| **Total payment / which customer has paid how much** | Per Won+ customer: **received** = sum of `payments` rows with `verification_status = verified`, plus company subsidy when `subsidy_verified_at` is set. Not “recorded but still pending verify”. |
| **Whose customer (Assigned sales person)** | Display name of `assigned_telecaller_id` (fallback `assigned_to`). Same person Admin assigns on New Lead / Reassign. |
| **How much received** | Verified rupees per milestone (Token, Pre-dispatch, Final) and company-subsidy received. |
| **How much of which part is pending** | Planned Won amount minus verified received, per Token / Pre-dispatch / Final. Company subsidy pending = `company_bears_subsidy` and no `subsidy_verified_at` (existing `companySubsidyPendingAmount`). |
| **Documentation like Recare** | `/liaison` already labelled **Documentation**. Add Recare tabs: **Pre-install** (feasibility PDF queue) and **Post-install** (today’s Discom queue). Redirect `/feasibility` so there are not two queues. |
| **Feasibility uploaded by documentation team** | Role `liaison` (nav: Documentation) uploads the grid PDF. Open after **Won**, not only `token_pending_verification`. Role `feasibility` remains an alias that can still upload. |
| **Subsidy** | Company receivable from the Won “company bears subsidy” checkbox — **not** a new liaison stage. Liaison `subsidy_pending` / customer portal marks stay Documentation post-install. |

---

## 2. Decisions (lock before coding)

| # | Topic | Decision | Status |
|---|--------|----------|--------|
| **D1** | Ledger population | Show **all Won+ customers** (`CUSTOMER_SALES_STAGES`), including fully paid. Today the board **drops** `totalPending <= 0`. | Done |
| **D2** | Received vs pending | **Received** = verified payment sums + company subsidy once Accounts verified. **Pending** = Won plan − verified (existing `milestoneRemaining`) + company subsidy pending. Recorded-but-unverified sits in **Pending verify** (link to `/payments`), not in Received. | Done |
| **D3** | Assigned salesperson | Column + search + filter on tele-caller / `assigned_to` name. Surveyor is optional secondary text, not the owner. | Done |
| **D4** | Accounts vs assigned-only (052) | Pipeline/Customers stay assigned-only for staff. **Accounts ledger stays company-wide** via `verify_payment` / `view_payment_queues` (RLS `047`/`049` already allows those). Do **not** run `canSeeAllLeads` / `ownLeadOrFilter` on receivables. | Done |
| **D5** | Documentation chrome | Port Recare: tabs **Pre-install** \| **Post-install** on `/liaison`. Query `?tab=pre-install`. `/feasibility` **redirects** to that tab. Remove **Feasibility** from Others nav (keep `/documentation` alias). | Done |
| **D6** | Who uploads feasibility | `liaison` + `admin` + `upload_feasibility_report` + `manage_liaison`. Grant `upload_feasibility_report` on role `liaison` (migration). Keep `feasibility` role as alias. | Done |
| **D7** | When PDF may upload | Stage **Won or later** (`isWonOrLaterStage`). Reject pre-Won. Re-upload replaces the file and is audited. | Done |
| **D8** | Approve / reject | Recare happy path: PDF upload **clears** `feasibility_approved` (no second approve). Hide approve/reject on Documentation queue. Keep `approve_feasibility_report` for Admin override only. | Done |
| **D9** | Money vs docs (no new stages) | **Docs PDF** does not wait for token verify. **Token verify** does not wait for PDF. **Record pre-dispatch** once a non-rejected **token row exists** (Recare / RK money). **Assign crew** still requires `pre_dispatch_verified`. Combined stage `token_verified_and_feasibility_ok` still flips when **both** token verified and PDF present — it is not a new stage. | Done |
| **D10** | Out of scope | New payment milestones, Jay-style OC checklists, dealer commission changes, crew install, quote PDF, deploy unless asked. | — |

---

## 3. Target lifecycle (after this revise)

```
Pipeline (sales)
  new_lead → … → quoted → Move to Won
Customers / ops
  quote_accepted (Won)
       │
       ├─► Documentation PRE-INSTALL: upload feasibility PDF (no Accounts wait, no approve)
       ├─► Sales: record Token
       │      Accounts: verify Token
       │      Sales: record Pre-dispatch (token row exists)
       │      Accounts: verify Pre-dispatch ──► pre_dispatch_verified
       │
       └─► Installation: Supervisor assigns crew ONLY if pre_dispatch_verified
              → proofs → installation_completed
              → Documentation POST-INSTALL (Discom / meter / subsidy)  [unchanged]
              → completed
```

**Hard gates**

| Action | Allowed when | Blocked when |
|--------|----------------|--------------|
| Accounts ledger row | Won+ customer in company | Pre-Won pipeline leads |
| Upload feasibility PDF | Stage ≥ Won; Documentation / Admin | Lost; not Won; not PDF |
| Record token | Won / token pending | Token already non-rejected |
| Record pre-dispatch | Token row exists (pending or verified) | No token row |
| Assign crew | `pre_dispatch_verified` | Unverified pre-dispatch |
| Post-install Documentation | `installation_completed`+ | Same as today |

---

## 4. Audit — KT today vs request

### 4.1 Accounts ledger

| Item | Today | Gap |
|------|--------|-----|
| Route | `/accounts/receivables` under **Others → Receivables** | Easy to miss; copy is “pending only” |
| Query | Won+ leads, then **skip** if `totalPending <= 0` | Fully paid customers vanish — Accounts cannot see “who paid how much” |
| Remaining | Token / Pre-dispatch / Final / company subsidy **pending** | No **received** columns or totals |
| Salesperson | `telecallerName` loaded in `listAccountsReceivables` | **Not rendered**; no search/filter by salesperson |
| Bucket filter | All pending / Pre / Final / Subsidy | No Token bucket; no “Paid in full”; no salesperson |
| Dashboard | Pending by Pre / Final / Subsidy + **collected MTD** | MTD is month-scoped, not lifetime per customer |
| `/payments` | Verify queue only | Keep; do not replace the ledger |
| Visibility after `052` | Role `accounts` lost `view_all_leads` | Ledger must keep using payment authorities, not assigned-only lists |

### 4.2 Documentation / feasibility

| Item | Today | Gap |
|------|--------|-----|
| Nav | Top **Documentation** = `/liaison` (post-install only) | No Pre-install tab |
| Feasibility | **Others → Feasibility** (`/feasibility`) | Separate queue; subtitle still “after token + approve” |
| Upload window | `submitFeasibilityReport` requires `token_pending_verification` | Docs cannot start at Won |
| Who may upload | `admin`, `feasibility`, `sales_manager`, `upload_feasibility_report` | **`liaison` has no upload grant** |
| Approve | Separate approve/reject; `feasibility_approved` stays false until approve | Recare: PDF clears the gate |
| Dual money+docs gate | `maybeAdvanceTokenGates` needs token verified **and** feasibility approved before `token_verified_and_feasibility_ok`; pre-dispatch record waits on that stage | Recare already split money from PDF — port that for “docs like Recare” |
| Customer Feasibility panel | Shown mainly around token-pending | Must show from Won for Documentation |

### 4.3 Authorities (seed vs intent)

| Role | Today | Change |
|------|--------|--------|
| `admin` | All keys | Unchanged |
| `accounts` | Verify + queues; **no** `view_all_leads` after `052` | Keep money authorities; ledger uses those, not assigned-only |
| `liaison` | Post-install only | **Add** `upload_feasibility_report`; open Pre-install tab |
| `feasibility` | Upload + approve | Upload (and optional Admin approve); Team label may stay “Feasibility / Documentation” |
| `sales_manager` | Can upload today | Keep upload; do not require them for the happy path |
| Sales / tele-caller | No upload | Unchanged |

---

## 5. What to reuse (do not invent)

| Need | Already exists | Port how |
|------|----------------|----------|
| Received / remaining math | `src/lib/accounts/receivables-math.ts` (`sumVerifiedByMilestone`, `milestoneRemaining`, `companySubsidyPendingAmount`) | Add received + planned fields on the row; stop dropping paid-in-full |
| Receivables board UI | `src/components/accounts/receivables-board.tsx` | Extend cards/filters; do not rebuild `/payments` |
| Assigned salesperson | `assigned_telecaller_id` + profile join already in `listAccountsReceivables` | Render + filter |
| Pre-install + Post-install tabs | Recare `liaison-workspace.tsx`, `pre-install-feasibility-queue.tsx`, `liaison/page.tsx` | Copy behaviour; RK branding only |
| Won+ PDF, no approve | Recare `actions/feasibility.ts` (`isWonOrLaterStage`, `assertPdfProof`, status `approved` on upload) | Replace KT token-only + approve path |
| `/feasibility` redirect | Recare `app/(dashboard)/feasibility/page.tsx` | Same redirect |
| Pre-dispatch after token row | Recare `nextRecordableMilestone` + `recordPayment` | Align KT `src/lib/domain/payments.ts` |
| Accounts company-wide SELECT | KT `047` / `049` `leads_select` (`verify_payment`, `view_payment_queues`, `record_payment`) | Keep; do not tighten these for Accounts |

---

## 6. Phases

| Phase | Scope | Why this order | Status |
|-------|--------|----------------|--------|
| **A — Accounts collections ledger** | Received + pending + salesperson on `/accounts/receivables` (+ dashboard link copy) | Independent; unblocks Accounts immediately | **Done 2026-09-23** |
| **B — Documentation Pre / Post tabs** | Recare chrome, redirect `/feasibility`, nav cleanup | Unblocks docs UX; can land empty Pre-install until C | **Done 2026-09-23** |
| **C — Feasibility by Documentation** | Liaison grant, Won+ PDF, no approve, money/docs split | Depends on B for the queue | **Done 2026-09-23** |

Optional after C: sync `Deliverables/rk-solar` and deploy only if asked. Apply new SQL on prod (see §9).

---

## 7. Phase detail

### Phase A — Accounts collections ledger

**Server (`accounts-receivables.ts`)**

1. Keep Won+ `CUSTOMER_SALES_STAGES` company query. **Do not** apply `ownLeadOrFilter`.
2. For every customer (including `totalPending === 0`):
   - `tokenReceived` / `preDispatchReceived` / `finalReceived` from `sumVerifiedByMilestone`
   - matching `*Remaining` from existing helpers
   - `subsidyReceived` = company subsidy amount when `subsidy_verified_at` set, else `0`
   - `subsidyPending` unchanged
   - `totalReceived` = token + pre + final + subsidy received
   - `totalPending` = token + pre + final + subsidy pending
   - `salespersonName` = tele-caller name, else `assigned_to` name
   - `salespersonId` for filter
3. Sort default: pending desc, then name.

**UI (`receivables-board.tsx`)**

1. Summary chips: customers, **total received**, **total pending**, plus Token / Pre-dispatch / Final / Subsidy pending.
2. Each row: customer, phone, city, portal, **Assigned: {salesperson}**, then a 4-column grid:

   | Part | Received | Pending |
   |------|----------|---------|
   | Token | verified ₹ | remaining ₹ |
   | Pre-dispatch | verified ₹ | remaining ₹ |
   | Final | verified ₹ | remaining ₹ |
   | Subsidy | verified company subsidy | pending company subsidy |

3. Filters: search (name, phone, portal, consumer, **salesperson**); salesperson dropdown; bucket `all` \| `pending` \| `paid` \| `token` \| `pre` \| `final` \| `subsidy`.
4. Keep row click → customer modal (Payments tab). Responsive: stack grid on phone (`playbooks/pwa-install.md`).

**Dashboard**

- Accounts finance panel: add lifetime **Token pending** count/amount (today only Pre / Final / Subsidy). Link still `/accounts/receivables`.
- Optional: promote **Receivables** next to **Payments** in Others (or top-level for `accounts` / Admin). Do not hide `/payments`.

**Errors**

| Case | Handling |
|------|----------|
| Missing `045` columns | Existing “run 045” error |
| RLS empty for Accounts | Confirm `047`/`049` applied; do not “fix” by granting `view_all_leads` again |
| No Won plan amounts | Show received from payments; pending `0` with “No Won plan” hint |

**Files**

- `src/actions/accounts-receivables.ts`
- `src/components/accounts/receivables-board.tsx`
- `src/app/(dashboard)/accounts/receivables/page.tsx` (subtitle)
- `src/components/dashboard/accounts-finance-panel.tsx`
- `src/lib/nav-config.ts` (optional promote)

---

### Phase B — Documentation like Recare (chrome)

**Nav / routes**

1. `/liaison` page: Recare tab wiring + `listPreInstallFeasibilityQueue` (may be empty until C).
2. Workspace tabs: **Pre-install** (count of files missing PDF) and **Post-install** (today’s Discom list). Default post-install unless `?tab=pre-install`.
3. `src/app/(dashboard)/feasibility/page.tsx` → `redirect("/liaison?tab=pre-install")`.
4. Drop **Feasibility** from Others. Keep Documentation match `["/documentation", "/feasibility"]`.
5. `workflow.ts` `feasibility` back-fallback → `/liaison?tab=pre-install` (Recare).

**Do not in B**

- Change upload stage or approve rules (Phase C).
- Change meter / subsidy actions.

**Files to port (Recare → KT, RK copy only)**

- `src/components/liaison/liaison-workspace.tsx`
- `src/components/liaison/pre-install-feasibility-queue.tsx` (create)
- `src/app/(dashboard)/liaison/page.tsx`
- `src/lib/nav-config.ts`, `src/lib/nav-access.ts`, `src/lib/domain/workflow.ts`

---

### Phase C — Feasibility by Documentation team

**Authorities / SQL (`053`)**

```
INSERT role_authorities: liaison → upload_feasibility_report
```

Update `DEFAULT_ROLE_AUTHORITIES.liaison` the same way. Do not strip `feasibility` upload.

**Upload**

- `canUpload`: add `liaison` and `manage_liaison` (Recare).
- Allow when `isWonOrLaterStage`; error “Feasibility PDF can be uploaded after the file is Won”.
- PDF only (Recare `assertPdfProof`); size same as other proofs.
- On success: set report `status = approved`, `feasibility_approved = true`. No approve button on the queue.
- Re-upload replaces file; audit `feasibility_replaced`.
- Customer **Feasibility** panel: show from Won for Documentation / Admin.

**Gates (`payments.ts` / `payments.ts` domain)**

- Stop blocking **record pre-dispatch** on `token_verified_and_feasibility_ok` only.
- Allow pre-dispatch when a **non-rejected token** row exists (pending or verified), even if PDF missing.
- Keep `maybeAdvanceTokenGates` for the **label** `token_verified_and_feasibility_ok` when both flags are true.
- **Assign crew** unchanged: `pre_dispatch_verified`.

**Errors**

| Case | Handling |
|------|----------|
| Not PDF | “Upload a PDF feasibility report” |
| Not Won | Hide uploader; server 400 |
| Storage / RLS | “Could not save file — retry” |
| Liaison missing grant | Apply `053` on prod |

**Docs to update when C ships**

- `docs/workflow.md` §5.3: `liaison` gets `upload_feasibility_report`; Feasibility role “after token” → “after Won, Documentation uploads PDF”.
- `docs/plan-payments.md`: parallel docs at Won; pre-dispatch after token row; crew still money-gated.
- `Solar-Ops-Knowledge/apps/rk-solar.md` ops notes (`053`).

---

## 8. Recommended product flow (Accounts + docs)

```
Won
  ├─ Accounts ledger: customer appears (received ₹0, pending = Won plan)
  ├─ Documentation Pre-install: upload PDF ──► feasibility_approved
  └─ Sales records Token ──► Accounts verifies
        └─ Sales records Pre-dispatch ──► Accounts verifies
              └─ Supervisor assigns crew
                    └─ Documentation Post-install (unchanged)
```

Accounts always sees **received / pending / assigned salesperson** on the ledger, including after the file is fully paid.

---

## 9. Migrations & prod apply

| File | Purpose |
|------|---------|
| Existing `045` | Won amounts + company subsidy (already required for receivables) |
| Existing `047` / `049` | Accounts can SELECT customer leads for money embeds |
| Existing `052` | Assigned-only Pipeline/Customers — **do not revert** |
| **New `053_docs_feasibility_liaison.sql`** | Grant `upload_feasibility_report` to `liaison` |

Phase A is **app-only** if `045`+`047` are already on prod. Phase C needs `053`.

---

## 10. Test plan (after implementation)

### Phase A

- [ ] Accounts: customer with verified token + pending pre-dispatch shows both received and pending; salesperson name visible.
- [ ] Fully paid customer still listed; bucket **Paid in full**.
- [ ] Filter by salesperson hides other owners’ files on the ledger (Accounts still sees all by default).
- [ ] Tele-caller still cannot open another owner’s customer on `/customers` (`052`).
- [ ] Phone + desktop layout of the 4-part grid.

### Phase B

- [ ] Documentation shows Pre-install and Post-install tabs with counts.
- [ ] `/feasibility` lands on Pre-install; Others no longer lists Feasibility.
- [ ] Post-install meter / subsidy actions unchanged.

### Phase C

- [ ] Liaison can upload PDF on a Won file with no token yet.
- [ ] Sales executive cannot upload (unless granted).
- [ ] PDF clears docs gate; no approve click required.
- [ ] Sales can record pre-dispatch after token row exists even if PDF missing.
- [ ] Crew assign still blocked until pre-dispatch **verified**.
- [ ] Re-upload replaces PDF; audit event present.

---

## 11. Exit criteria

- [ ] Accounts can answer: this customer paid ₹X (by part), still owes ₹Y (by part), file owned by salesperson Z.
- [ ] Documentation matches Recare: Pre-install PDF + Post-install Discom on one page.
- [ ] Feasibility PDF is Documentation’s job from Won; Accounts does not upload or approve it on the happy path.
- [ ] No new `sales_stage` values; crew still waits on verified pre-dispatch.
- [ ] `workflow.md` + knowledge card updated when C is done.

---

## Changelog

| Date | Note |
|------|------|
| 2026-09-23 | Plan authored, then Phases A–C implemented (`053`). |
