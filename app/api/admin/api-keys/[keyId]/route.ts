import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    await requirePermission('api_keys.revoke')
    const admin = createAdminClient()

    const { error } = await admin
      .from('api_keys')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', params.keyId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
