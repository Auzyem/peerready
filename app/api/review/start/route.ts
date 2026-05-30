import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runReviewPipeline } from '@/lib/ai/pipeline'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { draftId, mode = 'standard' } = await request.json()
  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

  const { data: session, error } = await supabase
    .from('review_sessions')
    .insert({ draft_id: draftId, mode, status: 'queued' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Run the pipeline detached from the response lifecycle.
  waitUntil(runReviewPipeline(session.id))

  return NextResponse.json({ sessionId: session.id })
}
