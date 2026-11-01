# Revise plan — Quotation recycle bin / restore (Sep 2026)

**App:** `Apps/RK-Solar` (RK Solar), Quotations module
**Status:** Implemented 2026-09-30 using the proposed defaults for §6 (no client answers yet): separate `restore_quotations` authority, keep forever, admin-only "Delete forever", optional reason, bin under Quotes only. Deployed as **v56** (`d73dfd2`). Run `057` on production Supabase.

### Implementation notes (deltas from the plan)

- `quotations_update` also gets `deleted_at IS NULL`, so bin rows cannot be edited through REST.
- `quotations_delete` now requires `deleted_at IS NOT NULL` **and** `full_access`. Normal Delete always goes through `soft_delete_quotation`.
- Portal (§3.3): no change needed. The admin-client fallback only reads `status = 'accepted'`, and accepted quotes can never be binned. Adding a `deleted_at` filter would have broken the portal before `057` runs.
- The "in Recycle bin" hint on `/quotations/[id]` for bin viewers is not built. Deleted quotes show the normal not-found.
- `deleteQuotation` / `listDeletedQuotations` return a "Run 057" message if the functions are missing.
- Files: `057_quotation_recycle_bin.sql`, `src/lib/quotations/actions/quotation.ts` (`deleteQuotation(id, reason?)`, `listDeletedQuotations`, `countDeletedQuotations`, `restoreQuotation`, `purgeQuotation`), `src/lib/quotations/context.ts` (`canViewRecycleBin`, `canRestoreQuotations`, `canPurgeQuotations`), `src/lib/domain/authorities.ts`, `src/components/quotations/quotation-recycle-bin.tsx`, `src/components/quotations/delete-quotation-button.tsx`, `src/app/(dashboard)/quotations/bin/page.tsx`, `src/app/(dashboard)/quotations/page.tsx`.
**Migrations:** `057_quotation_recycle_bin.sql` (`056` is taken by the liaison visibility fix).
**Scope:** The quotation delete from v54 becomes a **soft delete**. Deleted quotes go to a **Recycle bin**, where authorised users can **restore** them. No change to sales stages, Won gates, payment milestones or quotation numbering.

---

## 1. Request, as understood

| Item | Detail |
|---|---|
| Ticket | "[Quotation Generator] Add a recycle bin or restore option for deleted quotations" |
| Where | Quotations module (`/quotations`) |
| Expected | Deleted quotations can be restored from a recycle bin by authorised users |

---

## 2. Audit — today vs gap

### Today (v54)
- `deleteQuotation(id)` in `src/lib/quotations/actions/quotation.ts` does a **hard `DELETE`** on `quotations`.
  - `quotation_items` go with it (`ON DELETE CASCADE`, `007_quotations.sql`).
  - Only an audit row remains (`quotation_deleted`, with number, status, total and customer).
- Guard: `src/lib/quotations/delete-guard.ts` blocks accepted quotes, the lead's accepted quote, and quotes with payments. These rules stay unchanged.
- Permission: `canDeleteQuotations` means admin, `delete_quotations`, `manage_quotations` or `full_access`. The RLS policy `quotations_delete` comes from `055`.
- UI: `delete-quotation-button.tsx` on `/quotations` (list) and `/quotations/[id]` (detail).

### Gap
- A deleted quote cannot be recovered. There is no recycle bin, no restore action, and no restore permission.
- **Quotes deleted before this ships are gone permanently.** Only their audit rows remain, and the line items were cascaded away, so they cannot be rebuilt.

### Reads that must hide deleted quotes
- About **37** `.from("quotations")` reads across 10 files: dashboard, reports, payments, leads, liaison, quotation data/actions, and persist.
- `quotation_items` reads rely on the parent quote being visible, through the `EXISTS` check in their RLS.
- Filtering each read by hand risks missing one, so the plan hides deleted rows **in RLS** instead (§3.1).
- The only **admin-client (service role)** read, which bypasses RLS, is in `src/actions/liaison.ts`. It is the customer-portal quote lookup (fallback by `lead_id`) and needs an explicit `.is("deleted_at", null)`.
  - The accepted-quote lookup there is safe, because an accepted quote can never be deleted.

### Numbering
- New numbers come from `allocateQuotationNumber()`, a sequence with retry on `23505`, and there is a `UNIQUE (company_id, quotation_no)` constraint.
- Deleted rows keep their number, so restore never clashes and hiding rows never causes a number to be reused.

---

## 3. Design

### 3.1 Database (`057_quotation_recycle_bin.sql`)

1. **New columns on `quotations`:**
   - `deleted_at TIMESTAMPTZ NULL`
   - `deleted_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL`
   - `delete_reason TEXT NULL`
   - Partial index: `CREATE INDEX idx_quotations_deleted ON quotations(company_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;`
2. **New authority `restore_quotations`** ("Restore Quotations", group `sales`).
   - Granted to `admin` by default; other roles get it by ticking it in Team & Access (same pattern as `055`).
   - The bin can be viewed with `restore_quotations`, `delete_quotations`, `manage_quotations` or `full_access`.
   - Restoring needs `restore_quotations`, `manage_quotations` or `full_access`. The final rule depends on open question Q1.
3. **`quotations_select`:** recreate it with `AND deleted_at IS NULL` added to the existing clauses. Every normal read then hides bin rows automatically, including `quotation_items` through their `EXISTS` policy, the print page, and the dashboard and report totals.
4. **SECURITY DEFINER RPCs.** Each one checks `auth_company_id()`, `is_active_user()` and `has_authority(...)` inside, and runs with `SET search_path = public`.
   - `soft_delete_quotation(p_id uuid, p_reason text)`: sets `deleted_at`, `deleted_by` and `delete_reason`.
     - Needs `delete_quotations`, `manage_quotations` or `full_access`.
     - It must be an RPC because a plain `UPDATE` would fail once the new row no longer passes the SELECT policy (Postgres RLS behaviour).
     - The app-side delete guard still runs first, and the RPC re-checks the database side: status not `accepted`, not a lead's `accepted_quotation_id`, and no `payments` rows.
   - `list_deleted_quotations()`: returns bin rows for the caller's company with id, number, customer, phone, lead id and name, grand total, status, and deleted at / by / reason.
   - `restore_quotation(p_id uuid)`: clears the three columns and returns the row.
   - `purge_quotation(p_id uuid)`: permanent delete, only for rows already in the bin. Admin / `full_access` only (Q3).
5. **`quotations_delete`:** tighten it so hard `DELETE` only works on rows already in the bin (`deleted_at IS NOT NULL`). The normal Delete button can then never skip the bin.

### 3.2 Server actions (`src/lib/quotations/actions/quotation.ts`)

- **`deleteQuotation(id, reason?)`:** keep the guard, then call `rpc("soft_delete_quotation")` instead of `.delete()`.
  - Audit event: `quotation_deleted`, now with `"soft": true`.
  - Success message: "Moved to Recycle bin".
- **New `listDeletedQuotations()`:** permission check, then call the RPC.
- **New `restoreQuotation(id)`:** returns `{ ok, error }`, then does the lead checks below.
  - Adds audit event `quotation_restored`.
  - Revalidates `/quotations`, `/quotations/bin`, `/pipeline` and `/customers`.
- **New `purgeQuotation(id)`:** admin only, with audit event `quotation_purged`.
- **Context:** `getQuotationContext` gains `canRestoreQuotations` and `canPurgeQuotations`.
- **Restore rules (checked in the action):**
  - Status stays as it was when deleted. It can only be draft, sent or rejected, because accepted quotes are never deletable.
  - If the linked lead was deleted meanwhile, `lead_id` is already `NULL` (`ON DELETE SET NULL`). The quote restores as a custom-customer quote, with a note in the success message.
  - If the linked lead is now **Lost**, it restores anyway, and the message says so.
  - A restored quote never becomes the lead's accepted quote automatically.

### 3.3 Portal fix
- `src/actions/liaison.ts`, portal quote fallback (admin client): add `.is("deleted_at", null)`.

### 3.4 UI

- **`/quotations` header:** a **"Recycle bin (N)"** button, shown only to users who can view the bin.
- **New page `/quotations/bin`** (`src/app/(dashboard)/quotations/bin/page.tsx`):
  - Table columns: Quote no., Customer or lead, Amount, Status at delete, Deleted by, Deleted on, Reason, Days left (only if Q2 sets auto-purge).
  - Row actions:
    - **Restore**, with a confirm dialog.
    - **Delete forever**, admin only, with a type-to-confirm on the quote number.
  - Search by quote number or customer, plus an empty state.
  - Mobile: card list, matching the responsive `/quotations` list.
- **Delete dialog** (`delete-quotation-button.tsx`):
  - Text changes to "Move to Recycle bin? Authorised users can restore it."
  - Adds an optional **Reason** field.
  - The blocker list from v54 is unchanged.
- **Opening a deleted quote by URL** (`/quotations/[id]`, `/edit`, `/print`): RLS returns nothing, so these show the normal not-found. For bin viewers, add a "This quotation is in the Recycle bin → Open bin" hint (optional, via the RPC).
- **Team & Access:** the new "Restore Quotations" checkbox appears automatically from the `authorities` table and `authorities.ts` (add the key to `AUTHORITIES`).

### 3.5 Retention (depends on Q2)
- **Default proposal:** keep items forever and purge manually.
- **If the client wants auto-purge** (for example 30 days), add a daily step to the existing cron route (`src/app/api/cron/reminders/route.ts`) or a SQL `pg_cron` job. It would hard-delete bin rows older than N days, and the bin shows "Days left".

---

## 4. Phases

| Phase | Work | Files |
|---|---|---|
| A | Migration `057`: columns, index, authority, `quotations_select` / `quotations_delete` changes, the 4 RPCs | `supabase/migrations/057_quotation_recycle_bin.sql` |
| B | Soft delete in `deleteQuotation`, the new restore / list / purge actions, context flags, authority key | `src/lib/quotations/actions/quotation.ts`, `src/lib/quotations/context.ts`, `src/lib/domain/authorities.ts` |
| C | Recycle bin page, header button, delete-dialog copy and reason | `src/app/(dashboard)/quotations/bin/page.tsx`, `src/components/quotations/quotation-recycle-bin.tsx` (new), `delete-quotation-button.tsx`, `quotations/page.tsx` |
| D | Portal admin-client filter | `src/actions/liaison.ts` |
| E | QA, docs, memory | This doc, `Global Instructions/memory.md`, `Solar-Ops-Knowledge/apps/rk-solar.md` |

---

## 5. QA plan (feature-qa-gate)

Use the anon key and user logins only, never the service role key. **Blocked** until the production `.env` path and test logins are provided.

| # | Check | Expected |
|---|---|---|
| 1 | Delete a draft quote as a `delete_quotations` user | It disappears from `/quotations`, the dashboard pipeline value and reports, and appears in the bin |
| 2 | Try to delete an accepted or paid quote | Still blocked with reasons (v54 behaviour) |
| 3 | RPC `soft_delete_quotation` on an accepted quote, called directly | Rejected by the database check |
| 4 | Plain `DELETE` on a live quote through REST | 0 rows (the policy requires it to be in the bin) |
| 5 | Open `/quotations/<deleted id>` and `/print` | Not found, with the bin hint for bin viewers |
| 6 | User without restore or delete authority opens `/quotations/bin` | No access, and the RPC errors |
| 7 | Restore as a `restore_quotations` user | The quote is back in the list with the same number, items and totals, and a `quotation_restored` audit row exists |
| 8 | Restore when the lead was deleted | Restores with no lead, and the message says so |
| 9 | Delete forever as admin | The row and its items are gone, and a `quotation_purged` audit row exists |
| 10 | Customer portal for a lead whose only quote is in the bin | The portal does not show it |
| 11 | `tsc` and lint on changed files | Clean |

---

## 6. Open questions for the client

1. **Who can restore?**
   - (a) Anyone who can delete, which is simplest.
   - (b) A separate **"Restore Quotations"** authority, which is proposed: admin by default, tickable per role.
   - (c) Admin only.
2. **Retention:** keep deleted quotes **forever**, which is proposed, or **auto-delete after N days** (30 / 60 / 90)?
3. **Delete forever:** should admins be able to permanently empty items from the bin (proposed: yes, admin only), or should the bin be restore-only?
4. **Reason on delete:** optional (proposed) or required?
5. Should the bin also appear on the **lead's page**? There is no quotation list on the lead workspace today, so the proposal is `/quotations/bin` only.

**Note for the client:** quotations deleted **before** this update cannot be restored, because they were permanently removed. Only their audit log entries remain.
