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
