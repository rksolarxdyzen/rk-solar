# RK Bhabhor

CRM & Field Operations platform for RK Bhabhor (₹50k tier). Folder path remains `Apps/RK-Solar`.

## Status

| Phase / Module | Status |
|----------------|--------|
| **0–4** LMS + survey + ingest | Done |
| **Module 3–7** Quotes → maintenance | Done |
| **Polish** | Catalog admin, rate-card solar builder (Sumeru-style), proofs, Team & Access |

## Polish

- Pipeline is leads-only through **Won** (`quote_accepted`); `/customers` holds Won and post-sale stages
- `/catalog` — items, brands, categories, and **rate card** (module type → OEM → kW packages)
- Solar quotes use Sumeru-style builder (package cascade, inverter, meter phase, subsidy); premium and general use residential BOM line items from the materials lists
- **Quotes → Template** (`/quotations/template`) — edit proposal cover copy, bank/QR, meter defaults, and terms (admin / sales manager / catalog or manage_quotations)
- Dashboard **Key metrics** — active leads, files won MoM, revenue (accepted quote on Won date), payments, installs, outstanding tasks, 30d pipeline value, services, pending subsidy
- `proofs` storage bucket + upload control on install/tickets (gallery images for the template also use this bucket)
- `GET/POST /api/cron/reminders` with `CRON_SECRET` — subsidy + cleaning enqueue + outbox flush
- `GET/POST /api/cron/daily-report` — evening IST digest (ops + employee performance); `DAILY_REPORT_TO` + optional Resend
- Optional `WHATSAPP_WEBHOOK_URL` for customer outbox events
- `/team` — same-company user lifecycle, password resets, custom roles, and authority grants

## Docs

| File | Purpose |
|------|---------|
| `docs/prd.md` | Product requirements |
| `docs/plan.md` | Build phases |
| `docs/revise.md` | Revision phases (dashboard, reports, nav, Won gate) |
| `docs/plan-*.md` | Modules 3–7 |
| `docs/workflow.md` | Lifecycle + RBAC |
| `supabase/mockdata.sql` | Demo leads at every stage (SQL Editor) |
| `supabase/seed_premium_bom.sql` | Premium residential BOM catalog (19 items) + images |
| `supabase/seed_regular_bom.sql` | Regular residential BOM catalog for general quotations (13 items) |
| `supabase/seed_catalog_extras.sql` | Allied products: water heater, heat pump, pump, street light |

## Setup

1. Copy `.env.example` → `.env.local` (set `CRON_SECRET`; for reports set `DAILY_REPORT_TO` and optionally `RESEND_API_KEY`).
2. Apply migrations `001` → `033_quotation_item_image_snapshots.sql` in filename order.
3. Sign in once so a staff `profiles` row exists.
4. (Optional) Paste `supabase/mockdata.sql` into Supabase → SQL Editor → Run — fills every pipeline, customer, and ops stage. Safe to re-run.
5. (Optional) Paste `supabase/seed_premium_bom.sql` into SQL Editor → Run — adds 19 premium BOM catalog items with images from `public/brand/bom-premium/`. Safe to re-run.
6. (Optional) Paste `supabase/seed_regular_bom.sql` — adds 13 regular BOM items for general quotations. Safe to re-run.
7. (Optional) Paste `supabase/seed_catalog_extras.sql` — adds Solar Water Heater, Heat Pump, Solar Pump, Solar Street Light with images. Safe to re-run.
8. `npm run dev`.

`/team` requires `manage_users`, `manage_roles`, `full_access`, or the Admin role.
User passwords are sent only to Supabase Auth Admin APIs; profile rows store role
and account status, never passwords. Deactivation bans the Auth user and marks the
profile inactive.
Team profile pictures are optional and stored in the public `avatars` bucket; only
Team & Access managers can add, replace, or remove them.

## Cron example

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/daily-report"
# Re-send today's report: add ?force=1
```

Vercel cron (`vercel.json`): reminders `03:30 UTC`, daily-report `13:30 UTC` (≈19:00 IST).
