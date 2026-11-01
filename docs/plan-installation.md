# Module 5 — Installation & Barcode Capture

**App:** `Apps/RK-Solar`  
**Depends on:** Module 4 (`pre_dispatch_verified`)  
**Decision:** Single crew (not Sumeru dual-team). Site photos + per-panel barcode/DCR URLs. Completion writes notify stubs for Accounts / Sales / Liaison.

---

## Flow (v1)

```
pre_dispatch_verified          ← Supervisor queue (crew does not see)
  → Installation Supervisor assigns crew → installation_assigned
  → First proof upload → installation_in_progress
  → Site photo + geo, panel photos, barcodes or typed serials, inverter serial, completion video
  → complete_installation → installation_completed
  → notification_outbox (accounts, sales, liaison)
```

Final payment (Module 4) unlocks after `installation_completed`.

---

## Schema

- Lead: `assigned_crew_id`, `expected_panel_count`, `inverter_serial_number`, install geo, install timestamps
- `installation_photos` — `site` | `panel_image` | `panel_barcode` | `inverter_serial` | `completion_video` | `other`
- `installation_panel_serials` — typed/OCR serials
- `notification_outbox` — stub rows on complete

---

## Exit criteria

- [x] Assign crew from pre_dispatch_verified
- [x] Upload site + barcode proofs (URL-based v1)
- [x] Complete only when gates pass
- [x] `/installation` queue + lead Sales panel
- [x] Notify stubs on complete
