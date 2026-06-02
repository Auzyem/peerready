import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const callerId = await requirePermission('users.delete')
    if (callerId === params.userId) {
      return NextResponse.json({ error: 'You cannot delete your own account here.' }, { status: 400 })
    }

    // Deleting the auth user cascades to profiles (and everything below it).
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(params.userId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
