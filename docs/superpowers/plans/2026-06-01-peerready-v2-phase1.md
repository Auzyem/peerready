# ScholarLens V2 — Phase 1 (Additive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF review reports, a SaaS plan/subscription scaffold, and a full Stripe billing integration to ScholarLens — additively, without changing existing free-user behavior.

**Architecture:** New Supabase migrations (`006`, `007`) add `plans`/`subscriptions`/`user_roles`/`billing_events`. A `@react-pdf/renderer` document renders completed review sessions to PDF via a new `GET /api/pdf/[sessionId]` route, surfaced by a Tailwind modal wired into the existing `ReviewDashboard`. Stripe checkout/portal/webhook routes sync subscription state to Supabase. A passive plan-gate library + `UpgradePrompt` component are built but **not** wired into existing routes this cycle.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (SSR + service-role), Tailwind + shadcn, `@react-pdf/renderer`, `date-fns`, `stripe`, `@stripe/stripe-js`, Vitest (node).

**Source spec:** `docs/superpowers/specs/2026-06-01-peerready-v2-phase1-design.md`. Original upgrade prompt: `c:\Users\emm24\Downloads\peerready-v2-upgrade-prompt.md`.

**House rules (from project memory):**
- Gate every commit on `npm run build` (`npm test` is lenient — never rely on it alone).
- New review-session relations must appear in **all** select sites (status route, export route, and now the PDF route).
- Supabase: ensure `public` is an exposed schema before relying on new tables via PostgREST.

---

## File Structure

**Create:**
- `supabase/migrations/006_saas_scaffold.sql` — plans, subscriptions, user_roles, trigger, backfill
- `supabase/migrations/007_stripe_fields.sql` — subscription Stripe columns + billing_events
- `lib/stripe/client.ts` — Stripe singleton + price-ID map + pure mapping helpers
- `lib/plan/gates.ts` — `checkPlanGate`, `checkReviewLimit`, pure `isFeatureAllowed`
- `lib/pdf/ReviewReport.tsx` — `@react-pdf/renderer` document
- `app/api/pdf/[sessionId]/route.ts` — PDF GET
- `app/api/billing/current/route.ts` — current plan GET
- `app/api/billing/checkout/route.ts` — checkout POST
- `app/api/billing/portal/route.ts` — portal POST
- `app/api/billing/webhook/route.ts` — Stripe webhook POST
- `components/review/PdfReportModal.tsx` — Tailwind PDF modal
- `components/billing/UpgradePrompt.tsx` — Tailwind upgrade nudge
- `app/(dashboard)/billing/page.tsx` — billing page
- `tests/stripeClient.test.ts` — price-map + mapping helpers
- `tests/planGates.test.ts` — `isFeatureAllowed`
- `tests/pdfReport.test.tsx` — PDF renders to a buffer

**Modify:**
- `package.json` — add 4 deps (via `npm install`)
- `vitest.config.ts` — add React plugin + include `.tsx` tests (for the PDF render test)
- `vercel.json` — add `maxDuration` for pdf + webhook routes
- `.env.local.example` — append Stripe vars
- `components/review/ReviewDashboard.tsx` — add "PDF report" button + modal state
- `components/layout/Sidebar.tsx` — add "Billing" link

---

## Task 1: Install dependencies and update config

**Files:**
- Modify: `package.json` (via npm), `vercel.json`, `.env.local.example`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @react-pdf/renderer date-fns stripe @stripe/stripe-js
```
Expected: 4 packages added, no peer-dependency errors that fail install.

- [ ] **Step 2: Update `vercel.json` to add function durations (preserve existing entry)**

Replace the entire file with:
```json
{
  "functions": {
    "app/api/review/start/route.ts": {
      "maxDuration": 300
    },
    "app/api/pdf/[sessionId]/route.ts": {
      "maxDuration": 60
    },
    "app/api/billing/webhook/route.ts": {
      "maxDuration": 30
    }
  }
}
```

- [ ] **Step 3: Append Stripe env vars to `.env.local.example`**

Append these lines to the existing file (keep the current 5 lines):
```bash

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs — create these in your Stripe dashboard
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_TEAM_ANNUAL=price_...
```

- [ ] **Step 4: Update `vitest.config.ts` for JSX + `.tsx` tests**

The PDF render test (Task 7) imports `lib/pdf/ReviewReport.tsx`, which uses JSX without
importing React. Esbuild's default classic transform would fail ("React is not defined"),
and the current `include` glob only matches `.test.ts`. Replace `vitest.config.ts` with:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```
(`@vitejs/plugin-react` is already a devDependency.)

- [ ] **Step 5: Verify build still passes**

Run: `npm run build`
Expected: Build succeeds (new deps installed, no code yet referencing them).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vercel.json .env.local.example
git commit -m "chore: add PDF + Stripe deps and function config"
```

---

## Task 2: Migration 006 — SaaS scaffold

**Files:**
- Create: `supabase/migrations/006_saas_scaffold.sql`

**Note (reconciliation):** The original spec's `admins_manage_roles` RLS policy queries `user_roles` from within a policy *on* `user_roles`, which causes Postgres RLS infinite recursion. Since no admin UI exists this cycle, we keep only the self-read policy; role management happens via the service-role client out-of-band.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_saas_scaffold.sql`:
```sql
-- Plans
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_monthly numeric,
  price_annual numeric,
  max_manuscripts integer,
  max_reviews_per_month integer,
  adversarial_access boolean default false,
  journal_matching boolean default false,
  pdf_reports boolean default false,
  team_members integer default 1,
  api_access boolean default false,
  created_at timestamptz default now()
);

insert into public.plans
  (id, name, price_monthly, price_annual, max_manuscripts, max_reviews_per_month, adversarial_access, journal_matching, pdf_reports) values
  ('free',    'Free',    0,  0,   3,    2,    false, false, false),
  ('starter', 'Starter', 12, 96,  20,   10,   false, true,  true),
  ('pro',     'Pro',     29, 228, 100,  30,   true,  true,  true),
  ('team',    'Team',    79, 636, null, null, true,  true,  true)
on conflict (id) do nothing;

-- Subscriptions
create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique,
  plan_id text references public.plans(id) default 'free',
  status text check (status in ('active','trialing','past_due','canceled','free')) default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;
create policy "users_own_subscription" on public.subscriptions for all using (auth.uid() = user_id);

-- Auto-create a free subscription whenever a profile is created
create or replace function public.handle_new_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.handle_new_subscription();

-- Backfill: give every existing profile a free subscription (trigger only fires for new rows)
insert into public.subscriptions (user_id, plan_id, status)
select id, 'free', 'free' from public.profiles
on conflict (user_id) do nothing;

-- Admin roles (managed via service role; no self-referential RLS to avoid recursion)
create table if not exists public.user_roles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('super_admin','admin','reviewer','author')) default 'author',
  created_at timestamptz default now(),
  unique(user_id, role)
);

alter table public.user_roles enable row level security;
create policy "users_read_own_role" on public.user_roles for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: `006_saas_scaffold.sql` applies cleanly; `plans` has 4 rows; existing profiles each have a `free` subscription row.

If `supabase` CLI is unavailable, run the SQL in the Supabase SQL editor. After applying, reload the PostgREST schema cache (Supabase: Settings → API → reload, or it reloads automatically).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_saas_scaffold.sql
git commit -m "feat: SaaS scaffold migration (plans, subscriptions, user_roles)"
```

---

## Task 3: Migration 007 — Stripe fields

**Files:**
- Create: `supabase/migrations/007_stripe_fields.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/007_stripe_fields.sql`:
```sql
alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists billing_interval text check (billing_interval in ('monthly','annual')),
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists trial_end timestamptz;

create table if not exists public.billing_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  stripe_event_id text unique not null,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz default now()
);

alter table public.billing_events enable row level security;
-- Reading user_roles from a policy on billing_events is fine (no recursion).
create policy "admins_read_billing_events" on public.billing_events for select using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('super_admin','admin'))
);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: `subscriptions` has the 4 new columns; `billing_events` exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_stripe_fields.sql
git commit -m "feat: Stripe fields + billing_events migration"
```

---

## Task 4: Stripe client singleton + mapping helpers

**Files:**
- Create: `lib/stripe/client.ts`
- Test: `tests/stripeClient.test.ts`

**Note (reconciliation):** `apiVersion` is intentionally omitted so the SDK uses its pinned default — pinning a literal that doesn't match the installed SDK's union type breaks the TS build. The mapping helpers (`planIdFromPriceId`, `intervalFromPriceId`) live here (not in the webhook) so they're pure and unit-testable.

- [ ] **Step 1: Write the failing test**

Create `tests/stripeClient.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('stripe price mapping', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_sm'
    process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_sa'
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pm'
    process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pa'
    process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_tm'
    process.env.STRIPE_PRICE_TEAM_ANNUAL = 'price_ta'
  })

  it('maps planId + interval to a price id', async () => {
    const { getPriceId } = await import('@/lib/stripe/client')
    expect(getPriceId('pro', 'monthly')).toBe('price_pm')
    expect(getPriceId('starter', 'annual')).toBe('price_sa')
  })

  it('maps a price id back to a plan id', async () => {
    const { planIdFromPriceId } = await import('@/lib/stripe/client')
    expect(planIdFromPriceId('price_pa')).toBe('pro')
    expect(planIdFromPriceId('unknown')).toBe('free')
  })

  it('derives the interval from a price id', async () => {
    const { intervalFromPriceId } = await import('@/lib/stripe/client')
    expect(intervalFromPriceId('price_ta')).toBe('annual')
    expect(intervalFromPriceId('price_pm')).toBe('monthly')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stripeClient.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stripe/client'`.

- [ ] **Step 3: Write the implementation**

Create `lib/stripe/client.ts`:
```ts
import Stripe from 'stripe'

// apiVersion omitted on purpose — let the SDK use its pinned default so we don't
// fight a literal-type mismatch on build. Configure the version in the Stripe dashboard.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  typescript: true,
})

// Price ID map — keyed by `${planId}_${interval}`.
export const STRIPE_PRICES: Record<string, string | undefined> = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
  team_annual: process.env.STRIPE_PRICE_TEAM_ANNUAL,
}

export function getPriceId(planId: string, interval: 'monthly' | 'annual'): string {
  const key = `${planId}_${interval}`
  const priceId = STRIPE_PRICES[key]
  if (!priceId) throw new Error(`No Stripe price ID configured for ${key}`)
  return priceId
}

export function planIdFromPriceId(priceId: string): string {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '__sm']: 'starter',
    [process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '__sa']: 'starter',
    [process.env.STRIPE_PRICE_PRO_MONTHLY ?? '__pm']: 'pro',
    [process.env.STRIPE_PRICE_PRO_ANNUAL ?? '__pa']: 'pro',
    [process.env.STRIPE_PRICE_TEAM_MONTHLY ?? '__tm']: 'team',
    [process.env.STRIPE_PRICE_TEAM_ANNUAL ?? '__ta']: 'team',
  }
  return map[priceId] ?? 'free'
}

export function intervalFromPriceId(priceId: string): 'monthly' | 'annual' {
  const annual = [
    process.env.STRIPE_PRICE_STARTER_ANNUAL,
    process.env.STRIPE_PRICE_PRO_ANNUAL,
    process.env.STRIPE_PRICE_TEAM_ANNUAL,
  ]
  return annual.includes(priceId) ? 'annual' : 'monthly'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stripeClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/client.ts tests/stripeClient.test.ts
git commit -m "feat: Stripe client singleton + price mapping helpers"
```

---

## Task 5: Plan-gate library

**Files:**
- Create: `lib/plan/gates.ts`
- Test: `tests/planGates.test.ts`

**Note (reconciliation):** The spec's nested `.in('draft_id', supabase.from(...).select())` is not valid supabase-js — replaced with explicit two-step id queries. `null` `max_reviews_per_month` (Team) means unlimited. The pure `isFeatureAllowed` is extracted for testing without mocking Supabase. These functions are built but **not** called from any route this cycle (gates are passive).

- [ ] **Step 1: Write the failing test**

Create `tests/planGates.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isFeatureAllowed } from '@/lib/plan/gates'

describe('isFeatureAllowed', () => {
  it('returns true only when the plan flag is exactly true', () => {
    expect(isFeatureAllowed({ pdf_reports: true }, 'pdf_reports')).toBe(true)
    expect(isFeatureAllowed({ pdf_reports: false }, 'pdf_reports')).toBe(false)
    expect(isFeatureAllowed({}, 'pdf_reports')).toBe(false)
    expect(isFeatureAllowed(null, 'adversarial_access')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/planGates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/plan/gates'`.

- [ ] **Step 3: Write the implementation**

Create `lib/plan/gates.ts`:
```ts
import { createClient } from '@/lib/supabase/server'

export type PlanFeature =
  | 'adversarial_access'
  | 'journal_matching'
  | 'pdf_reports'
  | 'api_access'

/** Pure predicate — unit-testable without Supabase. */
export function isFeatureAllowed(
  plan: Record<string, unknown> | null | undefined,
  feature: PlanFeature
): boolean {
  return plan?.[feature] === true
}

export async function checkPlanGate(
  userId: string,
  feature: PlanFeature
): Promise<{ allowed: boolean; plan: string; upgradeRequired?: string }> {
  const supabase = createClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, plans(*)')
    .eq('user_id', userId)
    .single()

  if (!data) return { allowed: false, plan: 'free', upgradeRequired: 'starter' }

  const plan = data.plans as Record<string, unknown> | null
  const allowed = isFeatureAllowed(plan, feature)

  return {
    allowed,
    plan: data.plan_id,
    upgradeRequired: allowed ? undefined : 'pro',
  }
}

export async function checkReviewLimit(
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const supabase = createClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, plans(max_reviews_per_month)')
    .eq('user_id', userId)
    .single()

  const plans = sub?.plans as { max_reviews_per_month: number | null } | null
  // No subscription row → treat as the free limit (2). null on a real plan → unlimited.
  const rawLimit = plans ? plans.max_reviews_per_month : 2
  if (rawLimit === null) {
    return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY }
  }
  const limit = rawLimit ?? 2

  // Two-step id resolution (supabase-js can't take a query builder in .in()).
  const { data: manuscripts } = await supabase
    .from('manuscripts')
    .select('id')
    .eq('user_id', userId)
  const manuscriptIds = (manuscripts ?? []).map((m) => m.id)
  if (manuscriptIds.length === 0) return { allowed: true, used: 0, limit }

  const { data: drafts } = await supabase
    .from('drafts')
    .select('id')
    .in('manuscript_id', manuscriptIds)
  const draftIds = (drafts ?? []).map((d) => d.id)
  if (draftIds.length === 0) return { allowed: true, used: 0, limit }

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('review_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())
    .in('draft_id', draftIds)

  const used = count ?? 0
  return { allowed: used < limit, used, limit }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/planGates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/gates.ts tests/planGates.test.ts
git commit -m "feat: passive plan-gate library"
```

---

## Task 6: PDF document component

**Files:**
- Create: `lib/pdf/ReviewReport.tsx`

**Note (reconciliation):** No `Font.register` — default Helvetica avoids serverless remote-font timeouts. Only `fontWeight` 400/700 are used (default Helvetica registers normal + bold only). No `review_number` / `compared_to_session` (deferred). The Progress page renders only when `session.score_delta` exists.

- [ ] **Step 1: Write the component**

Create `lib/pdf/ReviewReport.tsx`:
```tsx
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { ReviewSession } from '@/lib/types'

const NAVY = '#0D1B4B'
const TEAL = '#0E7C6B'
const TEAL_LIGHT = '#E6F4F1'
const GOLD = '#C57B00'
const GOLD_LIGHT = '#FEF3C7'
const RED = '#B91C1C'
const RED_LIGHT = '#FEE2E2'
const GREEN = '#15803D'
const GREEN_LIGHT = '#DCFCE7'
const MUTED = '#64748B'
const BORDER = '#E2E8F0'
const SURFACE = '#F8FAFC'

const styles = StyleSheet.create({
  page: { fontSize: 10, color: '#0F172A', backgroundColor: '#fff', padding: 0 },
  header: { backgroundColor: NAVY, padding: '24 32', flexDirection: 'row', alignItems: 'center' },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  body: { padding: '20 32' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` },
  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 6, padding: 12, border: `0.5px solid ${BORDER}` },
  summaryLabel: { fontSize: 9, color: MUTED, marginBottom: 3 },
  summaryValue: { fontSize: 18, fontWeight: 700, color: NAVY },
  summarySmall: { fontSize: 9, color: MUTED, marginTop: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', padding: '5 0', borderBottom: `0.5px solid ${BORDER}` },
  scoreLabel: { flex: 1, fontSize: 10, color: '#0F172A', textTransform: 'capitalize' },
  scoreBar: { width: 80, height: 4, backgroundColor: BORDER, borderRadius: 2, marginRight: 8 },
  scoreBarFill: { height: 4, borderRadius: 2, backgroundColor: TEAL },
  scoreValue: { fontSize: 10, fontWeight: 700, color: '#0F172A', width: 32, textAlign: 'right' },
  verdictBadge: { padding: '4 12', borderRadius: 4, fontSize: 10, fontWeight: 700, alignSelf: 'flex-start', marginTop: 4 },
  annoCard: { backgroundColor: SURFACE, borderRadius: 4, padding: '8 10', marginBottom: 6, borderLeft: `3px solid ${BORDER}` },
  annoTitle: { fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 2 },
  annoBody: { fontSize: 9, color: MUTED, textTransform: 'capitalize' },
  critiqueCard: { border: `0.5px solid ${BORDER}`, borderRadius: 6, padding: 10, marginBottom: 8 },
  critiqueTitle: { fontSize: 10, fontWeight: 700, color: '#0F172A' },
  quoteBox: { backgroundColor: SURFACE, padding: '6 8', borderLeft: `2px solid ${BORDER}`, marginBottom: 6 },
  quoteText: { fontSize: 9, color: MUTED, fontStyle: 'italic' },
  fixBox: { backgroundColor: GREEN_LIGHT, padding: '6 8', borderRadius: 4, marginTop: 6 },
  fixText: { fontSize: 9, color: GREEN },
  journalCard: { flexDirection: 'row', alignItems: 'center', padding: '8 10', border: `0.5px solid ${BORDER}`, borderRadius: 6, marginBottom: 6 },
  journalRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EBF5FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  journalName: { fontSize: 11, fontWeight: 700, color: '#0F172A' },
  journalMeta: { fontSize: 9, color: MUTED },
  fitBadge: { fontSize: 9, padding: '2 6', borderRadius: 99 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', padding: '5 0', borderBottom: `0.5px solid ${BORDER}` },
  deltaLabel: { flex: 1, fontSize: 10, color: MUTED, textTransform: 'capitalize' },
  deltaPill: { fontSize: 9, padding: '2 6', borderRadius: 99 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, flexDirection: 'row', borderTop: `0.5px solid ${BORDER}`, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED, flex: 1 },
})

function verdictStyle(verdict: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    accept: { bg: GREEN_LIGHT, color: GREEN, label: 'Accept' },
    minor_revision: { bg: '#EBF5FF', color: '#1A56DB', label: 'Minor revision' },
    major_revision: { bg: GOLD_LIGHT, color: GOLD, label: 'Major revision' },
    reject: { bg: RED_LIGHT, color: RED, label: 'Reject' },
  }
  return map[verdict] ?? { bg: SURFACE, color: MUTED, label: verdict || '—' }
}

function severityColor(severity: string) {
  if (severity === 'critical') return RED
  if (severity === 'major') return GOLD
  return '#94A3B8'
}

export interface ReviewPdfProps {
  session: ReviewSession & {
    drafts?: { manuscripts?: { title?: string; abstract?: string } }
  }
  generatedAt: string
}

export function ReviewPDFDocument({ session, generatedAt }: ReviewPdfProps) {
  const v = verdictStyle(session.verdict ?? '')
  const title = session.drafts?.manuscripts?.title ?? 'Untitled manuscript'
  const scores = session.scores ?? []
  const annotations = session.annotations ?? []
  const critiques = session.adversarial_critiques ?? []
  const journals = session.journal_matches ?? []
  const totalScore = scores.reduce((s, x) => s + (x.score ?? 0), 0)
  const delta = session.score_delta

  return (
    <Document title={`ScholarLens Review — ${title}`} author="ScholarLens AI">
      {/* PAGE 1: OVERVIEW */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>ScholarLens — Review report</Text>
            <Text style={styles.headerSub}>{title}</Text>
            <Text style={[styles.headerSub, { marginTop: 4 }]}>Generated {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Overall score</Text>
              <Text style={styles.summaryValue}>{totalScore}<Text style={{ fontSize: 12, color: MUTED }}>/80</Text></Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Verdict</Text>
              <View style={[styles.verdictBadge, { backgroundColor: v.bg }]}>
                <Text style={{ color: v.color }}>{v.label}</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Annotations</Text>
              <Text style={styles.summaryValue}>{annotations.length}</Text>
              <Text style={styles.summarySmall}>{annotations.filter((a) => a.severity === 'critical').length} critical</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Adversarial issues</Text>
              <Text style={styles.summaryValue}>{critiques.length}</Text>
              <Text style={styles.summarySmall}>{critiques.filter((c) => c.severity === 'critical').length} critical</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: GREEN_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Greatest strength</Text>
                <Text style={{ fontSize: 10, color: '#0F172A' }}>{session.strength_summary ?? '—'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: RED_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: RED, marginBottom: 4 }}>Critical weakness</Text>
                <Text style={{ fontSize: 10, color: '#0F172A' }}>{session.weakness_summary ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score breakdown</Text>
            {scores.map((score) => (
              <View key={score.dimension} style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>{score.dimension.replace(/_/g, ' ')}</Text>
                <View style={styles.scoreBar}>
                  <View style={[styles.scoreBarFill, { width: `${(score.score / 10) * 100}%`, backgroundColor: score.score >= 7 ? TEAL : score.score >= 5 ? GOLD : RED }]} />
                </View>
                <Text style={styles.scoreValue}>{score.score}/10</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inline annotations</Text>
            {annotations.map((anno) => (
              <View key={anno.id} style={[styles.annoCard, { borderLeftColor: severityColor(anno.severity) }]}>
                <Text style={styles.annoTitle}>{anno.comment}</Text>
                <Text style={styles.annoBody}>{[anno.section, anno.severity, anno.suggestion].filter(Boolean).join(' · ')}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>ScholarLens · Review report · {title}</Text>
          <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* PAGE 2: ADVERSARIAL (only if critiques exist) */}
      {critiques.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: '#1e293b' }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Adversarial review</Text>
              <Text style={styles.headerSub}>Stress-test critique — {critiques.length} issues identified</Text>
            </View>
          </View>
          <View style={styles.body}>
            {critiques.map((critique) => (
              <View key={critique.id} style={styles.critiqueCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: severityColor(critique.severity) }} />
                  <Text style={styles.critiqueTitle}>{critique.title}</Text>
                  <View style={{ marginLeft: 'auto' }}>
                    <Text style={{ fontSize: 8, color: MUTED }}>{critique.section_reference}</Text>
                  </View>
                </View>
                {critique.quoted_passage ? (
                  <View style={styles.quoteBox}><Text style={styles.quoteText}>&quot;{critique.quoted_passage}&quot;</Text></View>
                ) : null}
                <Text style={{ fontSize: 9, color: '#0F172A', marginBottom: 6, lineHeight: 1.5 }}>{critique.objection}</Text>
                <View style={styles.fixBox}>
                  <Text style={{ fontSize: 8, fontWeight: 700, color: GREEN, marginBottom: 2 }}>To satisfy this objection:</Text>
                  <Text style={styles.fixText}>{critique.required_fix}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Adversarial review · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* PAGE 3: JOURNALS (only if matches exist) */}
      {journals.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: '#0C447C' }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Journal targets</Text>
              <Text style={styles.headerSub}>{journals.length} recommended submission targets ranked by fit</Text>
            </View>
          </View>
          <View style={styles.body}>
            {journals.map((journal) => {
              const fitColor = journal.acceptance_band === 'high' ? GREEN : journal.acceptance_band === 'medium' ? GOLD : RED
              const fitBg = journal.acceptance_band === 'high' ? GREEN_LIGHT : journal.acceptance_band === 'medium' ? GOLD_LIGHT : RED_LIGHT
              return (
                <View key={journal.id} style={styles.journalCard}>
                  <View style={styles.journalRank}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#1A56DB' }}>{journal.rank}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.journalName}>{journal.journal_name}</Text>
                    <Text style={styles.journalMeta}>{[journal.publisher, journal.impact_factor_range ? `IF ${journal.impact_factor_range}` : null, journal.avg_decision_days ? `~${journal.avg_decision_days} days` : null].filter(Boolean).join(' · ')}</Text>
                    {journal.key_change_required ? (
                      <Text style={[styles.journalMeta, { marginTop: 3, color: '#0F172A' }]}>{journal.key_change_required}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.fitBadge, { backgroundColor: fitBg }]}>
                    <Text style={{ color: fitColor }}>{Math.round((journal.fit_score ?? 0) * 100)}%</Text>
                  </View>
                </View>
              )
            })}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Journal targets · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* PAGE 4: PROGRESS (only if score_delta exists) */}
      {delta && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: TEAL }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Progress</Text>
              <Text style={styles.headerSub}>Score delta vs. the previous draft</Text>
            </View>
          </View>
          <View style={styles.body}>
            <View style={{ backgroundColor: TEAL_LIGHT, padding: 10, borderRadius: 6, marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: '#085041' }}>{delta.overall_summary}</Text>
            </View>
            <Text style={styles.sectionTitle}>Dimension changes</Text>
            {delta.dimension_changes?.map((d) => (
              <View key={d.dimension} style={styles.deltaRow}>
                <Text style={styles.deltaLabel}>{d.dimension.replace(/_/g, ' ')}</Text>
                <Text style={{ fontSize: 9, color: MUTED, marginRight: 8 }}>{d.v1_score} → {d.v2_score}</Text>
                <View style={[styles.deltaPill, { backgroundColor: d.direction === 'improved' ? GREEN_LIGHT : d.direction === 'regressed' ? RED_LIGHT : SURFACE }]}>
                  <Text style={{ color: d.direction === 'improved' ? GREEN : d.direction === 'regressed' ? RED : MUTED }}>
                    {d.delta > 0 ? '+' : ''}{d.delta}
                  </Text>
                </View>
              </View>
            ))}
            {delta.new_problems_introduced?.length ? (
              <View style={{ marginTop: 14, backgroundColor: RED_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 6 }}>New issues introduced in this revision</Text>
                {delta.new_problems_introduced.map((p, i) => (
                  <Text key={i} style={{ fontSize: 9, color: '#0F172A', marginBottom: 3 }}>• {p}</Text>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Progress report · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (component compiles; not yet imported anywhere — that's fine).

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/ReviewReport.tsx
git commit -m "feat: PDF review report document"
```

---

## Task 7: PDF API route

**Files:**
- Create: `app/api/pdf/[sessionId]/route.ts`
- Test: `tests/pdfReport.test.tsx`

- [ ] **Step 1: Write the failing test (PDF renders to a non-empty buffer)**

Create `tests/pdfReport.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReviewPDFDocument } from '@/lib/pdf/ReviewReport'
import type { ReviewSession } from '@/lib/types'

const session = {
  id: 's1', draft_id: 'd1', status: 'complete', mode: 'standard',
  verdict: 'minor_revision', overall_score: 62,
  strength_summary: 'Clear contribution.', weakness_summary: 'Thin related work.',
  created_at: new Date().toISOString(),
  scores: [{ id: 'sc1', session_id: 's1', dimension: 'originality', score: 8, max_score: 10 }],
  annotations: [{ id: 'a1', session_id: 's1', severity: 'major', comment: 'Clarify RQ', resolved: false }],
  adversarial_critiques: [],
  journal_matches: [],
  drafts: { manuscripts: { title: 'A Test Paper' } },
} as unknown as ReviewSession & { drafts?: { manuscripts?: { title?: string } } }

describe('ReviewPDFDocument', () => {
  it('renders a non-empty PDF buffer', async () => {
    const buffer = await renderToBuffer(
      createElement(ReviewPDFDocument, { session, generatedAt: '01 Jun 2026, 10:00' })
    )
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})
```

- [ ] **Step 2: Run test to verify it passes (component already exists from Task 6)**

Run: `npx vitest run tests/pdfReport.test.tsx`
Expected: PASS — confirms the document renders a real PDF (`%PDF` magic bytes).

If it FAILS with a font-weight error, that confirms a stray non-400/700 weight slipped into Task 6; fix the offending `fontWeight` and re-run.

- [ ] **Step 3: Write the route**

Create `app/api/pdf/[sessionId]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReviewPDFDocument } from '@/lib/pdf/ReviewReport'
import { createElement } from 'react'
import { format } from 'date-fns'
import type { ReviewSession } from '@/lib/types'

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS scopes the row to the owner. Select mirrors the status + export routes
  // (keep all review relations consistent across the three select sites).
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      scores(*),
      annotations(*),
      adversarial_critiques(*),
      journal_matches(*),
      reporting_checklist_items(*),
      drafts(manuscripts(title, abstract))
    `)
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm')
  const buffer = await renderToBuffer(
    createElement(ReviewPDFDocument, {
      session: session as unknown as ReviewSession & { drafts?: { manuscripts?: { title?: string; abstract?: string } } },
      generatedAt,
    })
  )

  const safeId = params.sessionId.replace(/[^a-zA-Z0-9-]/g, '')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="peerready-review-${safeId}.pdf"`,
    },
  })
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/pdf/[sessionId]/route.ts tests/pdfReport.test.tsx
git commit -m "feat: PDF report API route"
```

---

## Task 8: PDF report modal (Tailwind)

**Files:**
- Create: `components/review/PdfReportModal.tsx`

**Note (reconciliation):** Standard fixed-overlay modal (accessible, conventional). View + Download + Print only — no email, no delete. Uses `useEffect` to auto-load (the spec's `useState(() => …)` was a misuse).

- [ ] **Step 1: Write the component**

Create `components/review/PdfReportModal.tsx`:
```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { X, Download, Printer, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  sessionId: string
  manuscriptTitle: string
  onClose: () => void
}

export function PdfReportModal({ sessionId, manuscriptTitle, onClose }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPdf = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pdf/${sessionId}`)
      if (!res.ok) throw new Error(`Failed to generate PDF (${res.status})`)
      const blob = await res.blob()
      setPdfUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadPdf()
    return () => { setPdfUrl((u) => { if (u) URL.revokeObjectURL(u); return null }) }
  }, [loadPdf])

  function handleDownload() {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `peerready-review-${sessionId}.pdf`
    a.click()
  }

  function handlePrint() {
    if (!pdfUrl) return
    const w = window.open(pdfUrl)
    w?.addEventListener('load', () => w.print())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">PDF report — {manuscriptTitle}</span>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-muted/30 p-4">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="mb-2 h-6 w-6 animate-spin" />
              <span className="text-sm">Generating PDF…</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadPdf}>Retry</Button>
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title="PDF preview" className="h-full w-full rounded-md border bg-white" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button size="sm" onClick={handleDownload} disabled={!pdfUrl}>
            <Download className="h-4 w-4" /> Save PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!pdfUrl}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/PdfReportModal.tsx
git commit -m "feat: PDF report modal"
```

---

## Task 9: Wire PDF button into ReviewDashboard

**Files:**
- Modify: `components/review/ReviewDashboard.tsx`

- [ ] **Step 1: Add the import**

In `components/review/ReviewDashboard.tsx`, after the existing `import { ReportingChecklist } from './ReportingChecklist'` line, add:
```tsx
import { PdfReportModal } from './PdfReportModal'
```

- [ ] **Step 2: Add modal state**

Immediately after the line `const [selectedGuideline, setSelectedGuideline] = useState<ReportingGuidelineId | null>(null)`, add:
```tsx
  const [showPdf, setShowPdf] = useState(false)
```

- [ ] **Step 3: Add the PDF button + modal to the completed-review header**

Find this block (the completed-review header, near the end of the component):
```tsx
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button asChild variant="outline" className="ml-auto">
          <a href={`/api/export/${sessionId}`} download>Download .xlsx</a>
        </Button>
      </div>
```
Replace it with:
```tsx
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button variant="outline" className="ml-auto" onClick={() => setShowPdf(true)}>
          PDF report
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/export/${sessionId}`} download>Download .xlsx</a>
        </Button>
      </div>
      {showPdf && (
        <PdfReportModal
          sessionId={sessionId}
          manuscriptTitle={
            (session as unknown as { drafts?: { manuscripts?: { title?: string } } })
              .drafts?.manuscripts?.title ?? 'Review'
          }
          onClose={() => setShowPdf(false)}
        />
      )}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/review/ReviewDashboard.tsx
git commit -m "feat: surface PDF report button in review dashboard"
```

---

## Task 10: Billing — current plan route

**Files:**
- Create: `app/api/billing/current/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/billing/current/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, billing_interval, trial_end')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    plan: sub?.plan_id ?? 'free',
    status: sub?.status ?? 'free',
    periodEnd: sub?.current_period_end ?? null,
    cancelAtEnd: sub?.cancel_at_period_end ?? false,
    interval: sub?.billing_interval ?? 'monthly',
    trialEnd: sub?.trial_end ?? null,
  })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/current/route.ts
git commit -m "feat: billing current-plan route"
```

---

## Task 11: Billing — checkout route

**Files:**
- Create: `app/api/billing/checkout/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/billing/checkout/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, getPriceId } from '@/lib/stripe/client'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planId, interval = 'monthly' } = await request.json()
  if (planId === 'free') {
    return NextResponse.json({ error: 'Cannot checkout the free plan' }, { status: 400 })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  let customerId = sub?.stripe_customer_id ?? undefined

  if (!customerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', user.id)
  }

  let priceId: string
  try {
    priceId = getPriceId(planId, interval as 'monthly' | 'annual')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid plan' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?canceled=true`,
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan_id: planId },
      ...(planId === 'pro' ? { trial_period_days: 7 } : {}),
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { address: 'auto' },
    metadata: { supabase_user_id: user.id, plan_id: planId, interval },
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/checkout/route.ts
git commit -m "feat: Stripe checkout route"
```

---

## Task 12: Billing — portal route

**Files:**
- Create: `app/api/billing/portal/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/billing/portal/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'

export async function POST(_request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/billing`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/portal/route.ts
git commit -m "feat: Stripe customer portal route"
```

---

## Task 13: Billing — webhook route

**Files:**
- Create: `app/api/billing/webhook/route.ts`

**Note (reconciliation):** Uses the existing `createAdminClient()` (service role) rather than instantiating a new client. Reads the raw body via `request.text()` — App Router route handlers expose it directly; no `bodyParser` config needed. Version-drifting Stripe fields (`current_period_end`, `cancel_at_period_end`, `trial_end`, `invoice.subscription`) are read through a local intersection type to stay build-safe across SDK versions.

- [ ] **Step 1: Write the route**

Create `app/api/billing/webhook/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe, planIdFromPriceId, intervalFromPriceId } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'

// Stripe SDK type drift: these fields exist at runtime but may not be on the
// pinned Subscription type. Intersect to read them build-safely.
type SubWithPeriod = Stripe.Subscription & {
  current_period_end: number
  cancel_at_period_end: boolean
  trial_end: number | null
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id
  if (!userId) return

  const s = subscription as SubWithPeriod
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  const planId = planIdFromPriceId(priceId)
  const interval = intervalFromPriceId(priceId)

  const status =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'canceled'
      ? 'canceled'
      : 'past_due'

  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      plan_id: planId,
      status,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      billing_interval: interval,
      current_period_end: new Date(s.current_period_end * 1000).toISOString(),
      cancel_at_period_end: s.cancel_at_period_end,
      trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id
  if (!userId) return
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin
    .from('subscriptions')
    .update({
      plan_id: 'free',
      status: 'free',
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  // Idempotency — skip events we've already processed.
  const { data: existing } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single()
  if (existing) return NextResponse.json({ ok: true, skipped: true })

  await supabaseAdmin.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    user_id: (event.data.object as { metadata?: { supabase_user_id?: string } })?.metadata?.supabase_user_id ?? null,
  })

  switch (event.type) {
    case 'checkout.session.completed': {
      const sessionObj = event.data.object as Stripe.Checkout.Session
      if (sessionObj.mode === 'subscription' && sessionObj.subscription) {
        const sub = await stripe.subscriptions.retrieve(sessionObj.subscription as string)
        await syncSubscription(sub)
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await syncSubscription(event.data.object as Stripe.Subscription)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        await syncSubscription(sub)
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. If the build errors on a Stripe field type, widen `SubWithPeriod` / the `invoice` cast rather than changing runtime behavior.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/webhook/route.ts
git commit -m "feat: Stripe webhook with idempotent subscription sync"
```

---

## Task 14: UpgradePrompt component (Tailwind)

**Files:**
- Create: `components/billing/UpgradePrompt.tsx`

**Note:** Built and ready for later use; not rendered anywhere this cycle (gates are passive).

- [ ] **Step 1: Write the component**

Create `components/billing/UpgradePrompt.tsx`:
```tsx
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  feature: string
  requiredPlan: string
  description?: string
}

export function UpgradePrompt({ feature, requiredPlan, description }: Props) {
  const planDisplay = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
      <Zap className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-medium">{feature} requires the {planDisplay} plan</div>
        <p className="mb-3 text-sm opacity-80">
          {description ?? `Upgrade to ${planDisplay} to unlock this feature.`}
        </p>
        <Button asChild size="sm">
          <Link href="/billing"><Zap className="h-3.5 w-3.5" /> Upgrade now</Link>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/billing/UpgradePrompt.tsx
git commit -m "feat: reusable upgrade prompt component"
```

---

## Task 15: Billing page (Tailwind)

**Files:**
- Create: `app/(dashboard)/billing/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(dashboard)/billing/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, CreditCard, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Interval = 'monthly' | 'annual'

const PLANS = [
  { id: 'free', name: 'Free', price: { monthly: 0, annual: 0 }, description: 'Try the core review engine',
    features: ['3 manuscripts', '2 reviews per month', 'Score breakdown', 'Inline annotations'], cta: 'Current plan', highlight: false },
  { id: 'starter', name: 'Starter', price: { monthly: 12, annual: 8 }, description: 'For active PhD students',
    features: ['20 manuscripts', '10 reviews per month', 'Journal matching', 'PDF reports', 'Send to author'], cta: 'Upgrade to Starter', highlight: false },
  { id: 'pro', name: 'Pro', price: { monthly: 29, annual: 19 }, description: 'For serious researchers',
    features: ['100 manuscripts', '30 reviews per month', 'Adversarial review', 'Journal matching', 'PDF reports', '7-day free trial'], cta: 'Start Pro trial', highlight: true },
  { id: 'team', name: 'Team', price: { monthly: 79, annual: 59 }, description: 'For labs and departments',
    features: ['Unlimited manuscripts', 'Unlimited reviews', 'All Pro features', 'Team members', 'Admin dashboard', 'API access'], cta: 'Upgrade to Team', highlight: false },
] as const

export default function BillingPage() {
  const searchParams = useSearchParams()
  const [interval, setBillingInterval] = useState<Interval>('monthly')
  const [currentPlan, setCurrentPlan] = useState('free')
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [cancelAtEnd, setCancelAtEnd] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  useEffect(() => {
    async function fetchCurrent() {
      const res = await fetch('/api/billing/current')
      const d = await res.json()
      setCurrentPlan(d.plan ?? 'free')
      setPeriodEnd(d.periodEnd ?? null)
      setCancelAtEnd(d.cancelAtEnd ?? false)
    }
    fetchCurrent()
    if (success) setToast({ type: 'success', message: 'Subscription activated — welcome!' })
    if (canceled) setToast({ type: 'error', message: 'Checkout canceled — no charge made.' })
  }, [success, canceled])

  async function handleUpgrade(planId: string) {
    if (planId === 'free' || planId === currentPlan) return
    setLoading(planId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Checkout failed' })
      setLoading(null)
    }
  }

  async function handleManage() {
    setManaging(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not open portal' })
      setManaging(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {toast && (
        <div
          className={`mb-6 flex items-center justify-between rounded-md border px-4 py-2 text-sm ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {toast.message}
          <button onClick={() => setToast(null)} className="text-base leading-none">×</button>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Billing &amp; plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {currentPlan !== 'free'
            ? `You are on the ${currentPlan[0].toUpperCase() + currentPlan.slice(1)} plan${cancelAtEnd ? ' · Cancels at period end' : ''}${periodEnd ? ` · Renews ${new Date(periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
            : 'You are on the Free plan.'}
        </p>
      </div>

      {currentPlan !== 'free' && (
        <Card className="mb-8 flex items-center gap-4 p-4">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Manage your subscription</div>
            <div className="text-sm text-muted-foreground">Update payment method, download invoices, or cancel</div>
          </div>
          <Button onClick={handleManage} disabled={managing}>
            {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {managing ? 'Opening…' : 'Manage billing'}
          </Button>
        </Card>
      )}

      <div className="mb-6 flex items-center gap-3">
        <span className={`text-sm ${interval === 'monthly' ? 'font-medium' : 'text-muted-foreground'}`}>Monthly</span>
        <button
          onClick={() => setBillingInterval((i) => (i === 'monthly' ? 'annual' : 'monthly'))}
          className={`relative h-6 w-11 rounded-full transition-colors ${interval === 'annual' ? 'bg-primary' : 'bg-muted'}`}
          aria-label="Toggle billing interval"
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${interval === 'annual' ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
        <span className={`text-sm ${interval === 'annual' ? 'font-medium' : 'text-muted-foreground'}`}>
          Annual <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs">Up to 35% off</span>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <Card key={plan.id} className={`relative flex flex-col p-5 ${plan.highlight ? 'border-2 border-primary' : ''}`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Most popular
                </div>
              )}
              <div className="mb-3">
                <div className="text-base font-medium">{plan.name}</div>
                <div className="text-sm text-muted-foreground">{plan.description}</div>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-semibold">${plan.price[interval]}</span>
                {plan.price.monthly > 0 && <span className="text-sm text-muted-foreground">/mo</span>}
                {interval === 'annual' && plan.price.annual > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">${plan.price.annual * 12}/yr billed annually</div>
                )}
              </div>
              <ul className="mb-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || loading === plan.id || plan.id === 'free'}
                variant={plan.highlight ? 'default' : 'outline'}
                className="w-full"
              >
                {loading === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent ? 'Current plan' : plan.cta}
              </Button>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        All plans include core AI review, inline annotations, and XLSX export. Prices in USD. Cancel anytime from the billing portal.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. `useSearchParams` is safe here because the dashboard layout exports
`dynamic = 'force-dynamic'`, so `/billing` is never statically prerendered.
**Fallback:** if the build errors with "useSearchParams() should be wrapped in a suspense
boundary", extract the body into an inner component and render it inside `<Suspense>` from
`react` in the default export (route-segment `export const dynamic` is not allowed in a
`'use client'` file).

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/billing/page.tsx
git commit -m "feat: billing page with plans and portal access"
```

---

## Task 16: Sidebar — add Billing link

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Update the imports**

Change the icon import line to include `CreditCard`:
```tsx
import { FileText, LayoutDashboard, Settings, CreditCard } from 'lucide-react'
```

- [ ] **Step 2: Add the Billing link**

After the Settings `<Link>` block, before `</nav>`, add:
```tsx
        <Link href="/billing" className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted">
          <CreditCard className="h-4 w-4" /> Billing
        </Link>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add Billing link to sidebar"
```

---

## Task 17: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All `tests/*.test.ts(x)` pass (stripe mapping, plan gates, PDF render).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Build succeeds with no type errors. `/billing` and `/api/pdf/[sessionId]`, `/api/billing/*` appear in the route list.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, then verify:
- Visit `/billing` — four plan cards render; monthly/annual toggle works; free user sees no "Manage billing" card; `/api/billing/current` returns `{ plan: 'free', ... }`.
- Open a completed review → click **PDF report** → modal opens, iframe renders a multi-page PDF, **Save PDF** downloads, **Print** opens a print view.
- Sidebar shows the **Billing** link.

- [ ] **Step 4: Final commit (if any working-tree changes remain)**

```bash
git add -A
git commit -m "chore: ScholarLens V2 Phase 1 verification pass"
```

---

## Manual setup (post-merge, before Stripe goes live)

These are operator steps, not code (spec §8K):
1. Create Stripe products (Starter/Pro/Team) each with a monthly + annual recurring price.
2. Copy the 6 price IDs + secret/publishable/webhook keys into `.env.local` and Vercel env.
3. Register the webhook endpoint `https://<domain>/api/billing/webhook` for:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Enable the Stripe Customer Portal (allow cancel, update payment method, show invoices).
5. Local webhook testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`.

## Deferred to later cycles (not in this plan)
- Design system (U1 CSS) + sidebar redesign (U2) + vertical section nav (U3) + review-page layout (U5).
- `review_number` sequencing + stages API (U1-logic / U6), reconciled with the existing `version_number` progress model.
- Send-to-author email (`shared_reports` + email provider).
- Flipping plan-gate enforcement on (403/429) in review/PDF/adversarial routes.
```
