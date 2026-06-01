import { describe, it, expect } from 'vitest'
import { shouldShowProBadge } from '@/lib/plan/badge'

describe('shouldShowProBadge', () => {
  it('shows for plans below pro (upsell)', () => {
    expect(shouldShowProBadge('free')).toBe(true)
    expect(shouldShowProBadge('starter')).toBe(true)
  })
  it('hides for pro and team', () => {
    expect(shouldShowProBadge('pro')).toBe(false)
    expect(shouldShowProBadge('team')).toBe(false)
  })
  it('shows for unknown/missing plan (treat as free)', () => {
    expect(shouldShowProBadge(undefined)).toBe(true)
    expect(shouldShowProBadge('')).toBe(true)
  })
})
