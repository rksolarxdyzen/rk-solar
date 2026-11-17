# RK Bhabhor — Ad Campaign Landing + Submissions Inbox

**App:** `Apps/RK-Solar`  
**Brand:** RK Bhabhor  
**Document version:** v1.0.0  
**Date:** 2026-11-17  
**Status:** Ready to implement (awaiting build kickoff)  
**Related:** `Apps/Solar-Ops-Knowledge/apps/rk-solar.md`, `src/lib/quotations/brand.ts`, `src/lib/brand.ts`

---

## 1. Goal

Ship a **public, ad-ready landing page** for RK Bhabhor that converts paid traffic into enquiries, plus a **separate staff login surface** to review those submissions and **export CSV**.

| Audience | Need |
|----------|------|
| Prospect (Meta / Google / WhatsApp ads) | Fast, trustworthy, mobile-first page → one short form |
| Campaign / marketing staff | Login that is **not** the full CRM shell → list + search + CSV |
| Sales ops (later) | Optional promote-to-CRM-lead (phase 2; not required for v1) |

This is **not** a new client app and **not** a fork. It lives inside `Apps/RK-Solar` on the same Vercel + Supabase tenant.

---

## 2. Locked product decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Host | Same RK Solar Next.js app | One deploy, one Supabase, one domain |
| Public URL | `/go` (short for ads) | Easy UTM: `https://rksolar.zonicks.com/go?utm_source=meta` |
| Inbox URL | `/ads` (list) after `/ads/login` | Distinct from CRM `/login` → `/dashboard` |
| Auth | Same Supabase Auth users | No second IdP; “another login” = dedicated **surface + route gate** |
| Access model | New authority `view_ad_submissions` | Campaign-only users never need CRM nav |
| Data | New table `ad_campaign_submissions` | Isolated from `leads` until explicitly promoted |
| Auto-create CRM lead | **No** in v1 | Keeps ad noise out of tele-call queue |
| Spam | Honeypot + basic rate limit + phone normalize | Enough for first campaigns |
| Design | Brand-first, full-bleed hero, minimal sections | Matches workspace frontend rules |
| Stack extras | No Blob / Upstash / new services | Client Vercel + existing Supabase only |

---

## 3. Scope

### In scope (v1)

1. Public landing `/go` — attractive, modern, clean, minimalist, responsive.
2. Lead-capture form → persist submission + thank-you state.
3. Capture UTM + `gclid` / `fbclid` when present (query → hidden fields → DB).
4. Dedicated `/ads/login` page (campaign-branded, not CRM chrome).
5. Authenticated `/ads` inbox: table, date filter, search (name/phone), status mark (new / contacted / junk).
6. CSV export of filtered (or all) rows.
7. Middleware: `/go` + submit API public; `/ads/*` requires auth + authority.
8. Campaign-only redirect: users with **only** `view_ad_submissions` land on `/ads`, not CRM home.
9. Migration + RLS; sync/deploy when asked.

### Out of scope (v1)

- Auto-ingest into CRM `leads` / pipeline.
- Meta Conversions API / Google offline conversion upload.
- Multi-campaign A/B landing variants (single page + `campaign` query label is enough).
- Public CMS / editable copy in admin.
- WhatsApp click-to-chat bot flows beyond a CTA link.
- New domain or separate Vercel project.

### Phase 2 (document only)

- “Create lead” action from a submission (source = `ad_campaign`, preserve UTM).
- Multiple landing slugs (`/go/[slug]`) with per-campaign copy.
- Email/WhatsApp notify on new submission.

---

## 4. Information architecture

```text
Public
  /go                         Landing + form
  POST /api/ads/submit        Create submission (anon-safe RPC or insert policy)

Staff (campaign surface)
  /ads/login                  Email/password → Supabase
  /ads                        Submissions inbox
  /ads/export                 CSV download (GET, auth + authority)
  POST /api/ads/[id]/status   Mark contacted / junk (auth)
```

CRM `/login` and dashboard remain unchanged for full staff.

---

## 5. Data model

### Table: `ad_campaign_submissions`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `company_id` | uuid FK → companies | Tenant scope |
| `created_at` | timestamptz | Default now |
| `name` | text | Required |
| `phone` | text | Required, digits-normalized |
| `email` | text | Optional |
| `city` | text | Optional |
| `capacity_interest` | text | Optional enum-ish: `1-3kw` / `3-5kw` / `5kw+` / `unsure` |
| `message` | text | Optional |
| `status` | text | `new` \| `contacted` \| `junk` (default `new`) |
| `campaign` | text | From `?campaign=` or default `default` |
| `utm_source` | text | Nullable |
| `utm_medium` | text | Nullable |
| `utm_campaign` | text | Nullable |
| `utm_content` | text | Nullable |
| `utm_term` | text | Nullable |
| `gclid` / `fbclid` | text | Nullable |
| `landing_path` | text | Always `/go` for v1 |
| `user_agent` | text | Truncated |
| `ip_hash` | text | Optional hashed IP for abuse (no raw IP store) |
| `contacted_at` | timestamptz | Set when status → contacted |
| `notes` | text | Staff notes (optional v1) |

**Indexes:** `(company_id, created_at desc)`, `(company_id, status)`, `(company_id, phone)`.

**RLS**

- Anon: **no direct table access**. Insert only via `SECURITY DEFINER` RPC `submit_ad_campaign_enquiry(...)` that resolves `company_id` from slug `rk-solar` (or env company id).
- Authenticated: `SELECT` / `UPDATE` when profile has authority `view_ad_submissions` (or Admin) and same `company_id`.
- No public `SELECT`.

Migration file: `supabase/migrations/090_ad_campaign_submissions.sql` (next free number after `089`).

---

## 6. Auth & “another login”

### What “another login” means

Same Supabase project, **new UI route** `/ads/login`, not a second password store.

| User type | After login |
|-----------|-------------|
| Full CRM staff with `view_ad_submissions` | Can open `/ads` or CRM |
| Campaign-only staff (authority set = ads only) | Forced to `/ads`; blocked from dashboard routes |
| Unauthenticated | `/go` ok; `/ads` → `/ads/login` |

### Implementation notes

- Reuse existing email/password sign-in helpers; duplicate a slim login client for ads branding.
- Add authority key `view_ad_submissions` in `authorities` catalog + seed for `admin` / `sales_manager` (and document how to grant a campaign-only profile).
- Middleware updates:
  - Public: `/go`, `/api/ads/submit`
  - Ads auth page: `/ads/login` (logged-out only)
  - `/ads` and `/ads/export` require session
  - Optional: if user lacks CRM home access but has ads authority, redirect `/` and `/login` success → `/ads`

---

## 7. Landing page design (v1)

### Design direction

- **Brand first:** “RK Bhabhor” as hero-level wordmark (text-only; no fake logo).
- **One composition** above the fold: brand + one headline + one short line + CTA group + full-bleed visual.
- **Palette:** `#3158a6` (navy/blue), `#e87a1a` (accent), white / soft blue `#E8F0FA` — **not** purple gradients, cream-serif, or dark neon.
- **Type:** existing display + body fonts from `app/layout.tsx` (no Inter/Roboto default stack).
- **Motion:** 2–3 intentional (hero fade/rise, CTA subtle, form focus) — no noise.
- **Responsive:** phone-first; form usable with thumb; sticky mobile CTA to scroll to form if form is below fold.
- **Cards:** none in hero; form is the only interactive card-like container.

### Section map (keep lean)

1. **Hero** — full-bleed home/roof visual (`/brand/cover-home.jpg` or campaign crop), brand, headline from brand tokens (`heroLine1–3` / cover tagline), primary CTA “Get free quote”, secondary “Call” if phone configured.
2. **Trust strip** — 3 short proofs (e.g. Design · Supply · Install · Commission from `BRAND.services`) — typography only, no icon circus.
3. **Why solar** — 3–4 benefits from `BRAND.benefits` (single column on mobile).
4. **Enquiry form** — name*, phone*, city, capacity interest, optional message; honeypot field.
5. **Footer** — company name, powered-by line, privacy one-liner.

### Copy defaults (editable constants in `lib/ads/landing-copy.ts`)

- Headline: align with `ENERGIZE TODAY, SAVE MORE TOMORROW.`
- Sub: `Smart Solar Solutions for a Sustainable Future.`
- Form title: `Get a free rooftop quote`
- Success: `Thanks — our team will call you shortly.`

**Gap:** `BRAND.contact` phone/address are currently blank. Landing CTAs that need a phone number use `NEXT_PUBLIC_ADS_PHONE` (optional). If unset, hide Call CTA; form still works.

### Form fields (public)

| Field | Required |
|-------|----------|
| Name | Yes |
| Phone (10-digit IN) | Yes |
| City | No (recommended) |
| System size interest | No |
| Message | No |
| `website` honeypot | Must stay empty |

Hidden: UTMs + click ids from URL search params.

---

## 8. Inbox + CSV

### Inbox UI (`/ads`)

- Minimal shell: RK Bhabhor mark, “Ad enquiries”, Sign out — **no CRM sidebar**.
- Table columns: Date, Name, Phone, City, Campaign, Source (utm), Status, Actions.
- Filters: status, date range, text search (name/phone).
- Row action: mark Contacted / Junk / New.
- Empty state when no rows.

### CSV export

- Route: `GET /ads/export?…same filters`
- Filename: `rk-bhabhor-ad-enquiries-YYYYMMDD.csv`
- Columns: all submission fields useful for Meta/Google follow-up (id, created_at, name, phone, email, city, capacity_interest, message, status, campaign, utms, click ids).
- UTF-8 BOM for Excel; escape quotes.
- Auth + `view_ad_submissions` required.

---

## 9. File plan (implementation map)

| Area | Paths |
|------|--------|
| Migration | `supabase/migrations/090_ad_campaign_submissions.sql` |
| Domain | `src/lib/ads/types.ts`, `landing-copy.ts`, `phone.ts` |
| Public UI | `src/app/go/page.tsx`, `src/components/ads/landing-page.tsx`, `landing-form.tsx` |
| API | `src/app/api/ads/submit/route.ts` |
| Ads auth | `src/app/ads/login/page.tsx` (+ client) |
| Inbox | `src/app/ads/page.tsx`, `src/components/ads/inbox-table.tsx`, `status-actions.tsx` |
| Export | `src/app/ads/export/route.ts` |
| Authz | `src/lib/domain/authorities.ts` + migration seed |
| Middleware | `src/lib/supabase/middleware.ts` — public `/go`, `/api/ads/submit`, `/ads/login` |
| Brand | Reuse `BRAND` colors; optional `lib/ads/brand.ts` thin re-export |

Do **not** wire this into CRM nav in v1 (keeps campaign surface separate). Optional later: dashboard link “Ad enquiries” for managers who have the authority.

---

## 10. Build slices

| Slice | Deliverable | Done when |
|-------|-------------|-----------|
| **A — Schema** | Migration `090` + RPC + RLS + authority seed | SQL applies cleanly on RK Supabase |
| **B — Public landing** | `/go` layout + form + submit API | Mobile + desktop look good; successful insert; honeypot rejected |
| **C — Ads login + gate** | `/ads/login`, middleware, authority check | Campaign-only user reaches `/ads` only |
| **D — Inbox** | List, filter, status updates | Staff sees new rows; status persists |
| **E — CSV** | Export route | Excel opens file; filters respected |
| **F — Ship** | Sync Deliverables + deploy when asked | Live on `rksolar.zonicks.com/go` |

After each behaviour slice: scoped QA per `playbooks/feature-qa-gate.md` (anon key + user logins only; never service role). Paste report in the reply.

---

## 11. QA checklist (v1)

| ID | Case | Expect |
|----|------|--------|
| Q1 | `GET /go` logged out | 200, landing page |
| Q2 | Submit valid form | 200, thank-you, row `status=new` |
| Q3 | Submit empty phone | 400 validation |
| Q4 | Honeypot filled | Soft success or 400; **no** row |
| Q5 | UTM on URL | Stored on row |
| Q6 | `/ads` logged out | Redirect `/ads/login` |
| Q7 | Login without authority | Denied / no data |
| Q8 | Login with authority | Inbox lists rows |
| Q9 | Mark contacted | Status + timestamp |
| Q10 | CSV export | Download + correct columns |
| Q11 | Campaign-only user hits `/pipeline` | Redirect or 403 — not CRM shell |

---

## 12. Ad ops handoff

**Suggested Meta/Google final URL**

```text
https://rksolar.zonicks.com/go?utm_source=meta&utm_medium=paid&utm_campaign=rooftop_2026&campaign=meta_rooftop
```

**UTM discipline:** always set `utm_source`, `utm_medium`, `utm_campaign`; optional `campaign` label for inbox grouping.

**Staff setup:** create Supabase Auth user → profile on RK company → grant `view_ad_submissions` (and nothing else for pure campaign role).

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Blank company phone/address weakens trust | Env phone + honest “we’ll call you” copy; no fake address |
| Bot spam | Honeypot + rate limit by IP hash + phone uniqueness window (e.g. 1 submit / phone / 10 min) |
| Staff confuse ads login with CRM | Distinct `/ads/login` visual; short subtitle “Ad enquiries only” |
| Portrait stamp / CRM chrome leak into landing | Landing uses its own layout; no dashboard providers |
| Page overflow on small phones | Form below hero on mobile; sticky “Get quote” bar |

---

## 14. Success criteria

- Paid traffic lands on a page that passes the **brand test** (remove nav → still clearly RK Bhabhor).
- A non-technical campaign user can log into `/ads`, see today’s enquiries, and download CSV without opening the CRM.
- Zero CRM lead pollution from ads until Phase 2 promote exists.
- One sync → one deploy ships landing + inbox together.

---

## 15. Open inputs (non-blocking)

These can ship with placeholders; replace when client supplies:

1. Public phone for Call CTA (`NEXT_PUBLIC_ADS_PHONE`).
2. Exact hero photograph crop (fallback: existing `cover-home.jpg`).
3. Campaign-only user email list for first grants.
4. Preferred default capacity options wording (Gujarati bilingual later — English-only in v1).

---

## 16. Implementation kickoff command

When approved to build: start **Slice A**, then **B → C → D → E**, then sync/deploy only if requested. Do not invent CRM stages or auto-Won paths for these rows.
