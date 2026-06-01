import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { generateReviewMatrix } from '@/lib/exporters/reviewMatrix'
import type { ReviewSession } from '@/lib/types'

function sampleSession(): ReviewSession {
  return {
    id: 's1',
    draft_id: 'd1',
    status: 'complete',
    mode: 'standard',
    overall_score: 62,
    verdict: 'minor_revision',
    strength_summary: 'novel method',
    weakness_summary: 'small sample',
    created_at: '2026-01-01',
    scores: [
      { id: 'sc1', session_id: 's1', dimension: 'methodology', score: 7, max_score: 10, rationale: 'sound', improvements: ['add power analysis'] },
    ],
    annotations: [
      { id: 'a1', session_id: 's1', section: 'Methods', severity: 'major', comment: 'unclear sampling', suggestion: 'describe recruitment', resolved: false },
    ],
    adversarial_critiques: [
      { id: 'c1', session_id: 's1', critique_number: 1, severity: 'critical', title: 'No control group', quoted_passage: 'we observed', objection: 'no baseline', required_fix: 'add control', section_reference: 'Methods', resolved: false },
    ],
    journal_matches: [
      { id: 'j1', session_id: 's1', rank: 1, journal_name: 'Journal of Widgets', publisher: 'Elsevier', fit_score: 0.82, acceptance_band: 'medium', impact_factor_range: '4.2-5.8', avg_decision_days: 60, key_change_required: 'add control', open_access_options: 'Hybrid', apc_cost: '$2,500 APC', rationale: 'good scope fit' },
    ],
    reporting_checklist_items: [
      { id: 'r1', session_id: 's1', guideline_id: 'consort_2010', item_code: '1', section: 'Title and abstract', requirement: 'Identification as a randomised trial in the title', status: 'present', evidence: 'title says RCT', fix: '' },
    ],
  }
}

describe('generateReviewMatrix', () => {
  it('produces a workbook with the five expected sheets', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames).toEqual([
      'Score Summary',
      'Response Matrix',
      'Adversarial Review',
      'Journal Targets',
      'Reporting Checklist',
    ])
  })

  it('writes the journal name into the Journal Targets sheet', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Journal Targets'], { header: 1 })
    const flat = rows.flat().join(' ')
    expect(flat).toContain('Journal of Widgets')
  })

  it('includes the overall score and verdict in the Score Summary sheet', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Score Summary'], { header: 1 })
    const flat = rows.flat().join(' ')
    expect(flat).toContain('62')
    expect(flat).toContain('minor revision')
  })

  it('writes checklist items into the Reporting Checklist sheet', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Reporting Checklist'], { header: 1 })
    const flat = rows.flat().join(' ')
    expect(flat).toContain('Identification as a randomised trial in the title')
  })

  it('does not throw when result sections are empty', () => {
    const empty: ReviewSession = { ...sampleSession(), scores: [], annotations: [], adversarial_critiques: [], journal_matches: [], reporting_checklist_items: [] }
    expect(() => generateReviewMatrix(empty, 'Empty')).not.toThrow()
  })
})
