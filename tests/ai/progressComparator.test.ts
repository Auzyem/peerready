import { describe, it, expect } from 'vitest'
import { buildProgressContext } from '@/lib/ai/prompts/progressComparator'
import type { Score, Annotation } from '@/lib/types'

function score(dimension: Score['dimension'], s: number): Score {
  return { id: dimension, session_id: 's', dimension, score: s, max_score: 10 }
}
function annotation(severity: Annotation['severity'], comment: string): Annotation {
  return { id: comment, session_id: 's', severity, comment, resolved: false }
}

describe('buildProgressContext', () => {
  it('renders each dimension as v1 -> v2', () => {
    const ctx = buildProgressContext({
      v1Scores: [score('methodology', 3)],
      v2Scores: [score('methodology', 6)],
      v1Annotations: [],
    })
    expect(ctx).toContain('methodology: 3 -> 6')
  })

  it('lists prior-version reviewer comments with severity', () => {
    const ctx = buildProgressContext({
      v1Scores: [],
      v2Scores: [],
      v1Annotations: [annotation('major', 'unclear sampling')],
    })
    expect(ctx).toContain('[major] unclear sampling')
  })

  it('omits the comments section when there are no prior annotations', () => {
    const ctx = buildProgressContext({
      v1Scores: [score('originality', 5)],
      v2Scores: [score('originality', 5)],
      v1Annotations: [],
    })
    expect(ctx).not.toMatch(/reviewer comments/i)
  })

  it('marks a missing score as n/a rather than crashing', () => {
    const ctx = buildProgressContext({
      v1Scores: [score('methodology', 4)],
      v2Scores: [],
      v1Annotations: [],
    })
    expect(ctx).toContain('methodology: 4 -> n/a')
  })
})
