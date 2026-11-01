# RK Solar — Inventory port from Sumeru (2026-10)

**Status:** Built in app (code + migrations `073`–`087`). Apply on RK Solar Supabase when the project exists.  
**Source plans:** `Apps/SUMERU-SOLUTIONS/docs/plan-inventory-serials-2026.md` (+ item-masters, B2B, revisions).  
**Out of scope:** On-Floor / department ops, ticket `service_issue` Phase 8.

## Adapters (KT lineage)

| Concern | Adaptation |
|---------|------------|
| Customer gate | Won+ = `CUSTOMER_SALES_STAGES` (`quote_accepted` … `completed`) |
| Purchase-cost grantor | Admin (`is_company_admin_grantor`); Admin role_authorities exclude cost keys by default |
| `meter_name` | Always null (column absent on KT leads) |
| Challan brand | Text **RK Solar** wordmark; no logo asset |
| Migrations | Renumbered `073`–`087` (never reuse Sumeru `048`–`066` numbers) |

## Migrations

| File | From Sumeru |
|------|-------------|
| `073_inventory_core.sql` | `048` |
| `074_inventory_rpcs.sql` | `049` |
| `075_inventory_authorities.sql` | `050` (KT `has_authority`) |
| `076_inventory_reverse_fix.sql` | `051` |
| `077_inventory_customer_lookup.sql` | `052` |
| `078_inventory_delete_item.sql` | `053` |
| `079_inventory_movement_search.sql` | `057` |
| `080_inventory_item_masters.sql` | `059` |
| `081_inventory_parties.sql` | `060` |
| `082_inventory_item_name_per_subcategory.sql` | `061` |
| `083_inventory_delete_item_relaxed.sql` | `062` |
| `084_inventory_party_create_return_address.sql` | `063` |
| `085_inventory_item_master_revisions.sql` | `064` |
| `086_inventory_brand_label_group.sql` | `065` |
| `087_inventory_movement_search_customer.sql` | `066` |

## Product surface

Stock list · item master hierarchy · inward (scan + Excel + OCR) · dispatch/return (customer XOR party) · challan PDF/Share · reverse · Material tab · serial lookup · stock report · low-stock dashboard card · Inventory Person role.
