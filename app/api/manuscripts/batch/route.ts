import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BatchAction = 'archive' | 'unarchive' | 'delete'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action, ids } = (await request.json()) as { action: BatchAction; ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No manuscript IDs provided' }, { status: 400 })
    }

    // Verify every id belongs to this user (defence in depth alongside RLS).
    const { data: owned } = await supabase
      .from('manuscripts').select('id').eq('user_id', user.id).in('id', ids)
    const ownedIds = (owned ?? []).map(m => m.id)
    if (ownedIds.length !== ids.length) {
      return NextResponse.json({ error: 'Unauthorized access to one or more manuscripts' }, { status: 403 })
    }

    if (action === 'archive') {
      const { error } = await supabase.from('manuscripts')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .in('id', ownedIds)
      if (error) throw error
    } else if (action === 'unarchive') {
      const { error } = await supabase.from('manuscripts')
        .update({ archived: false, archived_at: null })
        .in('id', ownedIds)
      if (error) throw error
    } else if (action === 'delete') {
      // FK cascades remove drafts, sessions, scores, annotations, etc.
      const { error } = await supabase.from('manuscripts').delete().in('id', ownedIds)
      if (error) throw error
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, affected: ownedIds.length })
  } catch (error: unknown) {
    console.error('[api/manuscripts/batch] error:', error)
    const message = error instanceof Error ? error.message : 'Batch action failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
