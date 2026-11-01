# Module 6 — Discom, Subsidy Timer & Customer Portal

**App:** `Apps/RK-Solar`  
**Depends on:** Module 3 (`quote_accepted` / Won)  
**Decision:** Staff liaison queue + lean customer portal (access code issued at Won). 15-day subsidy timer with outbox follow-ups. Accounts verifies subsidy and issues certificate stub.

---

## Flow (v1)

```
quote_accepted (Won)
  → portal_code issued (customer portal available)
installation_completed
  → (auto) liaison_in_progress
  → Customer/Liaison: Meter Installed → meter_installed + start 15-day timer (subsidy_pending)
  → Customer: Subsidy Received → subsidy_received_pending_accounts
      OR timer overdue → notification_outbox for Liaison
  → Accounts verifies bank → completed (+ certificate stub URL)
```

Final payment (Module 4) may continue in parallel after install.

---

## Schema

- Lead: meter/subsidy timestamps, timer due, portal_code, certificate_url
- `portal_documents` — invoices / self-declarations (URL metadata)
- Authorities for liaison + portal + subsidy verify

---

## Exit criteria

- [x] Portal code issued at Won (`quote_accepted`)
- [x] Auto liaison stage after install complete
- [x] Meter mark (portal + liaison override)
- [x] 15-day timer + overdue follow-up stubs
- [x] Subsidy received → Accounts verify → completed
- [x] `/liaison` queue + `/portal` customer access
