import { describe, it, expect } from 'vitest'
import { reviewNumberFromSession, stageStatusFromSession } from '@/lib/review/sequence'

describe('reviewNumberFromSession', () => {
  it('uses the draft version number', () => {
    expect(reviewNumberFromSession({ drafts: { version_number: 3 } })).toBe(3)
  })
  it('defaults to 1 when absent', () => {
    expect(reviewNumberFromSession({})).toBe(1)
    expect(reviewNumberFromSession(null)).toBe(1)
  })
})

describe('stageStatusFromSession', () => {
  it('maps terminal statuses', () => {
    expect(stageStatusFromSession({ status: 'complete' })).toBe('complete')
    expect(stageStatusFromSession({ status: 'failed' })).toBe('failed')
  })
  it('maps a missing session to pending', () => {
    expect(stageStatusFromSession(null)).toBe('pending')
    expect(stageStatusFromSession(undefined)).toBe('pending')
  })
  it('maps every in-flight status to active', () => {
    for (const s of ['queued', 'routing', 'awaiting_confirmation', 'reviewing', 'adversarial', 'matching', 'comparing'] as const) {
      expect(stageStatusFromSession({ status: s })).toBe('active')
    }
  })
})
