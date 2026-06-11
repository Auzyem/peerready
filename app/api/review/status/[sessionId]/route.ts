import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAuth } from '@/lib/apiKeys/middleware'

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Accepts either the session cookie (browser) or an API key with review:read.
  const auth = await resolveAuth(request, ['review:read'])
  if (auth instanceof NextResponse) return auth
  const { userId, viaApiKey } = auth
  const supabase = viaApiKey ? createAdminClient() : createClient()

  const { data: session, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      scores(*),
      annotations(*),
      journal_matches(*),
      adversarial_critiques(*),
      reporting_checklist_items(*),
      drafts(version_number, manuscript_id, manuscripts(user_id, field, subfield, doc_type, title, abstract))
    `)
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // API-key path bypasses RLS — confirm the session belongs to the caller.
  if (viaApiKey) {
    const draft = session.drafts as unknown as { manuscripts?: { user_id?: string } } | null
    if (draft?.manuscripts?.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  return NextResponse.json({ session })
}
