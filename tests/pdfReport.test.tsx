import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReviewPDFDocument } from '@/lib/pdf/ReviewReport'
import type { ReviewSession } from '@/lib/types'

const session = {
  id: 's1', draft_id: 'd1', status: 'complete', mode: 'standard',
  verdict: 'minor_revision', overall_score: 62,
  strength_summary: 'Clear contribution.', weakness_summary: 'Thin related work.',
  created_at: new Date().toISOString(),
  scores: [{ id: 'sc1', session_id: 's1', dimension: 'originality', score: 8, max_score: 10 }],
  annotations: [{ id: 'a1', session_id: 's1', severity: 'major', comment: 'Clarify RQ', resolved: false }],
  adversarial_critiques: [],
  journal_matches: [],
  drafts: { manuscripts: { title: 'A Test Paper' } },
} as unknown as ReviewSession & { drafts?: { manuscripts?: { title?: string } } }

describe('ReviewPDFDocument', () => {
  it('renders a non-empty PDF buffer', async () => {
    const buffer = await renderToBuffer(
      createElement(ReviewPDFDocument, { session, generatedAt: '01 Jun 2026, 10:00' })
    )
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})
