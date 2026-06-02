import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runReviewPipeline } from '@/lib/ai/pipeline'
import { RATE_LIMITS, ACTIVE_REVIEW_STATUSES, hourAgoIso } from '@/lib/rateLimit'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { draftId, mode = 'standard' } = await request.json()
  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

  // Rate limit (RLS scopes these counts to the current user):
  // 1) only one actively-running review at a time
  const { data: active } = await supabase
    .from('review_sessions')
    .select('id')
    .in('status', ACTIVE_REVIEW_STATUSES as unknown as string[])
    .limit(1)
  if (active && active.length > 0) {
    return NextResponse.json(
      { error: 'You already have a review in progress. Please wait for it to finish.' },
      { status: 429 }
    )
  }
  // 2) a rolling hourly cap
  const { count } = await supabase
    .from('review_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', hourAgoIso())
  if ((count ?? 0) >= RATE_LIMITS.reviewsPerHour) {
    return NextResponse.json(
      { error: 'Hourly review limit reached. Please try again later.' },
      { status: 429 }
    )
  }

  const { data: session, error } = await supabase
    .from('review_sessions')
    .insert({ draft_id: draftId, mode, status: 'queued' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!session?.id) {
    return NextResponse.json({ error: 'Failed to create review session' }, { status: 500 })
  }

  // Run the pipeline detached from the response lifecycle. The promise starts
  // executing immediately; waitUntil keeps the serverless function alive on
  // Vercel until it settles. Outside the Vercel runtime (e.g. `next dev`),
  // waitUntil can throw — the pipeline is already running, so we swallow it.
  const pipeline = runReviewPipeline(session.id)
  pipeline.catch((e) => console.error('[review pipeline] failed:', e))
  try {
    waitUntil(pipeline)
  } catch {
    // Non-Vercel runtime: the floating promise above continues on its own.
  }

  return NextResponse.json({ sessionId: session.id })
  } catch (error: unknown) {
    console.error('[api/review/start] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to start review'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
