import { describe, it, expect } from 'vitest'
import { computeCompleteness } from '@/lib/reporting/completeness'
import type { ChecklistItemStatus } from '@/lib/types'

const s = (statuses: ChecklistItemStatus[]) => statuses.map(status => ({ status }))

describe('computeCompleteness', () => {
  it('returns 1 when every applicable item is present', () => {
    expect(computeCompleteness(s(['present', 'present']))).toBe(1)
  })

  it('counts partial as half', () => {
    expect(computeCompleteness(s(['present', 'partial']))).toBe(0.75)
  })

  it('counts missing as zero', () => {
    expect(computeCompleteness(s(['present', 'missing']))).toBe(0.5)
  })

  it('excludes not_applicable items from the denominator', () => {
    expect(computeCompleteness(s(['present', 'not_applicable']))).toBe(1)
  })

  it('returns 0 for an empty or all-N/A list (no divide-by-zero)', () => {
    expect(computeCompleteness([])).toBe(0)
    expect(computeCompleteness(s(['not_applicable']))).toBe(0)
  })
})
