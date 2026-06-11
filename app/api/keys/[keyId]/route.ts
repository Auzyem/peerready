import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Soft-delete: mark revoked (preserves the row for audit). RLS + the explicit
// user_id filter ensure a user can only revoke their own keys.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('api_keys')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', params.keyId)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to revoke key'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
