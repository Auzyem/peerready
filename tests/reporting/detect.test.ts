import { describe, it, expect } from 'vitest'
import { detectGuideline } from '@/lib/reporting/detect'

describe('detectGuideline', () => {
  it('routes systematic reviews to PRISMA', () => {
    expect(detectGuideline({ docType: 'systematic_review' }).id).toBe('prisma_2020')
  })

  it('routes RCTs to CONSORT via persona', () => {
    expect(detectGuideline({ persona: 'biomedical_rct' }).id).toBe('consort_2010')
  })

  it('routes RCTs to CONSORT via title/abstract phrasing', () => {
    expect(detectGuideline({ title: 'A randomised controlled trial of X' }).id).toBe('consort_2010')
    expect(detectGuideline({ abstract: 'We conducted an RCT.' }).id).toBe('consort_2010')
  })

  it('matches the plural acronym and phrase', () => {
    expect(detectGuideline({ abstract: 'We pooled results from three RCTs.' }).id).toBe('consort_2010')
    expect(detectGuideline({ title: 'Two randomized controlled trials of Y' }).id).toBe('consort_2010')
  })

  it('routes animal studies to ARRIVE', () => {
    expect(detectGuideline({ abstract: 'Experiments were performed in vivo using mice.' }).id).toBe('arrive_2')
  })

  it('routes observational studies to STROBE', () => {
    expect(detectGuideline({ abstract: 'A retrospective cohort study of 400 patients.' }).id).toBe('strobe')
  })

  it('falls back to generic when nothing matches', () => {
    const r = detectGuideline({ title: 'A theoretical note on category theory' })
    expect(r.id).toBe('generic')
    expect(r.rationale.length).toBeGreaterThan(0)
  })

  it('prefers systematic review over RCT phrasing when both could apply', () => {
    expect(detectGuideline({ docType: 'systematic_review', abstract: 'meta-analysis of RCTs' }).id).toBe('prisma_2020')
  })
})
