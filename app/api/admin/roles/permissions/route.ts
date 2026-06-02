import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { ROLES, isAdminRole } from '@/lib/admin/roles'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET: the recognized roles + the full permissions catalogue + the
// role→permission grant matrix. The client renders columns from `roles` so
// the matrix can never drift from the roles the system actually honors.
export async function GET() {
  try {
    await requirePermission('system.view_logs')
    const admin = createAdminClient()
    const [{ data: permissions }, { data: grants }] = await Promise.all([
      admin.from('permissions').select('*').order('category'),
      admin.from('role_permissions').select('role, permission_id'),
    ])
    return NextResponse.json({ roles: ROLES, permissions: permissions ?? [], grants: grants ?? [] })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}

// PATCH: grant/revoke a single permission for a role (super_admin only).
export async function PATCH(request: NextRequest) {
  try {
    await requirePermission('system.manage_settings')
    const { role, permissionId, granted } = (await request.json()) as {
      role: string; permissionId: string; granted: boolean
    }
    if (!role || !permissionId) {
      return NextResponse.json({ error: 'role and permissionId required' }, { status: 400 })
    }
    if (!isAdminRole(role)) {
      return NextResponse.json({ error: `unknown role: ${role}` }, { status: 400 })
    }
    if (role === 'super_admin') {
      return NextResponse.json({ error: 'super_admin permissions cannot be edited' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (granted) {
      const { error } = await admin.from('role_permissions')
        .upsert({ role, permission_id: permissionId }, { onConflict: 'role,permission_id' })
      if (error) throw error
    } else {
      const { error } = await admin.from('role_permissions')
        .delete().eq('role', role).eq('permission_id', permissionId)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
