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

import { createAdminClient } from '@/lib/supabase/admin'
import { planIdFromPriceId, intervalFromPriceId } from '@/lib/stripe/client'

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
  // Env fallback — read at call time so tests that mutate process.env see the
  // updated value. getPriceId also reads the env but via a module-load-time
  // snapshot; we use the same convention here and delegate to getPriceId which
  // throws "No Stripe price ID configured for <plan>_<interval>" on a miss.
  const envKey = `STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}` as keyof NodeJS.ProcessEnv
  const envPriceId = process.env[envKey]
  if (envPriceId) return envPriceId
  // Neither DB nor env — throw the same message getPriceId would throw.
  throw new Error(`No Stripe price ID configured for ${planId}_${interval}`)
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
