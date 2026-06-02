import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_ROLES = ['super_admin', 'admin', 'reviewer', 'author']

export async function PUT(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    await requirePermission('users.assign_role')
    const { role } = (await request.json()) as { role: string }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 })
    }

    // One primary role per user. 'author' is the implicit default → no row.
    const admin = createAdminClient()
    await admin.from('user_roles').delete().eq('user_id', params.userId)
    if (role !== 'author') {
      const { error } = await admin.from('user_roles').insert({ user_id: params.userId, role })
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
