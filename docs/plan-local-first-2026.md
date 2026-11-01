# RK local-first cache + SoftLink (2026)

## Goal

Primary CRM navigation paints from device cache (IndexedDB + TanStack Query),
swaps pages in the client shell (Dyzen SoftLink), and revalidates in the
background. Non-gated edits can queue offline (Phase G).

## Cache keys

| Key | Scope |
|-----|--------|
| `rks-cache-v2-${companyId}-${userId}` | PersistQueryClient IDB blob |
| `rk-mutations-${userId}` | Offline write queue (IDB) |
| `rk-list-state-*` | sessionStorage UI retention (filters) |
| Query keys | `["rk", <scope>, companyId, …]` |

Wipe on logout (`wipePersistedCache` + `wipeOfflineQueues`) and when company/user buster changes.

## SoftLink (Dyzen pattern)

Registered CRM routes use SoftLink → `preventDefault` → `history.pushState` →
`RkClientOutlet` swaps a lazy client page (**no App Router RSC wait**).

`RkClientOutlet` **always** renders the client page when the path is in the
registry (same as Dyzen `HomeClientOutlet` / `OpsClientOutlet`). Never gate on
`path !== usePathname()` — that desynced URL vs content.

Hard-nav still: quotation **builder/edit/print/new**, lead deep URLs (modals), auth/login, portal.
SoftLink also covers `/quotations/<uuid>` detail (not edit/print).

Routes: `/`, `/pipeline`, `/customers`, `/quotations`, `/payments`, `/installation`,
`/liaison`, `/dealers`, `/maintenance`, `/team`, `/grievances`, `/lead-import`,
`/ingest`, `/catalog`, `/reports/sales-reps`, `/reports/dealers`, `/accounts/receivables`.

## Layers

1. **QueryProvider** — single `QueryClientProvider` + `persistQueryClient` in effect (no provider swap); loads + flushes offline queue on online.
2. **RkClientNav** — pushState + lazy pages under `components/local-first/pages/`; background module warm.
3. **SoftLink** — Next `<Link prefetch={false}>` + client navigate for registered routes; hover warms TanStack queries + page modules.
4. **No** `Next-Router-Prefetch` document seeding (Flight poison on this app).
5. **No** IdlePrefetch-all routes on mount (mass server-action POSTs).
6. **PWA install** — `/sw.js` always registered (installable); `/manifest.webmanifest` + 192/512 icons; `InstallAppButton` on login + header. Optional offline shell: `sw-rks.js` when `NEXT_PUBLIC_RK_SW=1`.
7. **Invalidation** — `useRkRefresh` / `invalidateRkLists` after successful mutations.
8. **SyncIndicator** — stable `getSyncSnapshot()`; shows Offline / Syncing · N / Synced; click flushes queue.

## Lead / customer detail (local-first reads)

- Query key `["rk", "lead", companyId, leadId]` — same IDB persist blob as lists.
- Modals (`LeadDetailModal` / `CustomerDetailModal`) paint from cache; background refetch.
- **Instant shell:** `openLead` / `openCustomer` / `openInstallation` pass list-row fields → `placeholderData` so header + stage paint before `getLead`. Gated actions stay off until full row lands (`shellPaint`). Installation crew view (`hideStages`) still paints header from shell while `getCrewJobBrief` loads.
- **Prefetch:** hover / focus / **pointerdown** on lead, customer, and installation queue cards; `useVisibleLeadPrefetch` scans viewport + `.kanban-scroll` column scroll (budget ~10 mobile / ~20 desktop).
- **Batch API:** `GET /api/local-first/leads/modal?ids=` via `prefetchLeadDetailsBatch` (not 400 full IDs — only near-viewport / scroll-ahead).
- Mutations: `invalidateRkLists` also invalidates `rk/lead` for list-related scopes.

## Quotation detail (local-first reads)

- SoftLink `/quotations/<uuid>` → client `quotation-detail-page` (no RSC wait).
- Query key `["rk", "quotation", companyId, quoteId]` — IDB via same PersistQueryClient blob.
- Instant shell from list cache row (`quoteShellToPlaceholder`); line items fill when `getQuotation` lands.
- Prefetch: SoftLink hover/focus/pointerdown + `prefetchRouteQueries` for detail URLs.
- Keep hard-nav: `/quotations/new`, `/edit`, `/print`, bin, template.

## Phase G — offline write queue

IDB queue + flush via `/api/local-first/*` (session cookies; same auth as server actions).

**Queued (non-gated):**

| Action | API |
|--------|-----|
| Edit lead fields | `PATCH /api/local-first/leads/[id]` |
| Move sales stage (pipeline / stepper) | `POST …/stage` |
| Mark lost / reopen | `POST …/lost` · `…/reopen` |
| Resolve reminder | `POST /api/local-first/reminders/[id]/resolve` |

**Still online-only (do not queue):** Won closing, payment verify, install complete,
feasibility approve, quotation accept, survey book/complete, and other gated advances.

Client helpers: `queueable-crm.ts` → `runCrmMutationOrQueue` → `offline-queue.ts`.
