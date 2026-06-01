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
