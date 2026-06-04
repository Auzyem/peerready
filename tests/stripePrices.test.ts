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
