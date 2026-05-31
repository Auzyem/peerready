import { createAdminClient } from '@/lib/supabase/admin'
import { runReportingChecker } from './prompts/reportingChecker'
import { GUIDELINES, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
import type { ChecklistItemStatus } from '@/lib/types'

export async function runReportingCheckPipeline(sessionId: string) {
  const supabase = createAdminClient()

  try {
    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'running' })
      .eq('id', sessionId)

    const { data: session, error } = await supabase
      .from('review_sessions')
      .select('*, drafts(*, manuscripts(*))')
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')

    const guidelineId = session.reporting_guideline_id as ReportingGuidelineId | null
    const guideline = guidelineId ? GUIDELINES[guidelineId] : undefined
    if (!guideline) throw new Error('No guideline selected for this session')

    const draft = session.drafts as unknown as { parsed_text?: string }
    const manuscriptText = draft.parsed_text || ''

    const result = await runReportingChecker({ manuscriptText, guideline })

    // Build verdict lookup from the model, then iterate the CANONICAL items so the
    // row set is always complete even if the model omits one (default: missing).
    const byCode = new Map(result.items.map(i => [i.code, i]))
    const rows = guideline.items.map(item => {
      const verdict = byCode.get(item.code)
      const status = (verdict?.status ?? 'missing') as ChecklistItemStatus
      return {
        session_id: sessionId,
        guideline_id: guideline.id,
        item_code: item.code,
        section: item.section,
        requirement: item.requirement,
        status,
        evidence: verdict?.evidence ?? '',
        fix: verdict?.fix ?? '',
      }
    })
    if (rows.length > 0) {
      await supabase.from('reporting_checklist_items').insert(rows)
    }

    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'complete', reporting_summary: result.summary })
      .eq('id', sessionId)
  } catch (err: unknown) {
    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'failed' })
      .eq('id', sessionId)
    throw err
  }
}
