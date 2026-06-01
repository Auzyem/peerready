import type React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReviewPDFDocument } from '@/lib/pdf/ReviewReport'
import { createElement } from 'react'
import { format } from 'date-fns'
import type { ReviewSession } from '@/lib/types'

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS scopes the row to the owner. Select mirrors the status + export routes
  // (keep all review relations consistent across the three select sites).
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      scores(*),
      annotations(*),
      adversarial_critiques(*),
      journal_matches(*),
      reporting_checklist_items(*),
      drafts(manuscripts(title, abstract))
    `)
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm')
  const element = createElement(ReviewPDFDocument, {
    session: session as unknown as ReviewSession & { drafts?: { manuscripts?: { title?: string; abstract?: string } } },
    generatedAt,
  })
  const buffer = await renderToBuffer(
    element as unknown as React.ReactElement<{ title?: string; author?: string }>
  )

  const safeId = params.sessionId.replace(/[^a-zA-Z0-9-]/g, '')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="peerready-review-${safeId}.pdf"`,
    },
  })
}
