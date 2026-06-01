import { describe, it, expect } from 'vitest'
import { sortByGuidelineOrder } from '@/lib/reporting/order'
import { GUIDELINES } from '@/lib/reporting/guidelines'
import type { ReportingChecklistItem } from '@/lib/types'

const row = (guideline_id: string, item_code: string): ReportingChecklistItem => ({
  id: `id-${item_code}`,
  session_id: 's1',
  guideline_id,
  item_code,
  section: 'x',
  requirement: 'r',
  status: 'present',
})

describe('sortByGuidelineOrder', () => {
  it('restores canonical guideline order from a shuffled DB read', () => {
    const codes = GUIDELINES.consort_2010.items.map(i => i.code)
    const shuffled = [...codes].reverse().map(c => row('consort_2010', c))
    const sorted = sortByGuidelineOrder(shuffled)
    expect(sorted.map(r => r.item_code)).toEqual(codes)
  })

  it('orders numeric codes numerically, not lexicographically', () => {
    // 2 before 10 — a string sort would put "10" before "2".
    const sorted = sortByGuidelineOrder([row('consort_2010', '10'), row('consort_2010', '2')])
    expect(sorted.map(r => r.item_code)).toEqual(['2', '10'])
  })

  it('pushes unknown codes to the end without throwing, and is a no-op on empty input', () => {
    const sorted = sortByGuidelineOrder([row('consort_2010', 'ZZZ'), row('consort_2010', '1')])
    expect(sorted.map(r => r.item_code)).toEqual(['1', 'ZZZ'])
    expect(sortByGuidelineOrder([])).toEqual([])
  })
})
