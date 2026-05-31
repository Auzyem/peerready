import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runReportingCheckPipeline } from '@/lib/ai/reportingCheckPipeline'
import { GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, guidelineId } = await request.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  if (!GUIDELINE_IDS.includes(guidelineId as ReportingGuidelineId)) {
    return NextResponse.json({ error: 'Unknown guidelineId' }, { status: 400 })
  }

  // RLS: this select only returns the row if the session belongs to the user.
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select('id, status, reporting_check_status')
    .eq('id', sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.status !== 'complete') {
    return NextResponse.json({ error: 'Standard review is not complete yet' }, { status: 409 })
  }
  if (session.reporting_check_status === 'running' || session.reporting_check_status === 'complete') {
    return NextResponse.json({ error: 'Reporting check already running or complete' }, { status: 409 })
  }

  // Persist the chosen guideline so the pipeline (service-role, no body) can read it.
  await supabase
    .from('review_sessions')
    .update({ reporting_guideline_id: guidelineId })
    .eq('id', sessionId)

  const pipeline = runReportingCheckPipeline(sessionId)
  pipeline.catch((e) => console.error('[reporting check pipeline] failed:', e))
  try {
    waitUntil(pipeline)
  } catch {
    // Non-Vercel runtime: the floating promise above continues on its own.
  }

  return NextResponse.json({ ok: true })
}
