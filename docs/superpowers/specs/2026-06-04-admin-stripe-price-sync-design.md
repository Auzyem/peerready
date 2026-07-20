# Admin → Stripe Price Sync — Design

**Date:** 2026-06-04
**Status:** Approved, ready for implementation plan

## Problem

The admin console (`components/admin/AdminPlans.tsx`) lets an admin edit a plan's
price, but that change only writes the **display** value (`price_monthly_usd` /
`price_annual_monthly_usd`) to the `plans` table. The amount a customer is actually
**charged** comes from a Stripe Price object, referenced by the `STRIPE_PRICE_*`
environment variables and read in `lib/stripe/client.ts`. Nothing in the admin path
touches Stripe.

Consequences:
- Editing a price in the admin console has no effect on billing.
- The pricing/billing pages can advertise one amount while Stripe charges another
  (display vs. charge drift).
- Changing a real charged amount today requires creating a new Stripe price by hand,
  editing six env vars in `.env.local` **and** Vercel, and redeploying.

Stripe Price objects are **immutable** — an amount can never be edited in place,
anywhere. Changing a price always means creating a *new* Price and archiving the old.

## Goal

Make the admin console the source of truth for pricing. When an admin changes a
plan's price and confirms, the system creates a new live Stripe price, updates the
plan→price mapping at runtime (no env edits, no redeploy), and keeps the display
price in lockstep with what Stripe charges.

## Key constraints (decisions locked during brainstorming)

1. **Sync trigger:** Auto on save, **with a confirmation dialog** before any Stripe
   write (creating a price changes what new customers pay — it must be guarded).
2. **Existing subscribers:** **Grandfathered.** Changing a price only affects *new*
   checkouts. Active subscriptions keep the price they signed up at.
3. **Mapping storage:** Moves from environment variables into the database, because
   the app cannot change env vars at runtime (they require a redeploy).

## The grandfathering constraint (why a history table is required)

The webhook reverse-maps a Stripe price ID back to a plan
(`planIdFromPriceId` / `intervalFromPriceId` in `lib/stripe/client.ts`) in order to
sync a subscription. When a grandfathered customer's subscription later changes
(card update, renewal, cancellation), Stripe sends an event carrying their **old**
price ID. If the system stored only each plan's *current* price ID, that old ID
would not resolve — the webhook would fall through to `'free'` and silently
**downgrade the grandfathered customer**. That is data corruption.

Therefore the design must keep **every** price ID ever issued mapped to its plan,
not just the current one. This is the deciding reason for a dedicated history table
(Approach B) over current-only columns on `plans` (Approach A).

## Architecture

### 1. Data model — `plan_prices` table

One row per Stripe price ever created (current and archived):

```sql
create table public.plan_prices (
  id              uuid primary key default uuid_generate_v4(),
  plan_id         text not null references public.plans(id) on delete cascade,
  interval        text not null check (interval in ('monthly','annual')),
  stripe_price_id text not null unique,
  unit_amount     integer not null,           -- cents, as baked into the Stripe price
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- exactly one active price per (plan, interval)
create unique index plan_prices_one_active
  on public.plan_prices (plan_id, interval) where active;

-- fast reverse lookup for the webhook
create index plan_prices_stripe_price_id_idx
  on public.plan_prices (stripe_price_id);
```

RLS: enabled, with an admin-manage policy (mirrors the pattern used for
`billing_events` / `plans`). The application reads `plan_prices` via the
service-role admin client (`createAdminClient`); price IDs are not secret.

A Postgres function performs the active-price swap atomically (the partial unique
index makes a single multi-row transaction necessary):

```sql
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
```

### 2. Seeding — `scripts/backfill-plan-prices.mjs`

The migration only **creates** the table; it inserts no rows (price IDs differ per
environment — test vs. live — and must not be hardcoded in SQL).

A one-time backfill script reads the current six `STRIPE_PRICE_*` env vars, fetches
each price's `unit_amount` from Stripe, and inserts the `active=true` rows. Run once
per environment: locally against the test/live key in `.env.local`, and against
production (the live key) using the service-role key. Idempotent: skip a
`(plan, interval)` that already has an active row.

### 3. Read paths (env → DB) — `lib/stripe/prices.ts`

A new module replaces the env-only resolution in `client.ts`:

- `getActivePriceId(planId, interval): Promise<string>`
  Looks up the active `plan_prices` row for `(plan, interval)`. Falls back to the
  `STRIPE_PRICE_*` env var if no row exists (so checkout never breaks pre-backfill).
  Throws a clear error if neither resolves. **Consumer:** `checkout/route.ts:42`.

- `resolvePlanFromPriceId(priceId): Promise<{ planId, interval } | null>`
  Returns the plan + interval for **any** price ID — active *or archived*. Falls
  back to the env reverse-map. **Consumer:** `webhook/route.ts` (replaces the two
  sync helpers). This is the grandfathering fix.

Both are `async` (one indexed query each — negligible). No caching for now (YAGNI).

### 4. Write path — `POST /api/admin/plans/sync-price`

New endpoint, guarded by the existing `billing.edit_plans` permission. Invoked from
the admin UI after the confirmation dialog when a price field changed. Steps:

1. **Compute cents**
   - monthly: `round(price_monthly_usd × 100)`
   - annual: `round(price_annual_monthly_usd × 12 × 100)` — the yearly total
     (the `$8/mo → $96/yr` convention, matching the current live prices).
2. **Find the plan's Stripe product** — from the current active price's `product`,
   or by `metadata.scholarlens_plan` if no active price exists yet.
3. **Create the new Stripe price** on that product (`unit_amount`, `currency: usd`,
   `recurring.interval` month/year), with `transfer_lookup_key: true` so the stable
   `pr_<plan>_<interval>` lookup key moves from the old price to the new one.
4. **Archive the old Stripe price** (`active: false`) — best-effort; checkout reads
   from the DB regardless of Stripe's `active` flag.
5. **Atomic DB swap** via the `swap_plan_price` rpc: old row → `active=false`, new
   row inserted `active=true`.
6. **Update the display columns** (`price_monthly_usd` / `price_annual_monthly_usd`)
   in the same flow, so the page and Stripe never drift.

**Ordering for safety:** create the Stripe price *first*. If it fails, abort with
nothing written — no DB change, no display change, no drift. Archive of the old
price happens after the DB swap and may fail without harm.

Non-price edits (name, feature flags, limits) continue to use the **existing**
`PATCH /api/admin/plans` unchanged — no Stripe call, no dialog.

### 5. UI — `components/admin/AdminPlans.tsx`

On **Save**, if a price field changed, show a confirmation dialog before any network
call:

> "This will create a new live Stripe price of $X/mo for the Starter plan. New
> customers will be charged the new amount; existing subscribers keep their current
> price. Continue?"

On confirm → call `POST /api/admin/plans/sync-price`. If only non-price fields
changed → existing `PATCH`, no dialog.

## Error handling & edge cases

- **Stripe create fails** → abort; nothing written (display unchanged too — no drift).
- **Amount unchanged** → no-op; skip Stripe entirely.
- **Free plan** → excluded (no Stripe price).
- **Archive fails** → tolerated; DB already points at the new active price.
- **Webhook reverse-map miss** → keep the safe `'free'` fallback **but log loudly**;
  with the history table this should not occur for our prices.
- **Concurrent saves** → the partial unique index + `swap_plan_price` rpc prevent two
  active rows for a `(plan, interval)`.

## Testing

- **Unit:** `getActivePriceId` (DB hit / env fallback / throw);
  `resolvePlanFromPriceId` (active / archived / miss); cents computation
  (monthly = ×100, annual = ×12×100).
- **Manual E2E:** change a price → new Stripe price created + old archived →
  a new checkout uses the new price → a subscription created on the *old* price still
  reverse-maps to the correct plan via the webhook.
- **Build gate:** `npm run build` must pass (house rule: `npm test` is lenient;
  commits gate on the build).

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/010_plan_prices.sql` | new table, indexes, `swap_plan_price` rpc, RLS |
| `scripts/backfill-plan-prices.mjs` | new — seed `plan_prices` from env + Stripe |
| `lib/stripe/prices.ts` | new — `getActivePriceId`, `resolvePlanFromPriceId`, cents helpers |
| `lib/stripe/client.ts` | trim env-only `getPriceId` / reverse-map (kept as fallback) |
| `app/api/billing/checkout/route.ts` | use `await getActivePriceId(...)` |
| `app/api/billing/webhook/route.ts` | use `await resolvePlanFromPriceId(...)` |
| `app/api/admin/plans/sync-price/route.ts` | new — the price-sync endpoint |
| `components/admin/AdminPlans.tsx` | confirm dialog on price change; call sync endpoint |
| tests | unit tests for the new resolution + computation helpers |

## What this deprecates

The `STRIPE_PRICE_*` env vars and `scripts/stripe-setup.mjs` remain as a
fallback / bootstrap path, but are no longer hand-edited to change a price. The admin
console becomes the source of truth; changing a price never again requires an env
edit or a redeploy.

## Out of scope (YAGNI)

- Migrating existing subscribers to new prices (grandfathering only).
- In-memory caching of price lookups.
- Currency other than USD.
- A UI history view of past prices (the data is captured in `plan_prices` for later).
