# Module 4 — Milestone Payments & Feasibility

**App:** `Apps/RK-Solar`  
**Depends on:** Module 3 (`quote_accepted`)  
**Decision:** Lean rewrite of Sumeru payment history shell — **not** free-form `pending/received`. KT 3-stage + Accounts verify + parallel feasibility after token.

---

## 1. Flow (v1)

```
quote_accepted
  → Documentation PRE-INSTALL: upload feasibility PDF (clears docs gate; no approve)
  → record Token → token_pending_verification
       └─ Accounts verifies (txn / date / bank)
  → BOTH token verified + PDF → token_verified_and_feasibility_ok (label only)
  → record Pre-Dispatch once a Token row exists (even if PDF still missing)
  → Accounts verifies → pre_dispatch_verified
  → record Final → final_pending_verification
  → Accounts verifies → final_verified
```

Installation crew routing (Module 5) starts from `pre_dispatch_verified`.

---

## 2. Schema

- `payments` — one active row per milestone (`token` | `pre_dispatch` | `final`)
- `feasibility_reports` — upload metadata + approve
- Lead flags: `token_verified`, `feasibility_approved`
- Stages extended on `sales_stage` enum

---

## 3. Authorities

- `record_payment`
- `verify_payment` (Accounts)
- `upload_feasibility_report`
- `approve_feasibility_report`

---

## 4. Exit criteria

- [x] Record token / pre-dispatch / final against accepted-quote lead
- [x] Accounts verify or reject with bank reference
- [x] Feasibility PDF by Documentation after Won; no approve on happy path
- [x] Queues: `/payments`, Documentation Pre-install (`/liaison?tab=pre-install`)
- [x] Lead Sales tab payment + feasibility panels
