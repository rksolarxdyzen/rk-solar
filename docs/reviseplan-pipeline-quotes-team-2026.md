# Revise plan — Pipeline POV, Kanban scroll, Quote delete, Portal upload, Multi-bank, Team edit (Sep 2026)

**App:** `Apps/RK-Solar` (RK Solar)
**Status:** Implemented 2026-09-29 (Phases A–F). Deployed as **v54** (`df21e9b`). Run `055` on production Supabase.
**Migrations:** `055_delete_quotations_authority.sql` only. Bank accounts live in the template JSON, so `056` is not needed.

### Implementation notes (deltas from the plan)

- **POV carry-over:** instead of changing the global nav, the picker shows a "Same view in Customers / Pipeline →" link that keeps `?as=` / `?as_role=`.
- **POV helpers:** `canUsePipelinePov`, `parsePipelinePov`, `povSubtitle` in `src/lib/leads/visibility.ts`; `listPovUsers()` in `src/actions/leads.ts`; shared `ViewAsPicker` in `src/components/leads/view-as-picker.tsx`.
- **Bypass closed:** `listLeads` now always applies `ownLeadOrFilter` for users without see-all, even when `assigned_to` is passed.
- **Delete guard:** `src/lib/quotations/delete-guard.ts` (batch; used by list, detail and the server action). The lead-stage line is added only as context when another blocker exists, so a spare draft on a Won lead stays deletable. `canDeleteQuotations` = admin / `delete_quotations` / `manage_quotations` / `full_access` (sales_manager keeps it through its default `manage_quotations`).
- **Lead quotations section:** the lead workspace has no quotation list, so delete lives on `/quotations` and `/quotations/[id]` only.
- **Portal upload:** images go through `prepareProofFileForUpload` (compressed like the other proof uploads) before `uploadLeadDocument`. Also moved the panel's early return below its hooks.
- **Bank accounts:** `src/lib/quotations/bank-accounts.ts`. The template page seeds the editor with the legacy account, so account 1 is always present; the last card cannot be removed. Save writes the first enabled account back to the flat columns and to `qrCodeUrl` / `upiId` / `bankAccountType`. Per-account QR upload uses the new `uploadBankAccountQr` action; the Images tab QR field is replaced by a pointer to the Bank accounts section.
- **Edit user:** `updateTeamUser` returns `{ ok, error }` so the real message shows in production.
**Scope:** Seven requests from the client. No change to sales stages, Won gates or payment milestones.

### Client answers (2026-09-29) — these override anything below that conflicts

1. **"View as" POV:** also on **Leads** and **Customers**. `/leads` already redirects to the Pipeline board, so the Pipeline covers Leads. The **Customers** page (`/customers`, via `getCustomers()` → `listLeads`) gets the same picker.
2. **Accepted quotations can never be deleted.** The Delete action shows **why it is blocked**, for example: "Accepted quotation — cannot delete. Payments recorded: ₹25,000 (Token). Lead is at Pre-dispatch pending." Every applicable reason is listed.
3. **Bank accounts: template only.** The Template editor gets **"+ Add bank account"**. Each account has an **Enabled** checkbox, and every enabled account prints on the quotation. There is **no per-quotation choice**. The accounts are stored in the template JSON, with no new table or migration.
4. **Edit user: name and phone only.** Email is **not** editable.

---

## 1. Client requests, as understood

| # | Request (client words) | What it means in the app |
|---|---|---|
| R1 | "Filter or POV Mode to see Leads Pipeline according to the assigned users (only for owners or admins)" | On the **Pipeline board (Leads)** and **Customers**, Admin / full-access users get a **"View as"** picker. Choosing a user shows the board as that user sees their own leads. Nobody else sees the picker, and the server ignores the filter for them. |
| R2 | "Horizontal scroll option at the top as well for kanban view, or limit the kanban in the viewport and enable inside scrolling" | The desktop Kanban only has a scrollbar at the very bottom of a long page. Fix it so the board **fits the screen height**, each column **scrolls inside itself**, and there is a **horizontal scrollbar at the top** too, plus arrow buttons. |
| R3 | "Add options to delete the Quotations, with Authorities permissions as well" | A **Delete** action on quotations, controlled by a new **"Delete Quotations"** authority that can be ticked per role in Team & Access. |
| R4 | "Add Upload Dropbox in the Add Portal Document instead of insert link" | The **Add portal document** form (lead → Liaison panel) replaces the `https://…` link field with a **drag-and-drop / click-to-upload drop zone**. |
| R5 | "Add multiple bank account options in Quotations, like a checkbox to enable or disable, and add more accounts, etc." | In the **Template editor**, **several bank accounts**, each with an **Enabled** checkbox, plus **"+ Add bank account"**, edit and remove. Every enabled account prints on all quotations. |
| R6 | "In Teams and Access provide option to edit the users, like Name as well" | **Edit user** in Team & Access: **name and phone** (not email). Today only role, password, picture and active status can be changed. |
| R7 | "Add options to filter Active and Inactive users in the Team and Access" | Team & Access user list gets an **All / Active / Inactive** filter with counts, plus search. |

---

## 2. Audit — today vs gap

### R1 Pipeline POV

**Today:**
- `src/app/(dashboard)/pipeline/page.tsx` loads `listLeads({ status, queue })`.
- `queue` offers only *All / My tele-calls / My site visits*, and always for the **logged-in** user.
- `src/components/leads/pipeline-board.tsx` filters only by search and temperature, on the client.
- Visibility: `canSeeAllLeads` (admin, `full_access`, `view_all_leads`) sees everything; everyone else is limited by `ownLeadOrFilter(profile.id)` (`src/lib/leads/visibility.ts`).

**Gap:** there is no way to look at another user's pipeline.

**Security note found during the audit:** `listLeads` skips the own-lead scope whenever `filters.assigned_to` is passed (`else if (!canSeeAll && !filters?.assigned_to)`). No screen passes it today, but the POV work must not reuse that path. It should be closed as part of this change.

### R2 Kanban scroll

**Today:**
- Desktop board: `<div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">`, with columns `w-64`, and the column body grows with its cards.
- The page gets as tall as the longest column, so the horizontal scrollbar sits far down the page.
- Mobile is stacked, so no issue there.

### R3 Quotation delete

**Today:**
- A server action already exists: `deleteQuotation` in `src/lib/quotations/actions/quotation.ts`. It checks `canDeleteQuotations`, which is manager / `full_access` / `manage_quotations`, from `src/lib/quotations/context.ts`.
- **No UI** calls it: `quotations-list.tsx` and the `quotations/[id]` page have no delete button.
- RLS `quotations_delete` (`007`) allows `manage_quotations` / `full_access`.
- Related foreign keys:
  - `quotation_items` → cascade.
  - `payments.quotation_id` → set null.
  - `leads.accepted_quotation_id` → set null.

**Gap:**
- No button.
- No dedicated authority; only `manage_quotations` exists, which bundles everything.
- No guard for accepted or paid quotations.
- No audit event.

### R4 Portal document upload

**Today:**
- `src/components/leads/liaison-panel.tsx` shows the "Add portal document" form: type, title, and a **URL input** → `addPortalDocument` (URL only).
- A file-upload action **already exists**: `uploadLeadDocument(formData)` in `src/actions/liaison.ts`. It accepts PDF / JPG / PNG / WebP up to 4 MB (`PROOF_UPLOAD_MAX_BYTES`), stores the file in bucket `proofs` under `…/portal-docs/<leadId>/`, and inserts `portal_documents`. It is used by `lead-docs-panel.tsx` and `move-to-won-button.tsx`.

**Gap:** UI only.

### R5 Multiple bank accounts

**Today:**
- A single set of flat columns on `quotation_company_settings`: `bank_account_name`, `bank_name`, `account_number`, `ifsc_code`, `branch`. Template JSON holds `bankAccountType`, `qrCodeUrl` and `upiId` (v53).
- The PDF prints one bank block plus one QR (`solar-proposal-document.tsx`, `bom-quotation-document.tsx`, `appliance-quotation-document.tsx`).
- Edited in Template editor → Offer → Bank.

**Gap:**
- No list of accounts.
- No enable/disable.
- No per-quotation choice.

### R6 / R7 Team & Access

**Today:**
- `src/actions/team.ts` has `createTeamUser`, `assignTeamUserRole`, `resetTeamUserPassword`, `setTeamUserProfilePicture` and `setTeamUserActive`. There is **no update of name / phone / email**.
- `src/components/admin/team-access-manager.tsx` → `UsersTab` lists **all** users in one table, with no filter or search.

---

## 3. Decisions

| # | Decision |
|---|---|
| D1 | **Who gets POV:** `role = admin` or `full_access`. That is the "owner / admin" in this app. After `052`, `view_all_leads` is admin-only anyway. The check runs **on the server**; a crafted `?as=` URL from anyone else is ignored. |
| D2 | **What "a user's pipeline" means:** leads where that user is tele-caller, surveyor, `assigned_to`, crew or creator, i.e. the same rule as `ownLeadOrFilter`, so the POV shows exactly what that user sees. An optional **"Role on lead"** filter narrows it to Tele-caller / Surveyor / Assigned only. There is also an **Unassigned** option: no tele-caller, surveyor or `assigned_to`. |
| D3 | **Kanban:** the board is fixed to the viewport height, columns scroll vertically inside, and there is a synced **top scrollbar** plus ◀ ▶ buttons. The bottom scrollbar stays at the bottom of the screen, not the bottom of the page. |
| D4 | **Delete authority:** a new `delete_quotations` authority ("Delete Quotations"). Delete is allowed if the user has `delete_quotations`, `manage_quotations` or `full_access`, or is admin. The authority is granted to **admin** by default; other roles get it by ticking it in Team & Access. |
| D5 | **Delete guard:** a quotation is **blocked** from deletion when **any** of these is true: status is `accepted`; it is the lead's `accepted_quotation_id`; any payment row references it (`payments.quotation_id`). The server returns **every** reason that applies, and the UI shows them in the confirm dialog or on a disabled Delete button's tooltip. Example: "Cannot delete: Accepted quotation · Payments recorded ₹25,000 (Token, verified) · Lead is at Pre-dispatch pending." Draft, sent and rejected quotes with no payments can be deleted after confirmation. |
| D6 | **Portal upload:** the drop zone accepts PDF / JPG / PNG / WebP, **one or more files**, 4 MB each (the current server limit). The title defaults to the file name and can be edited. The URL field is removed from the UI; `addPortalDocument` stays for compatibility. |
| D7 | **Bank accounts storage:** `bankAccounts[]` inside the existing template JSON (`quotation_company_settings.quotation_template`). Each entry holds id, label, account name, bank, A/C no., IFSC, branch, type, UPI ID, QR URL, `enabled` and order. When the saved template has no `bankAccounts` yet, it builds account 1 from the legacy flat bank columns plus `qrCodeUrl` / `upiId` (ICICI · Vasad · eazypay UPI), so nothing changes until an admin edits. **No migration and no per-quotation choice.** |
| D8 | **PDF with several accounts:** every **enabled** account prints, up to **3** on the page (the editor warns above 3). The **QR and UPI ID** come from the first enabled account that has a QR. Each account can have its own QR and UPI. |
| D9 | **Edit user:** admins, `manage_users` and `full_access` can edit **name and phone** only. Email stays read-only because it is the login. The same protection as today applies: a non-privileged user cannot edit an admin / full-access account. |
| D10 | **User filter:** `All / Active (n) / Inactive (n)` tabs plus a search box (name, email, phone). The default tab is **Active**. |

---

## 4. Phases

### Phase A — Pipeline POV (R1)

1. **Server** (`src/actions/leads.ts` → `listLeads`):
   - Add `viewAsUserId?: string` and `viewAsRole?: "any" | "tele_call" | "survey" | "assigned"` and `unassigned?: boolean`.
   - Honour them **only** when the caller is admin or `full_access` (new helper `canUsePipelinePov(profile)` in `visibility.ts`).
   - `any` → `.or(ownLeadOrFilter(viewAsUserId))`. `tele_call` → `eq(assigned_telecaller_id)`. `survey` → `eq(assigned_surveyor_id)`. `assigned` → `eq(assigned_to)`. `unassigned` → all three are null.
   - **Close the existing bypass:** the `assigned_to`, `assigned_telecaller_id` and `assigned_surveyor_id` filters are applied **in addition to** the own-lead scope for users who cannot see all leads, never instead of it.
2. **Page** (`pipeline/page.tsx`):
   - Read `?as=<uuid>|unassigned` and `?as_role=`.
   - If the caller has POV, load active users (`profiles` where `is_active`, same company) for the picker.
   - Active and Lost counts follow the POV.
   - The subtitle reads, for example, "Viewing as **Ravi Patel** (tele-caller + surveyor + assigned)".
3. **Board** (`pipeline-board.tsx`):
   - Add a "View as" select with options *Everyone*, *Unassigned*, then each user by name, with role in grey. Next to it, a "Role on lead" select (shown only when a user is picked).
   - Selecting a user updates the URL. There is a clear (×) chip.
   - The existing "My tele-calls / My site visits" queue buttons are hidden while POV is active, so the two don't conflict.
4. **Customers** (`/customers`):
   - `getCustomers()` accepts the same POV options and passes them to `listLeads`.
   - `customers/page.tsx` reads `?as=` / `?as_role=`, again honoured only for admin / full-access.
   - `customers-list.tsx` gets the same "View as" picker and clear chip. The picker is a shared component, `src/components/leads/view-as-picker.tsx`, used by both screens.
   - The subtitle count follows the POV.
5. **Leads:** `/leads` redirects to `/pipeline`, so steps 1–3 cover it. The chosen POV is kept in the URL, so switching between Pipeline and Customers keeps the same user selected (the nav links carry `?as=`).

### Phase B — Kanban scrolling (R2)

1. Wrap the desktop board in a scroll container with height `calc(100dvh - <header + toolbar offset>)` and a minimum of 420px. The container has `overflow-x: auto; overflow-y: hidden`.
2. Each column is `flex-col` with a sticky header. The body is `flex-1 overflow-y-auto` with thin scrollbars, so long stages scroll inside the column.
3. **Top scrollbar:** a thin mirrored strip above the board, with an inner width equal to the board's `scrollWidth`. The two stay in sync through `onScroll`, guarded against loops. A `ResizeObserver` updates the width when leads load or columns change.
4. ◀ ▶ buttons in the toolbar scroll one column width (272px) with smooth behaviour. The buttons are disabled at the ends.
5. Drag-and-drop still works: auto-scroll horizontally when dragging near the left or right edge, and vertically inside a column near its top or bottom.
6. Mobile (stacked layout) is unchanged.

### Phase C — Quotation delete + authority (R3)

1. **Migration `055_delete_quotations_authority.sql`:**
   - `INSERT INTO authorities (key, label, authority_group) VALUES ('delete_quotations','Delete Quotations','sales') ON CONFLICT DO NOTHING`.
   - Grant it to the admin role (`role_authorities` upsert on the primary key, following the `053` pattern).
   - Replace policy `quotations_delete` to allow `has_authority('delete_quotations') OR has_authority('manage_quotations') OR has_authority('full_access')`.
2. **Code:**
   - `src/lib/domain/authorities.ts`: add the `delete_quotations` definition (group Sales, description "Delete draft / sent quotations") and add it to the admin defaults.
   - `src/lib/quotations/context.ts`: `canDeleteQuotations` also accepts `delete_quotations`.
   - New `getQuotationDeleteBlockers(id)` returns `string[]` reasons. It covers:
     - status `accepted`;
     - the lead's `accepted_quotation_id` pointing at this quote;
     - payments linked to the quote, with total, milestones and status;
     - the lead stage label when the lead is past Quoted.
   - The list and detail pages call it, so the reasons show **before** the user clicks.
   - `deleteQuotation`:
     - Load the quote and its lead.
     - Run the same blocker check again on the server. If any reason applies, return `{ ok: false, reasons }`.
     - Delete the quote.
     - Log the audit event `quotation_deleted` with the quote number, lead, status and total.
     - Revalidate `/quotations`, the lead page and `/pipeline`.
     - Return `{ ok, error }`, not a throw, so the message reaches the user in production.
3. **UI** (buttons hidden when the user lacks the permission):
   - `quotations-list.tsx`: a row action **Delete** (trash icon).
     - Deletable quote: a confirm dialog, "Delete quotation RK-2026-0042 for <customer>? This cannot be undone."
     - Blocked quote: the dialog opens as **"Cannot delete this quotation"** and lists the reasons, with no Delete button inside. A lock icon on the row shows the first reason on hover.
   - `quotations/[id]/page.tsx`: a **Delete** button in the header actions, with the same blocked-reasons behaviour. After deleting, go to `/quotations`.
   - The lead's quotations section, if the lead page lists quotes: the same action.
4. Team & Access → Roles → authorities editor shows the new checkbox automatically, because it reads from the `authorities` table.

### Phase D — Portal document drop zone (R4)

1. New `src/components/ui/file-drop-zone.tsx`, which is reusable:
   - Dashed box: "Drag & drop files here or **browse**".
   - Accepts PDF / JPG / PNG / WebP, with `multiple`.
   - Shows each file's name, size, a remove (×) button, and progress state (queued, uploading, done, failed).
   - Checks type and the 4 MB limit on the client, and gives a clear message on failure.
2. `liaison-panel.tsx` → "Add portal document":
   - Keep the document type select.
   - Replace the URL input with the drop zone.
   - Title field: defaults to the file name for a single file, and becomes an optional prefix for several files.
   - The button reads **Upload to portal**.
   - Each file is sent one at a time through the existing `uploadLeadDocument(formData)` (`leadId`, `docType`, `title`, `file`).
   - On success, the portal document list refreshes and shows "3 documents added to portal".
3. No schema change. `addPortalDocument` (link) is kept on the server but no longer shown.

### Phase E — Multiple bank accounts in the Template (R5)

1. **Data** (`src/lib/quotations/quotation-template.ts`):
   - Add a `bankAccounts` field to `SolarProposalTemplate`:
     ```ts
     bankAccounts: Array<{
       id: string;            // uuid generated in the editor
       label?: string;        // e.g. "ICICI Current"
       accountName: string;
       bankName: string;
       accountNumber: string;
       ifscCode: string;
       branch?: string;
       accountType?: string;
       upiId?: string;
       qrUrl?: string;
       enabled: boolean;      // "Enabled" checkbox → shows on quotations
     }>;
     ```
   - The array order is the print order.
   - `normalizeSolarTemplate` rules:
     - Keep valid rows.
     - If the saved template has **no** `bankAccounts`, build one account from the legacy flat settings (`bank_account_name`, `bank_name`, `account_number`, `ifsc_code`, `branch`) plus `bankAccountType`, `qrCodeUrl` and `upiId`, falling back to the `BRAND.bank` ICICI · Vasad · eazypay values, with `enabled: true`.
     - So existing PDFs look the same until an admin edits.
2. **Template editor** (Offer → Bank accounts). This replaces the single bank form:
   - Each account is a card:
     - **☑ Enabled** (shows on quotations).
     - Label, account name, bank, A/C no., IFSC, branch, account type, UPI ID.
     - **QR upload** (reuses the existing template asset upload, stored per account).
     - ▲▼ to reorder, and **Remove** (with confirmation).
   - **+ Add bank account** adds an empty enabled card.
   - Warnings:
     - "No account enabled — quotations will show no bank details" when all are unticked.
     - "Only the first 3 enabled accounts fit on the PDF" when more than 3 are enabled.
   - Saved with the rest of the template (`saveQuotationTemplate`). Saving also writes the **first enabled** account back to the legacy flat columns, so any old code path stays correct.
   - The separate QR upload and UPI ID field from v53 move into the account card. The template-level `qrCodeUrl` / `upiId` stay only as the fallback for account 1.
3. **Print** (`quotation-print.ts` → `resolveBankAccounts(template, settings)`): returns the enabled accounts in order, the first 3 only. The print page passes them to all three document types.
4. **Documents:**
   - `solar-proposal-document.tsx`, Payment details:
     - One compact block per enabled account, titled by label or bank name: A/C Name, A/C No., Bank, IFSC, Branch Name. Empty lines are hidden.
     - Below them, the **QR + "UPI ID"** of the first enabled account that has a QR.
     - With 2–3 accounts the blocks use a tighter two-column grid, so page 2 still fits (checked with a headless PDF render, as in v53).
   - `bom-quotation-document.tsx` and `appliance-quotation-document.tsx`: the same list and QR, in their own style.
5. **No migration.** No per-quotation selection. The quotation builder is untouched.

### Phase F — Team & Access: edit user + Active/Inactive filter (R6, R7)

1. **Server** (`src/actions/team.ts`), new `updateTeamUser(userId, { name, phone })`. **Email is not editable.**
   - `requireTeamAccess("users")`, `getCompanyTarget`, `assertCanManageTarget`, so a non-admin cannot edit admin / full-access accounts.
   - Zod: name trimmed 2–255, phone 6–20.
   - Update `profiles.name` / `phone` and the auth `user_metadata.name` / `phone` (service role, server only, same as the existing team actions).
   - Audit event `team_user_updated` with the changed field names.
   - `revalidateTeam()`. Also revalidate `/pipeline` and `/customers`, so cards show the new name.
2. **UI** (`team-access-manager.tsx` → `UsersTab`):
   - An **Edit** button on each row opens `EditUserModal`, with fields **Name** and **Phone**. Email is shown read-only, with the hint "Login email can't be changed here".
   - A filter bar above the table:
     - Segmented **All (n) / Active (n) / Inactive (n)**, default **Active**.
     - A search box filtering name, email and phone on the client.
     - An optional **Role** select.
   - The header count reads "12 active · 3 inactive".
   - Inactive rows are slightly dimmed, and **Reactivate** stays available there.

---

## 5. Files touched (summary)

| Phase | Files |
|---|---|
| A | `src/actions/leads.ts`, `src/lib/leads/visibility.ts`, `src/app/(dashboard)/pipeline/page.tsx`, `src/app/(dashboard)/customers/page.tsx`, `src/components/leads/pipeline-board.tsx`, `src/components/leads/customers-list.tsx`, `src/components/leads/view-as-picker.tsx` (new) |
| B | `src/components/leads/pipeline-board.tsx` (+ small CSS in `globals.css` for thin scrollbars) |
| C | `supabase/migrations/055_delete_quotations_authority.sql`, `src/lib/domain/authorities.ts`, `src/lib/quotations/context.ts`, `src/lib/quotations/actions/quotation.ts`, `src/components/quotations/quotations-list.tsx`, `src/app/(dashboard)/quotations/[id]/page.tsx` |
| D | `src/components/ui/file-drop-zone.tsx` (new), `src/components/leads/liaison-panel.tsx` |
| E | `src/lib/quotations/quotation-template.ts`, `quotation-template-editor.tsx`, template save action (write-back of first enabled account), `src/lib/quotations/quotation-print.ts`, `src/app/(print)/quotations/[id]/print/page.tsx`, `solar-proposal-document.tsx` + CSS, `bom-quotation-document.tsx`, `appliance-quotation-document.tsx` |
| F | `src/actions/team.ts`, `src/components/admin/team-access-manager.tsx` |

---

## 6. Test plan (feature QA gate — anon key + user logins only)

| # | Check | Expect |
|---|---|---|
| T1 | Admin opens Pipeline → View as a tele-caller, then opens Customers | Both show exactly that user's leads / customers; counts match; the subtitle names the user; the POV carries over |
| T2 | Sales executive opens `/pipeline?as=<admin-uuid>` | The picker is not shown, and the board still shows only their own leads (no leak) |
| T3 | Admin → View as "Unassigned" | Only leads with no tele-caller, surveyor or assigned user |
| T4 | Desktop Kanban with 40+ leads in one stage | The board fits the screen; the column scrolls inside; the top scrollbar and ◀ ▶ move the board; drag across columns still works |
| T5 | User without `delete_quotations` / `manage_quotations` | No Delete button; calling the action directly returns a permission error; RLS blocks the delete |
| T6 | Grant `delete_quotations` to Sales Manager in Team & Access → delete a draft quote | Quote removed, audit `quotation_deleted` logged, list refreshed |
| T7 | Try to delete an accepted quote with a token payment | The dialog shows "Cannot delete" with the reasons (Accepted · Linked as the lead's accepted quote · 1 payment ₹X received); no Delete button; a direct action call returns the same reasons; the quote remains |
| T8 | Liaison → Add portal document → drop 2 PDFs + 1 JPG | 3 portal documents created and visible in the customer portal; a file over 4 MB or a `.docx` is rejected with a clear message |
| T9 | Existing template (no `bankAccounts` saved) | Editor shows one ICICI · Vasad account, Enabled; the PDF looks the same as in v53 |
| T10 | Template editor → + Add bank account, keep both Enabled, save | Every quotation PDF (solar, BOM, appliance) shows both bank blocks + 1 QR/UPI; solar page 2 still fits on one page |
| T11 | Untick the first account's Enabled box | Only the second account prints; the legacy flat columns now hold the second account |
| T12 | Team & Access → Edit user name / phone | Saved; the new name shows on pipeline cards, the customers list and the lead header |
| T13 | Edit modal | Email is read-only; the action ignores any email in the payload |
| T14 | Non-admin manager tries to edit an admin account | Blocked (same as the role / password rules) |
| T15 | Team & Access → Inactive tab | Only deactivated users; counts correct; Reactivate works from there |
| T16 | `npx tsc --noEmit`, lint on touched files | Exit 0 |

---

## 7. Deploy

1. After implementing, sync with `sync-from-app.ps1` → `DeployScripts/deploy-rk-solar.ps1`. That will be the next vN after v53.
2. Run **`055`** on production Supabase, along with any earlier pending ones (`052`–`054`). Bank accounts need no migration.
3. After deploy, as admin:
   - Team & Access → Roles: tick **Delete Quotations** for any role that should have it.
   - Template editor → Bank accounts: check that the seeded ICICI account is correct, and add others.

---

## 8. Open questions (defaults assumed if not answered)

1. ~~POV on Leads / Customers?~~ **Answered:** yes, on Pipeline (Leads) and Customers.
2. ~~Accepted-quote delete?~~ **Answered:** always blocked, with the reasons shown (payments, accepted link, stage).
3. ~~Per-quote bank choice?~~ **Answered:** no. Template only: add more banks, and every Enabled account prints.
4. ~~Editable email?~~ **Answered:** no. Name and phone only.
5. **Default Team & Access tab:** Active (assumed) or All?

---

## 9. Exit criteria

- R1–R7 pass T1–T16, with the QA report shown in the implementation reply.
- No sales stage, Won gate or payment milestone changed.
- `Global Instructions/memory.md` and `Solar-Ops-Knowledge/apps/rk-solar.md` are updated with `055` and the new behaviour.
