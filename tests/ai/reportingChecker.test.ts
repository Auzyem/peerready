import { describe, it, expect } from 'vitest'
import { buildReportingContext } from '@/lib/ai/prompts/reportingChecker'
import { GUIDELINES } from '@/lib/reporting/guidelines'

describe('buildReportingContext', () => {
  it('includes the guideline name and every item code', () => {
    const guideline = GUIDELINES.generic
    const ctx = buildReportingContext({ manuscriptText: 'My paper body.', guideline })
    expect(ctx).toContain(guideline.name)
    for (const item of guideline.items) {
      expect(ctx).toContain(item.code)
    }
  })

  it('includes the manuscript text', () => {
    const ctx = buildReportingContext({ manuscriptText: 'UNIQ_BODY_MARKER', guideline: GUIDELINES.generic })
    expect(ctx).toContain('UNIQ_BODY_MARKER')
  })
})
