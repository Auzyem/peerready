import { describe, it, expect } from 'vitest'
import { buildJournalMatchContext } from '@/lib/ai/prompts/journalMatcher'

describe('buildJournalMatchContext', () => {
  it('includes title and field', () => {
    const ctx = buildJournalMatchContext({ title: 'On Widgets', field: 'Engineering' })
    expect(ctx).toContain('On Widgets')
    expect(ctx).toContain('Engineering')
  })

  it('renders the overall score out of 80 when provided', () => {
    const ctx = buildJournalMatchContext({ title: 't', field: 'f', overallScore: 62 })
    expect(ctx).toContain('62/80')
  })

  it('omits optional fields that are not provided', () => {
    const ctx = buildJournalMatchContext({ title: 't', field: 'f' })
    expect(ctx).not.toContain('Subfield')
    expect(ctx).not.toContain('Strengths')
    expect(ctx).not.toContain('Author career stage')
  })

  it('includes career stage and summaries when provided', () => {
    const ctx = buildJournalMatchContext({
      title: 't',
      field: 'f',
      careerStage: 'phd_student',
      strengthSummary: 'novel method',
      weaknessSummary: 'small sample',
    })
    expect(ctx).toContain('phd_student')
    expect(ctx).toContain('novel method')
    expect(ctx).toContain('small sample')
  })
})
