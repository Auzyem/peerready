import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stageStatusFromSession, type StageStatus } from '@/lib/review/sequence'

interface DraftRow {
  id: string
  version_number: number
  review_sessions: Array<{ id: string; status: string; created_at: string }> | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS scopes drafts to the owner via the manuscript policy; an unowned id yields [].
  const { data: drafts } = await supabase
    .from('drafts')
    .select('id, version_number, review_sessions(id, status, created_at)')
    .eq('manuscript_id', params.id)
    .order('version_number', { ascending: true })

  const stages = ((drafts as unknown as DraftRow[]) ?? []).map((d) => {
    const sessions = d.review_sessions ?? []
    // Latest session for this draft = most recent by created_at.
    const latest = sessions.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
    const status: StageStatus = stageStatusFromSession(
      latest ? { status: latest.status as never } : null
    )
    return {
      number: d.version_number,
      label: `Review ${d.version_number}`,
      status,
      sessionId: latest?.id ?? null,
    }
  })

  return NextResponse.json({ stages })
}
