import { describe, it, expect } from 'vitest'
import { buildPriorReviewContext } from '@/lib/ai/prompts/adversarialReviewer'
import type { Score } from '@/lib/types'

function score(partial: Partial<Score>): Score {
  return {
    id: 'x',
    session_id: 's',
    dimension: 'methodology',
    score: 5,
    max_score: 10,
    rationale: 'r',
    improvements: [],
    ...partial,
  } as Score
}

describe('buildPriorReviewContext', () => {
  it('includes the weakness summary and the three lowest dimensions with rationales', () => {
    const scores: Score[] = [
      score({ dimension: 'originality', score: 8, rationale: 'novel' }),
      score({ dimension: 'methodology', score: 3, rationale: 'weak design' }),
      score({ dimension: 'evidence_quality', score: 4, rationale: 'thin data' }),
      score({ dimension: 'significance', score: 9, rationale: 'matters' }),
    ]
    const ctx = buildPriorReviewContext(scores, 'Underpowered study')
    expect(ctx).toContain('Underpowered study')
    expect(ctx).toContain('methodology (3/10): weak design')
    expect(ctx).toContain('evidence_quality (4/10): thin data')
    // Only the three lowest are kept, so the top dimension is excluded.
    expect(ctx).not.toContain('significance')
  })

  it('returns a fallback when there are no scores and no summary', () => {
    expect(buildPriorReviewContext([], undefined)).toMatch(/independently/i)
  })

  it('tolerates a missing rationale', () => {
    const scores: Score[] = [score({ dimension: 'methodology', score: 2, rationale: undefined })]
    const ctx = buildPriorReviewContext(scores, undefined)
    expect(ctx).toContain('methodology (2/10): no rationale given')
  })
})
