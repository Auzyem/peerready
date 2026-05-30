import { createAdminClient } from '@/lib/supabase/admin'
import { runDisciplineRouter } from './prompts/disciplineRouter'
import { runDeepReviewer } from './prompts/deepReviewer'
import type { ReviewStatus } from '@/lib/types'

export async function runReviewPipeline(sessionId: string) {
  const supabase = createAdminClient()

  const updateStatus = async (status: ReviewStatus) => {
    await supabase.from('review_sessions').update({ status }).eq('id', sessionId)
  }

  try {
    const { data: session, error } = await supabase
      .from('review_sessions')
      .select('*, drafts(*, manuscripts(*))')
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')

    const draft = session.drafts as unknown as {
      parsed_text?: string
      manuscripts: {
        id: string
        title?: string
        abstract?: string
        submission_target?: string
        user_id: string
      }
    }
    const manuscript = draft.manuscripts

    const manuscriptText = draft.parsed_text || ''
    const title = manuscript.title || ''
    const abstract = manuscript.abstract || ''

    // Stage 1: discipline routing
    await updateStatus('routing')
    const routing = await runDisciplineRouter(title, abstract)

    await supabase.from('manuscripts').update({
      field: routing.field,
      subfield: routing.subfield,
      doc_type: routing.doc_type,
    }).eq('id', manuscript.id)

    await supabase.from('review_sessions').update({
      reviewer_persona: routing.persona,
    }).eq('id', sessionId)

    // Stage 2: deep review
    await updateStatus('reviewing')
    const review = await runDeepReviewer(
      manuscriptText,
      routing.persona,
      routing.field,
      manuscript.submission_target
    )

    const scoreRows = review.scores.map(s => ({
      session_id: sessionId,
      dimension: s.dimension,
      score: s.score,
      max_score: 10,
      rationale: s.rationale,
      improvements: s.improvements,
    }))
    await supabase.from('scores').insert(scoreRows)

    const annotationRows = review.annotations.map(a => ({
      session_id: sessionId,
      section: a.section,
      severity: a.severity,
      comment: a.comment,
      suggestion: a.suggestion,
    }))
    if (annotationRows.length > 0) {
      await supabase.from('annotations').insert(annotationRows)
    }

    await supabase.from('review_sessions').update({
      overall_score: review.overall_score,
      verdict: review.verdict,
      strength_summary: review.strength_summary,
      weakness_summary: review.weakness_summary,
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('review_sessions').update({
      status: 'failed',
      error_message: message,
    }).eq('id', sessionId)
    throw err
  }
}
