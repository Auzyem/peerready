import { describe, it, expect } from 'vitest'
import { GUIDELINES, GUIDELINE_IDS } from '@/lib/reporting/guidelines'

const EXPECTED_COUNTS: Record<string, number> = {
  consort_2010: 25,
  prisma_2020: 27,
  arrive_2: 10,
  strobe: 22,
  generic: 8,
}

describe('GUIDELINES', () => {
  it('exposes exactly the five v1 guideline ids', () => {
    expect([...GUIDELINE_IDS].sort()).toEqual(
      ['arrive_2', 'consort_2010', 'generic', 'prisma_2020', 'strobe'].sort()
    )
  })

  it('every id in GUIDELINE_IDS has a guideline object with a matching id', () => {
    for (const id of GUIDELINE_IDS) {
      expect(GUIDELINES[id]).toBeDefined()
      expect(GUIDELINES[id].id).toBe(id)
    }
  })

  it('each guideline has the documented number of items', () => {
    for (const id of GUIDELINE_IDS) {
      expect(GUIDELINES[id].items.length).toBe(EXPECTED_COUNTS[id])
    }
  })

  it('item codes are unique within each guideline', () => {
    for (const id of GUIDELINE_IDS) {
      const codes = GUIDELINES[id].items.map(i => i.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('every item has a non-empty requirement and section', () => {
    for (const id of GUIDELINE_IDS) {
      for (const item of GUIDELINES[id].items) {
        expect(item.requirement.trim().length).toBeGreaterThan(0)
        expect(item.section.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
