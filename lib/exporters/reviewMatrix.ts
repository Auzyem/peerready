import * as XLSX from 'xlsx'
import { sortByGuidelineOrder } from '@/lib/reporting/order'
import type { ReviewSession } from '@/lib/types'

type Cell = string | number | null

/**
 * Build a multi-sheet XLSX "reviewer response matrix" for a completed review:
 *   1. Score Summary       — the 8 dimensions, rationale, improvements, overall + verdict
 *   2. Response Matrix     — annotations with a blank column for the author's response
 *   3. Adversarial Review  — escalated critiques with a status column
 *   4. Journal Targets     — ranked journal recommendations
 *   5. Reporting Checklist — per-item status from the applicable reporting guideline
 * Pure and synchronous so it's trivially testable (read the buffer back with XLSX.read).
 */
export function generateReviewMatrix(session: ReviewSession, manuscriptTitle?: string): Buffer {
  const wb = XLSX.utils.book_new()

  // Sheet 1 — Score summary
  const scoreData: Cell[][] = [
    ['Manuscript', manuscriptTitle ?? ''],
    [],
    ['Dimension', 'Score', 'Max', 'Rationale', 'Improvements'],
    ...(session.scores ?? []).map((s): Cell[] => [
      s.dimension.replace(/_/g, ' '),
      s.score,
      s.max_score,
      s.rationale ?? '',
      (s.improvements ?? []).join('; '),
    ]),
    [],
    ['Overall score', session.overall_score ?? '', 80],
    ['Verdict', (session.verdict ?? '').replace(/_/g, ' ')],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scoreData), 'Score Summary')

  // Sheet 2 — Reviewer response matrix (blank column for the author to fill in)
  const responseData: Cell[][] = [
    ['#', 'Section', 'Severity', 'Reviewer comment', 'Suggestion', 'Your response (fill in)', 'Status'],
    ...(session.annotations ?? []).map((a, i): Cell[] => [
      i + 1,
      a.section ?? '',
      a.severity,
      a.comment,
      a.suggestion ?? '',
      '',
      a.resolved ? 'Resolved' : 'Pending',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(responseData), 'Response Matrix')

  // Sheet 3 — Adversarial critiques
  const adversarialData: Cell[][] = [
    ['#', 'Severity', 'Issue', 'Quoted passage', 'Objection', 'Required fix', 'Status'],
    ...(session.adversarial_critiques ?? [])
      .slice()
      .sort((a, b) => a.critique_number - b.critique_number)
      .map((c): Cell[] => [
        c.critique_number,
        c.severity,
        c.title,
        c.quoted_passage ?? '',
        c.objection,
        c.required_fix,
        c.resolved ? 'Resolved' : 'Pending',
      ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(adversarialData), 'Adversarial Review')

  // Sheet 4 — Journal targets
  const journalData: Cell[][] = [
    ['Rank', 'Journal', 'Publisher', 'Fit', 'Acceptance band', 'Impact factor', 'Avg decision (days)', 'Key change needed', 'Open access', 'APC'],
    ...(session.journal_matches ?? [])
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((j): Cell[] => [
        j.rank,
        j.journal_name,
        j.publisher ?? '',
        typeof j.fit_score === 'number' ? `${Math.round(j.fit_score * 100)}%` : '',
        j.acceptance_band,
        j.impact_factor_range ?? '',
        j.avg_decision_days ?? '',
        j.key_change_required ?? '',
        j.open_access_options ?? '',
        j.apc_cost ?? '',
      ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(journalData), 'Journal Targets')

  // Sheet 5 — Reporting checklist
  const reportingData: Cell[][] = [
    ['Code', 'Section', 'Requirement', 'Status', 'Evidence', 'Fix'],
    ...sortByGuidelineOrder(session.reporting_checklist_items ?? []).map((r): Cell[] => [
      r.item_code,
      r.section ?? '',
      r.requirement ?? '',
      r.status,
      r.evidence ?? '',
      r.fix ?? '',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportingData), 'Reporting Checklist')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
