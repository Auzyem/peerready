# ScholarLens V2 — Phase 1 (Additive) Design

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan
**Source:** `peerready-v2-upgrade-prompt.md` (8-upgrade spec), reconciled against the live codebase.

## Context

The V2 upgrade prompt bundles 8 independent subsystems. Several were written against
assumptions that do not match the current codebase and would, if applied verbatim:

- **Clobber migrations** — the spec writes `002`–`005`, but `002_adversarial_status` …
  `005_reporting_check` already exist.
- **Duplicate the progress system** — the spec introduces a `review_number` model, but
  draft-to-draft progress already works via `version_number` in
  `lib/ai/pipeline.ts → runProgressComparison`, persisted to `review_sessions.score_delta`.
- **Contradict the on-demand architecture** — adversarial / journals / reporting run as
  separate on-demand routes (`/api/review/{adversarial,journals,reporting}/start`), not
  inline pipeline stages.
- **Replace working UI** — the app is Tailwind/shadcn; the spec ships raw inline-style
  components and a full CSS-variable design-system swap.
- **Edit the wrong files / link to nonexistent routes** — the review page renders
  `<ReviewDashboard>` (tabs live there); the spec references `/api/review/run`,
  `/api/manuscripts/[id]/upload`, a `send-report-email` edge function, `/analytics`,
  `/reviews`, `/settings/profile` — none of which exist.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| First-pass scope | **Additive-only:** PDF reports (U4) + SaaS plans (U7) + Stripe billing (U8) |
| Migration numbering | New migrations are `006`+ |
| New component styling | **Tailwind/shadcn** (match app); design-system swap deferred |
| Send-to-author email | **Deferred** (no `shared_reports`, no email provider) |
| Stripe depth | **Full code**; user wires Stripe products/prices/env/webhook |
| Plan gates | **Passive / non-blocking**; backfill free subscriptions; no 403/429 wired into routes |

**Deferred to later cycles:** U1 CSS design system, U2 sidebar redesign, U3 vertical section
nav, U5 review-page layout assembly, U1-logic/U6 `review_number` sequencing + stages API,
send-to-author email.

## Scope (this cycle)

PDF reports (U4) + SaaS plans (U7) + Stripe billing (U8).

---

## 1. Database — migrations `006` & `007`

### `supabase/migrations/006_saas_scaffold.sql`
- `plans` table, seeded: `free`, `starter`, `pro`, `team` (feature flags + limits as in spec U7A).
- `subscriptions` table — RLS `users_own_subscription`.
- `user_roles` table — RLS `admins_manage_roles` + `users_read_own_role`.
- `handle_new_subscription()` trigger on `public.profiles` insert → inserts a `free` subscription.
- **Backfill:** insert a `free` subscription for every existing `profiles` row
  (`on conflict do nothing`). The spec's trigger only fires for new signups; existing users
  would otherwise have no subscription row.

### `supabase/migrations/007_stripe_fields.sql`
- `alter table subscriptions add` `stripe_price_id`, `billing_interval`
  (`check in ('monthly','annual')`), `cancel_at_period_end` (default false), `trial_end`.
- `billing_events` audit table (unique `stripe_event_id`) — RLS admin-read only.

**Dropped from spec:** `shared_reports` table (email deferred).

**Prerequisite (per project memory):** ensure `public` is an exposed schema in Supabase API
settings before relying on PostgREST access to new tables.

---

## 2. PDF reports (U4)

### `lib/pdf/ReviewReport.tsx`
- `@react-pdf/renderer` document component.
- **Decoupled from `review_number` and `compared_to_session`** (deferred features; columns
  don't exist). Header reads "ScholarLens — Review Report".
- Pages: (1) Cover + Overview (summary grid, strengths/weaknesses, score breakdown, inline
  annotations), (2) Adversarial, (3) Journals, (4) Progress — **rendered only when
  `session.score_delta` is present** (already populated by the existing pipeline).
- **Fonts: built-in Helvetica.** Remote-fetched Inter (spec U4B) is the leading cause of
  `@react-pdf` timeouts on Vercel serverless. Bundling Inter is a future enhancement.
- Types come from `lib/types` (`Score`, `Annotation`, `AdversarialCritique`, `JournalMatch`,
  `ProgressComparatorResult`). Verdict/severity colour maps inline in the PDF stylesheet.

### `app/api/pdf/[sessionId]/route.ts`
- `GET` only. Auth via `createClient()`; RLS scopes the row to the owner.
- `renderToBuffer(createElement(ReviewPDFDocument, …))`, `export const maxDuration = 60`.
- Select mirrors the status/export selects (the "three select sites" rule):
  `scores, annotations, adversarial_critiques, journal_matches, reporting_checklist_items,
  drafts(manuscripts(title, abstract))`.
- Returns `Content-Type: application/pdf`, `Content-Disposition: inline`.
- **No `DELETE`** — PDFs are generated on-demand; nothing is persisted to delete.

### `components/review/PdfReportModal.tsx`
- **Tailwind/shadcn.** View (iframe preview of the generated blob) + Download + Print.
- **No email-send, no delete** (deferred / not applicable).

### Wiring
- "PDF report" button added to the **existing `ReviewDashboard` header**, beside the
  "Download .xlsx" button (the vertical-nav review layout U5 is deferred).

---

## 3. SaaS + Stripe (U7/U8)

### `lib/stripe/client.ts`
- Stripe singleton (`apiVersion` per installed `stripe` package), `STRIPE_PRICES` map,
  `getPriceId(planId, interval)`.

### `lib/plan/gates.ts`
- `checkPlanGate(userId, feature)` and `checkReviewLimit(userId)`.
- **Bug fix vs spec:** the spec's nested `.in('draft_id', supabase.from(...).select())`
  does not work in supabase-js. Replace with explicit two-step queries (fetch manuscript
  ids → draft ids → count sessions).
- Built and exported, but **not invoked from review/PDF routes** this cycle (passive).

### API routes
- `app/api/billing/checkout/route.ts` — create/reuse Stripe customer, create Checkout Session.
- `app/api/billing/portal/route.ts` — Billing Portal session.
- `app/api/billing/webhook/route.ts` — verify signature, idempotency via `billing_events`,
  handle `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
  `invoice.payment_failed`; sync to `subscriptions`. **Uses existing `createAdminClient()`**
  (service role) rather than a fresh client. Reads raw body via `request.text()` — no
  App-Router `bodyParser` config required.
- `app/api/billing/current/route.ts` — returns the caller's plan/status/period/interval.

### UI
- `app/(dashboard)/billing/page.tsx` — **Tailwind/shadcn** plan cards, monthly/annual toggle,
  current-plan banner, "Manage billing" (portal) button, success/cancel toasts from query params.
- `components/billing/UpgradePrompt.tsx` — **Tailwind** reusable nudge; built and ready
  (not yet surfaced anywhere, since gates are passive).
- `components/layout/Sidebar.tsx` — add a single "Billing" link (no redesign).

### Config
- `.env.local.example` — Stripe secret/publishable/webhook keys + 6 price IDs.
- `vercel.json` — `maxDuration` for `app/api/pdf/[sessionId]/route.ts` (60) and
  `app/api/billing/webhook/route.ts` (30); preserve any existing entries.
- Dependencies: `npm install @react-pdf/renderer date-fns stripe @stripe/stripe-js`.

---

## Verification

- **Gate every commit on `npm run build`** (project house rule — `npm test` is lenient).
- Migrations apply cleanly on top of `001`–`005`.
- `/api/billing/current` returns `free` for an existing user (post-backfill).
- Billing page renders all four plans and the interval toggle.
- PDF renders for a completed session (Overview + Adversarial + Journals; Progress only when
  `score_delta` present) without serverless font timeouts.
- No existing free-user behavior changes (gates passive).

## Out of scope / follow-up cycles

1. Design system (U1 CSS) + sidebar redesign (U2) + vertical section nav (U3) + review-page
   layout assembly (U5) — adapted to Tailwind.
2. `review_number` sequencing + stages API (U1-logic / U6), reconciled with the existing
   `version_number` progress model (decide: replace vs. coexist).
3. Send-to-author email (`shared_reports` + email provider).
4. Flip plan-gate enforcement on (403/429) when ready to monetize.

## Manual setup (user, before Stripe goes live)

Create products + monthly/annual prices in Stripe; copy price IDs + keys into env; register
the webhook endpoint for the five events above; enable the Customer Portal. (Spec §8K.)
