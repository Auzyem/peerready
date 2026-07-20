# Admin → Stripe Price Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin console the source of truth for pricing — when an admin changes a plan's price and confirms, the system creates a new live Stripe price, swaps the active plan→price mapping in the database at runtime (no env edits, no redeploy), grandfathers existing subscribers, and keeps the displayed price in lockstep with what Stripe charges.

**Architecture:** A new `plan_prices` table stores one row per Stripe price ever created (current + archived), enabling the webhook to reverse-map *any* historical price ID back to its plan (the grandfathering fix). A new `lib/stripe/prices.ts` module resolves price IDs from the DB with an env-var fallback. Checkout and the webhook switch to these DB-backed resolvers. A new admin endpoint creates the Stripe price, swaps the active row atomically via a Postgres rpc, and updates the display column — all behind a confirmation dialog in the admin UI.

**Tech Stack:** Next.js App Router (route handlers), Supabase (Postgres + service-role admin client), Stripe Node SDK, Vitest, TypeScript, Tailwind (`pr-*` tokens) + shadcn.

---

## Design reference

Full design: `docs/superpowers/specs/2026-06-04-admin-stripe-price-sync-design.md`. Read it before starting — this plan implements it. **One deviation from the design's file table:** the migration is numbered **`013_plan_prices.sql`** (not `010`), because `010`–`012` are already taken.

## House rules (from project memory — apply throughout)

- **Build gate:** `npm test` is lenient; commits gate on **`npm run build`**. Every commit step below runs the build first.
- **Stripe SDK + `next build`:** never construct a Stripe client with an empty-string key fallback at module scope; the existing `lib/stripe/client.ts` already uses a non-empty `sk_placeholder_build_only` fallback. New code imports `stripe` from there — do **not** create a second client.
- **`server-only`:** `lib/supabase/admin.ts` imports `server-only`, which throws if loaded in a test. Tests that touch the resolvers MUST `vi.mock('@/lib/supabase/admin', …)` so the real module never loads.
- **Design tokens:** UI uses Tailwind `pr-*` utility classes + shadcn, not inline `var(--pr-*)`.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/013_plan_prices.sql` | **New.** `plan_prices` table, partial-unique active index, reverse-lookup index, `swap_plan_price` rpc, RLS (service-role only). |
| `lib/stripe/prices.ts` | **New.** Pure cents helpers (`monthlyCents`, `annualCents`) + DB-backed resolvers (`getActivePriceId`, `resolvePlanFromPriceId`) with env fallback. |
| `tests/stripePrices.test.ts` | **New.** Unit tests for everything in `prices.ts`. |
| `app/api/billing/checkout/route.ts` | **Modify.** Resolve the price via `await getActivePriceId(...)`. |
| `app/api/billing/webhook/route.ts` | **Modify.** Reverse-map via `await resolvePlanFromPriceId(...)` (the grandfathering fix). |
| `scripts/backfill-plan-prices.mjs` | **New.** One-time seed of `plan_prices` from the six `STRIPE_PRICE_*` env vars + Stripe `unit_amount`. Idempotent. |
| `app/api/admin/plans/sync-price/route.ts` | **New.** Create Stripe price → swap DB row → update display column. Guarded by `billing.edit_plans`. |
| `components/admin/AdminPlans.tsx` | **Modify.** Confirmation dialog on price change; call the sync endpoint per changed interval; PATCH only non-price fields. |
| `lib/stripe/client.ts` | **Unchanged.** `getPriceId` / `planIdFromPriceId` / `intervalFromPriceId` stay as the env fallback that `prices.ts` delegates to. |

---

## Task 1: Migration — `plan_prices` table + swap rpc

**Files:**
- Create: `supabase/migrations/013_plan_prices.sql`

This migration has no Vitest coverage (the project does not unit-test SQL). Verification is: file present, applies cleanly, build passes. Apply it to your local Supabase before Task 6 (backfill) and Task 7 (the endpoint) can run end-to-end.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/013_plan_prices.sql`:

```sql
-- Plan → Stripe price mapping, moved out of the STRIPE_PRICE_* env vars and into
-- the database so the admin console can change a charged price at runtime (no env
-- edit, no redeploy). One row per Stripe price EVER created — current and archived.
--
-- Why keep archived rows: Stripe prices are immutable, so changing an amount means
-- creating a NEW price and archiving the old. Grandfathered subscribers keep their
-- old price; when their subscription later changes, Stripe's webhook carries the OLD
-- price ID. The reverse lookup must still resolve it to the correct plan, or the
-- webhook would fall through to 'free' and silently downgrade a paying customer.
create table if not exists public.plan_prices (
  id              uuid primary key default uuid_generate_v4(),
  plan_id         text not null references public.plans(id) on delete cascade,
  interval        text not null check (interval in ('monthly','annual')),
  stripe_price_id text not null unique,
  unit_amount     integer not null,            -- cents, as baked into the Stripe price
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Exactly one active price per (plan, interval). The partial unique index is why
-- the active-price swap below must run as one transaction (deactivate then insert).
create unique index if not exists plan_prices_one_active
  on public.plan_prices (plan_id, interval) where active;

-- Fast reverse lookup for the webhook.
create index if not exists plan_prices_stripe_price_id_idx
  on public.plan_prices (stripe_price_id);

-- Atomic active-price swap: archive the current active row, insert the new active
-- row. security definer so the service-role caller runs it as one unit. The partial
-- unique index guarantees there is never more than one active row to deactivate.
create or replace function public.swap_plan_price(
  p_plan_id text,
  p_interval text,
  p_stripe_price_id text,
  p_unit_amount integer
) returns void language plpgsql security definer as $$
begin
  update public.plan_prices
     set active = false
   where plan_id = p_plan_id and interval = p_interval and active;

  insert into public.plan_prices (plan_id, interval, stripe_price_id, unit_amount, active)
  values (p_plan_id, p_interval, p_stripe_price_id, p_unit_amount, true);
end;
$$;

-- RLS on. No anon/authenticated policy is added: the app reads and writes
-- plan_prices exclusively through the service-role admin client (which bypasses
-- RLS), exactly like billing_events. Locked-by-default is the safe choice here.
alter table public.plan_prices enable row level security;
```

- [ ] **Step 2: Sanity-check the SQL parses**

If the Supabase CLI is available, apply it:

Run: `npx supabase db reset` *(or your project's migration-apply command — e.g. `npx supabase migration up`)*
Expected: migrations run through `013_plan_prices.sql` with no error; `plan_prices` exists.

If the CLI is not configured locally, instead eyeball the file against `011_roles_permissions.sql` (security-definer style) and `012_plans_public_read.sql` (RLS style) for consistency, and rely on the Task 6 backfill run (which inserts into the table) to prove it works.

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds (no app code changed yet; this confirms the working tree is clean to commit).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_plan_prices.sql
git commit -m "feat(db): plan_prices table + swap_plan_price rpc for runtime price mapping"
```

---

## Task 2: Pure cents helpers in `lib/stripe/prices.ts`

The yearly-total convention matches the current live prices: Starter `$12/mo` → annual stored as `$8/mo` → `$96/yr` = `9600¢`. So annual cents = perMonthUsd × 12 × 100.

**Files:**
- Create: `lib/stripe/prices.ts`
- Test: `tests/stripePrices.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stripePrices.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { monthlyCents, annualCents } from '@/lib/stripe/prices'

describe('cents computation', () => {
  it('monthly = round(usd * 100)', () => {
    expect(monthlyCents(12)).toBe(1200)
    expect(monthlyCents(29)).toBe(2900)
    expect(monthlyCents(9.99)).toBe(999)
  })

  it('annual = round(perMonthUsd * 12 * 100) — the yearly total', () => {
    expect(annualCents(8)).toBe(9600)    // Starter $8/mo → $96/yr
    expect(annualCents(19)).toBe(22800)  // Pro $19/mo → $228/yr
    expect(annualCents(59)).toBe(70800)  // Team $59/mo → $708/yr
  })

  it('rounds half-cents to the nearest integer cent', () => {
    expect(monthlyCents(9.005)).toBe(901) // 900.5 → 901
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/stripePrices.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/stripe/prices"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/stripe/prices.ts`:

```ts
import 'server-only'

/** Monthly price in cents: dollars × 100, rounded to the nearest cent. */
export function monthlyCents(perMonthUsd: number): number {
  return Math.round(perMonthUsd * 100)
}

/**
 * Annual price in cents — the full YEARLY total. The admin enters the annual
 * price as a per-month figure (the `$8/mo → $96/yr` convention), so the Stripe
 * yearly price is perMonthUsd × 12 × 100.
 */
export function annualCents(perMonthUsd: number): number {
  return Math.round(perMonthUsd * 12 * 100)
}
```

> Note: `import 'server-only'` is intentional — this module also gains DB resolvers in Task 3 and must never reach a client bundle. Vitest tests mock `@/lib/supabase/admin`; `server-only` itself is a no-op shim under Vitest's node environment when not bundled by Next, but to be safe the cents-only test above imports just the pure functions. If `server-only` throws under Vitest, remove the import line — these helpers don't need it on their own, and Task 3 keeps the resolvers in this same file where Next's bundler enforces server-only via the route imports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/stripePrices.test.ts`
Expected: PASS (3 passing).

> If the `server-only` import made Vitest throw at import time, delete the `import 'server-only'` line from `lib/stripe/prices.ts` and re-run. The resolvers added in Task 3 are only ever imported by server route handlers, so server-only protection is already enforced at those call sites.

- [ ] **Step 5: Commit**

```bash
npm run build
git add lib/stripe/prices.ts tests/stripePrices.test.ts
git commit -m "feat(stripe): cents helpers for monthly/annual price computation"
```
Expected: build passes before commit.

---

## Task 3: DB-backed resolvers `getActivePriceId` + `resolvePlanFromPriceId`

`getActivePriceId` powers checkout (current active price). `resolvePlanFromPriceId` powers the webhook and must resolve **archived** price IDs too — the grandfathering fix. Both fall back to the existing env map in `lib/stripe/client.ts` so nothing breaks before the backfill runs.

**Files:**
- Modify: `lib/stripe/prices.ts`
- Test: `tests/stripePrices.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Add to the top of `tests/stripePrices.test.ts` (above the existing `describe`), and add the two new `describe` blocks below it:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the service-role client so the real lib/supabase/admin (which imports
// 'server-only') never loads under Vitest. `h.admin` is swapped per test.
const h = vi.hoisted(() => ({ admin: null as unknown as { from: (t: string) => unknown } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

// Builds a chainable Supabase query mock whose terminal .maybeSingle() resolves
// to `result`. select()/eq() return the same builder so the call chain works.
function mockAdmin(result: { data: unknown }) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => result)
  return { from: vi.fn(() => builder) }
}
```

Then append these two suites to the end of the file:

```ts
describe('getActivePriceId', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_env_pm'
    delete process.env.STRIPE_PRICE_TEAM_ANNUAL
  })

  it('returns the active price id from the DB when a row exists', async () => {
    h.admin = mockAdmin({ data: { stripe_price_id: 'price_db_pro_monthly' } })
    const { getActivePriceId } = await import('@/lib/stripe/prices')
    await expect(getActivePriceId('pro', 'monthly')).resolves.toBe('price_db_pro_monthly')
  })

  it('falls back to the STRIPE_PRICE_* env var when no DB row exists', async () => {
    h.admin = mockAdmin({ data: null })
    const { getActivePriceId } = await import('@/lib/stripe/prices')
    await expect(getActivePriceId('pro', 'monthly')).resolves.toBe('price_env_pm')
  })

  it('throws a clear error when neither DB nor env resolves', async () => {
    h.admin = mockAdmin({ data: null })
    const { getActivePriceId } = await import('@/lib/stripe/prices')
    await expect(getActivePriceId('team', 'annual')).rejects.toThrow(/team_annual/)
  })
})

describe('resolvePlanFromPriceId', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_env_sa'
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_env_pm'
  })

  it('resolves an ACTIVE price id from the DB', async () => {
    h.admin = mockAdmin({ data: { plan_id: 'pro', interval: 'monthly' } })
    const { resolvePlanFromPriceId } = await import('@/lib/stripe/prices')
    await expect(resolvePlanFromPriceId('price_db_anything')).resolves.toEqual({
      planId: 'pro', interval: 'monthly',
    })
  })

  it('resolves an ARCHIVED price id from the DB (grandfathering)', async () => {
    h.admin = mockAdmin({ data: { plan_id: 'starter', interval: 'annual' } })
    const { resolvePlanFromPriceId } = await import('@/lib/stripe/prices')
    await expect(resolvePlanFromPriceId('price_old_archived')).resolves.toEqual({
      planId: 'starter', interval: 'annual',
    })
  })

  it('falls back to the env reverse-map on a DB miss', async () => {
    h.admin = mockAdmin({ data: null })
    const { resolvePlanFromPriceId } = await import('@/lib/stripe/prices')
    await expect(resolvePlanFromPriceId('price_env_sa')).resolves.toEqual({
      planId: 'starter', interval: 'annual',
    })
  })

  it('returns null for a price that resolves to neither DB nor a known env id', async () => {
    h.admin = mockAdmin({ data: null })
    const { resolvePlanFromPriceId } = await import('@/lib/stripe/prices')
    await expect(resolvePlanFromPriceId('price_totally_unknown')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/stripePrices.test.ts`
Expected: FAIL — `getActivePriceId` / `resolvePlanFromPriceId` are not exported from `@/lib/stripe/prices`.

- [ ] **Step 3: Implement the resolvers**

Append to `lib/stripe/prices.ts` (keep the cents helpers above):

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { getPriceId, planIdFromPriceId, intervalFromPriceId } from '@/lib/stripe/client'

type Interval = 'monthly' | 'annual'

/**
 * The Stripe price id that NEW checkouts should use for (plan, interval).
 * Reads the single active plan_prices row via the service-role client; falls
 * back to the STRIPE_PRICE_* env var so checkout never breaks before the backfill
 * has run. Throws a clear error if neither resolves.
 */
export async function getActivePriceId(planId: string, interval: Interval): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('plan_prices')
    .select('stripe_price_id')
    .eq('plan_id', planId)
    .eq('interval', interval)
    .eq('active', true)
    .maybeSingle()

  if (data?.stripe_price_id) return data.stripe_price_id as string
  // Env fallback — getPriceId throws "No Stripe price ID configured for <plan>_<interval>".
  return getPriceId(planId, interval)
}

/**
 * Reverse-map ANY Stripe price id — active OR archived — back to its plan and
 * interval. This is the grandfathering fix: when a grandfathered subscriber's
 * subscription later changes, Stripe's webhook carries their OLD price id, and it
 * must still resolve. Falls back to the env reverse-map; returns null on a true
 * miss so the webhook can keep its safe 'free' fallback (and log loudly).
 */
export async function resolvePlanFromPriceId(
  priceId: string,
): Promise<{ planId: string; interval: Interval } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('plan_prices')
    .select('plan_id, interval')
    .eq('stripe_price_id', priceId)
    .maybeSingle()

  if (data?.plan_id) {
    return { planId: data.plan_id as string, interval: data.interval as Interval }
  }

  // Env fallback: planIdFromPriceId returns 'free' for an unknown id.
  const envPlan = planIdFromPriceId(priceId)
  if (envPlan !== 'free') {
    return { planId: envPlan, interval: intervalFromPriceId(priceId) }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/stripePrices.test.ts`
Expected: PASS (cents suite + both resolver suites, 9 passing total).

- [ ] **Step 5: Commit**

```bash
npm run build
git add lib/stripe/prices.ts tests/stripePrices.test.ts
git commit -m "feat(stripe): DB-backed price resolvers with env fallback"
```
Expected: build passes before commit.

---

## Task 4: Wire checkout to `getActivePriceId`

**Files:**
- Modify: `app/api/billing/checkout/route.ts:3` (import) and `:40-45` (resolution)

No new test — checkout has no existing unit test and requires Stripe. Verification is the build gate plus the manual E2E in Task 9.

- [ ] **Step 1: Update the import**

In `app/api/billing/checkout/route.ts`, change line 3 from:

```ts
import { stripe, getPriceId } from '@/lib/stripe/client'
```

to:

```ts
import { stripe } from '@/lib/stripe/client'
import { getActivePriceId } from '@/lib/stripe/prices'
```

- [ ] **Step 2: Resolve the price from the DB**

Replace the block at lines 40-45:

```ts
  let priceId: string
  try {
    priceId = getPriceId(planId, interval as 'monthly' | 'annual')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid plan' }, { status: 400 })
  }
```

with:

```ts
  let priceId: string
  try {
    priceId = await getActivePriceId(planId, interval as 'monthly' | 'annual')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid plan' }, { status: 400 })
  }
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; no type errors in `checkout/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/billing/checkout/route.ts
git commit -m "feat(billing): checkout reads active price id from the database"
```

---

## Task 5: Wire the webhook to `resolvePlanFromPriceId` (grandfathering fix)

**Files:**
- Modify: `app/api/billing/webhook/route.ts:2` (import) and `:24-26` (reverse-map in `syncSubscription`)

- [ ] **Step 1: Update the import**

In `app/api/billing/webhook/route.ts`, change line 2 from:

```ts
import { stripe, planIdFromPriceId, intervalFromPriceId } from '@/lib/stripe/client'
```

to:

```ts
import { stripe } from '@/lib/stripe/client'
import { resolvePlanFromPriceId } from '@/lib/stripe/prices'
```

- [ ] **Step 2: Resolve via the DB-backed reverse-map**

In `syncSubscription`, replace lines 24-26:

```ts
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  const planId = planIdFromPriceId(priceId)
  const interval = intervalFromPriceId(priceId)
```

with:

```ts
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  const resolved = await resolvePlanFromPriceId(priceId)
  if (!resolved) {
    // With the plan_prices history table this should not happen for our prices.
    // Keep the safe 'free' default but log loudly so a real miss is never silent.
    console.error(
      `[stripe webhook] price ${priceId} on subscription ${subscription.id} did not ` +
      `resolve to a plan; defaulting to free`,
    )
  }
  const planId = resolved?.planId ?? 'free'
  const interval = resolved?.interval ?? 'monthly'
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; no unused-import or type errors in `webhook/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/billing/webhook/route.ts
git commit -m "fix(billing): webhook reverse-maps any historical price id (grandfathering)"
```

---

## Task 6: Backfill script — seed `plan_prices` from env + Stripe

Run once per environment. Reads the six `STRIPE_PRICE_*` env vars from `.env.local` (same loader idiom as `scripts/stripe-verify.mjs`), fetches each price's `unit_amount` from Stripe, and inserts `active=true` rows. Idempotent: skips a `(plan, interval)` that already has an active row.

**Files:**
- Create: `scripts/backfill-plan-prices.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-plan-prices.mjs`:

```js
#!/usr/bin/env node
/**
 * Seeds public.plan_prices from the six STRIPE_PRICE_* env vars, fetching each
 * price's unit_amount from Stripe. Run ONCE per environment:
 *   - locally:   node scripts/backfill-plan-prices.mjs   (uses .env.local)
 *   - prod:      run with the LIVE Stripe key + the service-role key in the env.
 *
 * Idempotent: a (plan, interval) that already has an active row is skipped, so
 * re-running is safe. Migration 013 must be applied first.
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local (KEY=VALUE) without a dependency; existing process.env wins.
try {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k] === undefined) process.env[k] = raw.replace(/^["']|["']$/g, '')
  }
} catch {
  // no .env.local — fall back to the ambient environment
}

const key = process.env.STRIPE_SECRET_KEY
if (!key || key.includes('placeholder')) {
  console.error('✗ STRIPE_SECRET_KEY is missing or a placeholder')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svc) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
  process.exit(1)
}

const stripe = new Stripe(key)
const db = createClient(url, svc, { auth: { persistSession: false } })

// (plan, interval) → env var. Mirrors lib/stripe/client.ts STRIPE_PRICES.
const ROWS = [
  { plan: 'starter', interval: 'monthly', env: 'STRIPE_PRICE_STARTER_MONTHLY' },
  { plan: 'starter', interval: 'annual',  env: 'STRIPE_PRICE_STARTER_ANNUAL' },
  { plan: 'pro',     interval: 'monthly', env: 'STRIPE_PRICE_PRO_MONTHLY' },
  { plan: 'pro',     interval: 'annual',  env: 'STRIPE_PRICE_PRO_ANNUAL' },
  { plan: 'team',    interval: 'monthly', env: 'STRIPE_PRICE_TEAM_MONTHLY' },
  { plan: 'team',    interval: 'annual',  env: 'STRIPE_PRICE_TEAM_ANNUAL' },
]

let inserted = 0
let skipped = 0
let failed = 0

for (const r of ROWS) {
  const priceId = process.env[r.env]
  if (!priceId || !priceId.startsWith('price_')) {
    console.log(`• ${r.plan} ${r.interval}: ${r.env} unset/invalid — skipping`)
    failed++
    continue
  }

  // Idempotency: already have an active row for this (plan, interval)?
  const { data: existing } = await db
    .from('plan_prices')
    .select('id')
    .eq('plan_id', r.plan)
    .eq('interval', r.interval)
    .eq('active', true)
    .maybeSingle()
  if (existing) {
    console.log(`• ${r.plan} ${r.interval}: active row exists — skipping`)
    skipped++
    continue
  }

  let unitAmount
  try {
    const price = await stripe.prices.retrieve(priceId)
    unitAmount = price.unit_amount
  } catch (e) {
    console.log(`✗ ${r.plan} ${r.interval}: retrieve ${priceId} failed — ${e.message}`)
    failed++
    continue
  }

  const { error } = await db.from('plan_prices').insert({
    plan_id: r.plan,
    interval: r.interval,
    stripe_price_id: priceId,
    unit_amount: unitAmount,
    active: true,
  })
  if (error) {
    console.log(`✗ ${r.plan} ${r.interval}: insert failed — ${error.message}`)
    failed++
    continue
  }
  console.log(`✓ ${r.plan} ${r.interval}: ${priceId} (${unitAmount}¢)`)
  inserted++
}

console.log(`\nInserted ${inserted}, skipped ${skipped}, failed ${failed}.`)
process.exit(failed > 0 ? 1 : 0)
```

- [ ] **Step 2: Run the backfill against your local/test environment**

Run: `node scripts/backfill-plan-prices.mjs`
Expected: six `✓` lines (or `skipping` lines on a second run); `Inserted 6, skipped 0, failed 0.` on the first run, `Inserted 0, skipped 6` on a re-run. Requires migration 013 applied (Task 1) and a real test-mode Stripe key + service-role key in `.env.local`.

> If you cannot reach Stripe/Supabase locally, skip the run; the script is verified by code review here and exercised in the Task 9 E2E.

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds (the script is not part of the bundle, but confirm a clean tree).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-plan-prices.mjs
git commit -m "feat(stripe): one-time backfill of plan_prices from env + Stripe"
```

---

## Task 7: Admin endpoint — `POST /api/admin/plans/sync-price`

Creates the new Stripe price, swaps the active DB row atomically, and updates the display column — for **one** `(plan, interval)` per call. Guarded by `billing.edit_plans`. **Ordering for safety: create the Stripe price FIRST.** If it fails, nothing is written (no DB change, no display change, no drift). Archiving the old price happens last and may fail harmlessly.

**Files:**
- Create: `app/api/admin/plans/sync-price/route.ts`

No unit test (Stripe + DB; mirrors the untested `plans/route.ts`). Verified by the build gate and the Task 9 E2E.

- [ ] **Step 1: Write the route**

Create `app/api/admin/plans/sync-price/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe/client'
import { monthlyCents, annualCents } from '@/lib/stripe/prices'

export const dynamic = 'force-dynamic'

type Interval = 'monthly' | 'annual'

export async function POST(request: NextRequest) {
  try {
    await requirePermission('billing.edit_plans')

    const { planId, interval, unitAmountUsd } = (await request.json()) as {
      planId: string
      interval: Interval
      unitAmountUsd: number
    }

    if (!planId || planId === 'free') {
      return NextResponse.json({ error: 'A paid plan id is required' }, { status: 400 })
    }
    if (interval !== 'monthly' && interval !== 'annual') {
      return NextResponse.json({ error: 'interval must be "monthly" or "annual"' }, { status: 400 })
    }
    if (typeof unitAmountUsd !== 'number' || !Number.isFinite(unitAmountUsd) || unitAmountUsd <= 0) {
      return NextResponse.json({ error: 'unitAmountUsd must be a positive number' }, { status: 400 })
    }

    const newCents = interval === 'monthly' ? monthlyCents(unitAmountUsd) : annualCents(unitAmountUsd)
    const admin = createAdminClient()

    // Find the current active row (gives us the old price id + amount + product).
    const { data: activeRow } = await admin
      .from('plan_prices')
      .select('stripe_price_id, unit_amount')
      .eq('plan_id', planId)
      .eq('interval', interval)
      .eq('active', true)
      .maybeSingle()

    const oldPriceId: string | null = activeRow?.stripe_price_id ?? null
    const currentCents: number | null = activeRow?.unit_amount ?? null

    // Resolve the Stripe product: from the active price, else by product metadata.
    let productId: string | null = null
    if (oldPriceId) {
      const oldPrice = await stripe.prices.retrieve(oldPriceId)
      productId = typeof oldPrice.product === 'string' ? oldPrice.product : oldPrice.product?.id ?? null
    } else {
      // Pre-backfill: locate the product by metadata.scholarlens_plan (matches scripts/stripe-setup.mjs).
      for await (const product of stripe.products.list({ limit: 100 })) {
        if (product.active && product.metadata?.scholarlens_plan === planId) {
          productId = product.id
          break
        }
      }
    }
    if (!productId) {
      return NextResponse.json(
        { error: `Could not find a Stripe product for plan "${planId}"` },
        { status: 422 },
      )
    }

    const displayCol = interval === 'monthly' ? 'price_monthly_usd' : 'price_annual_monthly_usd'

    // Amount unchanged → no Stripe write. Keep the display column in sync and return.
    if (currentCents === newCents) {
      await admin.from('plans').update({ [displayCol]: unitAmountUsd }).eq('id', planId)
      return NextResponse.json({ ok: true, unchanged: true })
    }

    // 1) Create the new Stripe price FIRST. If this throws, the catch returns 500
    //    and nothing else has been written — no DB change, no display change.
    const newPrice = await stripe.prices.create({
      product: productId,
      currency: 'usd',
      unit_amount: newCents,
      recurring: { interval: interval === 'annual' ? 'year' : 'month' },
      lookup_key: `pr_${planId}_${interval}`,
      transfer_lookup_key: true, // move the stable lookup key off the old price
      metadata: { scholarlens_plan: planId, scholarlens_interval: interval },
    })

    // 2) Atomic DB swap: old active row → inactive, new active row inserted.
    const { error: swapError } = await admin.rpc('swap_plan_price', {
      p_plan_id: planId,
      p_interval: interval,
      p_stripe_price_id: newPrice.id,
      p_unit_amount: newCents,
    })
    if (swapError) throw swapError

    // 3) Update the display column so the page and Stripe never drift.
    await admin.from('plans').update({ [displayCol]: unitAmountUsd }).eq('id', planId)

    // 4) Archive the old Stripe price — best-effort. Checkout reads from the DB
    //    regardless of Stripe's active flag, so a failure here is harmless.
    if (oldPriceId) {
      try {
        await stripe.prices.update(oldPriceId, { active: false })
      } catch (e) {
        console.warn(`[sync-price] failed to archive old price ${oldPriceId}:`, e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({ ok: true, priceId: newPrice.id, unitAmount: newCents })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
```

- [ ] **Step 2: Verify the build passes (type-check is the real gate)**

Run: `npm run build`
Expected: build succeeds. Watch for Stripe SDK type drift on `transfer_lookup_key` / `product.id`; if the pinned types complain, the existing codebase pattern is a narrow cast (see `webhook/route.ts` `SubWithPeriod`). Resolve any error before committing — do not silence it with `any` beyond a single documented field cast.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/plans/sync-price/route.ts
git commit -m "feat(admin): sync-price endpoint creates Stripe price + swaps active mapping"
```

---

## Task 8: Admin UI — confirmation dialog + call the sync endpoint

On **Save**, diff the edited price fields against the loaded originals. If a price field changed on a paid plan, show a confirmation dialog naming the new amount(s); on confirm, call `sync-price` once per changed interval, then PATCH only the non-price fields. If only non-price fields changed (or the plan is `free`), use the existing PATCH alone — no dialog.

**Files:**
- Modify: `components/admin/AdminPlans.tsx`

No unit test (the project has no React-Testing-Library setup for admin components; `tests/` are logic-focused). Verified by the build gate and the Task 9 E2E.

- [ ] **Step 1: Add pending-confirm state**

In `AdminPlans()`, add a state field next to the existing ones (after line 27, `const [toast, setToast] = useState<string | null>(null)`):

```ts
  const [confirm, setConfirm] = useState<{
    planId: string
    name: string
    changes: { interval: 'monthly' | 'annual'; usd: number }[]
  } | null>(null)
```

- [ ] **Step 2: Replace `save` with a diff-aware version + the sync runner**

Replace the entire `save` function (lines 47-64) with:

```ts
  // Which price fields differ from the loaded original?
  const priceChanges = (planId: string): { interval: 'monthly' | 'annual'; usd: number }[] => {
    const orig = plans.find(p => p.id === planId)
    const next = edits[planId]
    if (!orig || !next) return []
    const out: { interval: 'monthly' | 'annual'; usd: number }[] = []
    if (next.price_monthly_usd != null && next.price_monthly_usd !== orig.price_monthly_usd) {
      out.push({ interval: 'monthly', usd: Number(next.price_monthly_usd) })
    }
    if (next.price_annual_monthly_usd != null && next.price_annual_monthly_usd !== orig.price_annual_monthly_usd) {
      out.push({ interval: 'annual', usd: Number(next.price_annual_monthly_usd) })
    }
    return out
  }

  // PATCH non-price fields only (sync-price owns the price columns to avoid drift).
  const patchNonPriceFields = async (planId: string) => {
    const updates = { ...edits[planId] }
    delete updates.price_monthly_usd
    delete updates.price_annual_monthly_usd
    const res = await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, updates }),
    })
    const text = await res.text()
    let data: { error?: string } = {}
    try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
    if (!res.ok) throw new Error(data.error ?? 'Update failed')
  }

  const save = async (planId: string) => {
    const changes = priceChanges(planId)
    // Paid plan with a changed price → confirm before any Stripe write.
    if (planId !== 'free' && changes.length > 0) {
      setConfirm({ planId, name: edits[planId]?.name ?? planId, changes })
      return
    }
    // Otherwise just PATCH (non-price fields; free plan never syncs).
    setSaving(planId)
    try {
      await patchNonPriceFields(planId)
      setPlans(prev => prev.map(p => (p.id === planId ? { ...p, ...edits[planId] } : p)))
      setToast(`${edits[planId]?.name ?? planId} plan updated`)
    } catch (e) {
      setToast(`Error: ${e instanceof Error ? e.message : 'Update failed'}`)
    }
    setSaving(null)
  }

  // Runs after the admin confirms the dialog: sync each changed interval, then PATCH.
  const runSync = async () => {
    if (!confirm) return
    const { planId } = confirm
    setSaving(planId)
    setConfirm(null)
    try {
      for (const c of confirm.changes) {
        const res = await fetch('/api/admin/plans/sync-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, interval: c.interval, unitAmountUsd: c.usd }),
        })
        const text = await res.text()
        let data: { error?: string } = {}
        try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
        if (!res.ok) throw new Error(data.error ?? 'Price sync failed')
      }
      await patchNonPriceFields(planId)
      setPlans(prev => prev.map(p => (p.id === planId ? { ...p, ...edits[planId] } : p)))
      setToast(`${confirm.name} plan price synced to Stripe`)
    } catch (e) {
      setToast(`Error: ${e instanceof Error ? e.message : 'Price sync failed'}`)
    }
    setSaving(null)
  }
```

- [ ] **Step 3: Render the confirmation dialog**

In the returned JSX, immediately after the opening `<div>` (line 108, before the `{toast && ...}` block), insert:

```tsx
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5">
            <div className="mb-2 text-sm font-medium text-pr-navy">Confirm price change</div>
            <p className="mb-3 text-sm text-muted-foreground">
              This will create {confirm.changes.length > 1 ? 'new live Stripe prices' : 'a new live Stripe price'} for the{' '}
              <span className="font-medium text-foreground">{confirm.name}</span> plan:
            </p>
            <ul className="mb-3 space-y-1 text-sm">
              {confirm.changes.map(c => (
                <li key={c.interval}>
                  • ${c.usd}/mo{c.interval === 'annual' ? ' (billed annually)' : ''}
                </li>
              ))}
            </ul>
            <p className="mb-4 text-xs text-muted-foreground">
              New customers will be charged the new amount. Existing subscribers keep their current price.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button size="sm" onClick={runSync}>Create price &amp; save</Button>
            </div>
          </Card>
        </div>
      )}
```

> `Button` and `Card` are already imported at the top of the file. If the `variant="outline"` prop is not supported by this project's `Button`, drop the prop (a plain Button is acceptable for Cancel).

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; no type errors in `AdminPlans.tsx` (watch the `Button` `variant` prop — see note above).

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminPlans.tsx
git commit -m "feat(admin): confirm dialog + Stripe price sync on plan price change"
```

---

## Task 9: Manual end-to-end verification

No code changes — this is the acceptance gate the design calls for. Requires migration 013 applied, the backfill run (Task 6), a test-mode Stripe key, and `stripe listen` forwarding webhooks locally.

- [ ] **Step 1: Confirm wiring before touching prices**

Run: `node scripts/stripe-verify.mjs`
Expected: all six `✓` price lines, keys in matching mode, webhook secret present.

- [ ] **Step 2: Change a price in the admin console**

In the admin → Plans UI, change the Starter monthly price and click **Save**. Confirm the dialog appears naming the new amount; click **Create price & save**.
Expected: success toast. In the Stripe dashboard, a **new** Starter monthly price exists at the new amount and the **old** price is archived. In `plan_prices`, the old row is `active=false` and a new `active=true` row exists. `plans.price_monthly_usd` shows the new value.

- [ ] **Step 3: New checkout uses the new price**

Start a checkout for Starter monthly (test card `4242 4242 4242 4242`).
Expected: the Stripe Checkout line item shows the NEW amount; the resulting `subscriptions` row maps to `plan_id='starter'`.

- [ ] **Step 4: Grandfathering — an old-price subscription still reverse-maps**

For a subscription created on the **old** (now archived) price, trigger an update (e.g. `stripe trigger customer.subscription.updated`, or cancel-at-period-end toggle).
Expected: the webhook resolves the archived price id to `plan_id='starter'` (NOT `'free'`); the `subscriptions` row keeps `plan_id='starter'`. Confirm no `did not resolve to a plan` error appears in the server log.

- [ ] **Step 5: Non-price edit takes the no-dialog path**

Change only a feature flag (e.g. PDF reports) on a plan and Save.
Expected: no dialog; toast confirms update; no new Stripe price created.

- [ ] **Step 6: Final build gate**

Run: `npm run build` and `npx vitest run`
Expected: build succeeds; all tests pass.

---

## Self-review notes (verified during planning)

- **Spec coverage:** plan_prices table + swap rpc (Task 1) → design §1; backfill (Task 6) → §2; resolvers with env fallback (Tasks 2–3) → §3; checkout/webhook rewiring (Tasks 4–5) → §3 consumers + grandfathering fix; sync-price endpoint with create-first ordering, no-op-on-unchanged, free-plan exclusion, best-effort archive (Task 7) → §4 + error-handling; UI confirm dialog + per-interval sync + non-price PATCH split (Task 8) → §5. Out-of-scope items (subscriber migration, caching, multi-currency, history UI) are intentionally absent.
- **Type consistency:** `getActivePriceId(planId, interval)` and `resolvePlanFromPriceId(priceId)` signatures match between definition (Task 3), checkout (Task 4), and webhook (Task 5). `swap_plan_price` parameter names (`p_plan_id`, `p_interval`, `p_stripe_price_id`, `p_unit_amount`) match between the migration (Task 1) and the rpc call (Task 7). Display columns `price_monthly_usd` / `price_annual_monthly_usd` match the `plans` schema used in `AdminPlans.tsx` and `plans/route.ts`.
- **Lookup key:** `pr_<plan>_<interval>` matches `scripts/stripe-setup.mjs:66`; product metadata key `scholarlens_plan` matches `:59`.
```
