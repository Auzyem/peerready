import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReviewMatrix } from '@/lib/exporters/reviewMatrix'
import type { ReviewSession } from '@/lib/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS: only returns the row if the session belongs to the user.
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      scores(*),
      annotations(*),
      adversarial_critiques(*),
      journal_matches(*),
      drafts(manuscripts(title))
    `)
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const title = (session.drafts as unknown as { manuscripts?: { title?: string } } | null)
    ?.manuscripts?.title

  const buffer = generateReviewMatrix(session as unknown as ReviewSession, title)
  const safeId = params.sessionId.replace(/[^a-zA-Z0-9-]/g, '')

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="peerready-review-${safeId}.xlsx"`,
    },
  })
}
