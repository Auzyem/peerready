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
