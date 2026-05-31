import { describe, it, expect } from 'vitest'
import { hourAgoIso, ACTIVE_REVIEW_STATUSES, RATE_LIMITS } from '@/lib/rateLimit'

describe('rateLimit', () => {
  it('hourAgoIso returns an ISO string exactly one hour before now', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z')
    expect(hourAgoIso(now)).toBe('2026-01-01T11:00:00.000Z')
  })

  it('treats only running statuses as active (not awaiting_confirmation)', () => {
    expect(ACTIVE_REVIEW_STATUSES).toContain('reviewing')
    expect(ACTIVE_REVIEW_STATUSES).not.toContain('awaiting_confirmation')
    expect(ACTIVE_REVIEW_STATUSES).not.toContain('complete')
  })

  it('exposes positive hourly caps', () => {
    expect(RATE_LIMITS.reviewsPerHour).toBeGreaterThan(0)
    expect(RATE_LIMITS.uploadsPerHour).toBeGreaterThan(0)
  })
})
