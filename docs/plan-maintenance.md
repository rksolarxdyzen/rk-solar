# Module 7 — Maintenance Tickets & Cleaning Reminders

**App:** `Apps/RK-Solar`  
**Depends on:** Module 6 (`completed` / portal code)  
**Decision:** Portal-raised tickets with 3-engineer first-accept race + supervisor force-assign. 15-day cleaning reminders via `notification_outbox` (+ portal CTA). No WhatsApp provider in v1.

---

## Flow (v1)

```
Project completed (or install complete with portal)
  → cleaning_next_due_at = now + 15d

Every 15 days (manual enqueue or future cron)
  → notification_outbox: cleaning_reminder + referral nudge (audience: customer)

Customer portal
  → Raise service ticket
  → Fan-out offers to up to 3 active service_engineers
  → First accept wins (assigned_to set); others expired
  → If all reject / none accept → supervisor force-assigns
  → Engineer: accepted → in_progress → close with ≥1 proof photo URL
```

---

## Schema

- Lead: `cleaning_next_due_at`, `cleaning_last_sent_at`
- `service_tickets` — status raised | accepted | in_progress | closed
- `service_ticket_offers` — engineer fan-out (offered | accepted | rejected | expired)
- `service_ticket_photos` — URL proofs
- Roles: `service_engineer`, `service_supervisor`
- Authorities: view / accept / resolve / force_assign / enqueue_cleaning

---

## Exit criteria

- [x] Portal raise ticket + list own tickets
- [x] 3-engineer offer + first-accept wins
- [x] Supervisor force-assign when unassigned
- [x] Resolve with proof photo URL(s)
- [x] `/maintenance` staff queue
- [x] 15-day cleaning enqueue stub + portal CTA
