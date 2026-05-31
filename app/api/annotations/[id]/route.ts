import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const resolved = (body as { resolved?: unknown }).resolved
  if (typeof resolved !== 'boolean') {
    return NextResponse.json({ error: 'resolved (boolean) required' }, { status: 400 })
  }

  // RLS restricts the update to annotations the user owns (via the manuscript join).
  const { error } = await supabase
    .from('annotations')
    .update({ resolved })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, resolved })
}
