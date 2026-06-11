import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Permission =
  | 'users.view' | 'users.edit' | 'users.delete' | 'users.assign_role'
  | 'manuscripts.view_all' | 'manuscripts.delete_any'
  | 'billing.view' | 'billing.edit_plans' | 'billing.edit_discounts'
  | 'system.view_logs' | 'system.manage_settings'
  | 'api_keys.view' | 'api_keys.revoke'

export class PermissionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PermissionError'
    this.status = status
  }
}

/**
 * Verify the caller (via their session cookie) holds `permission`. Returns the
 * caller's user id on success; throws PermissionError otherwise. The actual
 * check runs through the security-definer `user_has_permission` SQL function so
 * the user client never needs direct read access to other users' role rows.
 */
export async function requirePermission(permission: Permission): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new PermissionError('Unauthorized', 401)

  const { data, error } = await supabase.rpc('user_has_permission', {
    p_user_id: user.id,
    p_permission: permission,
  })
  if (error) throw new PermissionError(error.message, 500)
  if (!data) throw new PermissionError('Forbidden', 403)
  return user.id
}

/** Map any thrown error to a JSON response with the right status. */
export function permissionErrorResponse(error: unknown): NextResponse {
  if (error instanceof PermissionError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : 'Server error'
  console.error('[admin] error:', error)
  return NextResponse.json({ error: message }, { status: 500 })
}

/** Flatten the permissions granted to a user's roles (service-role read). */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: roles } = await admin
    .from('user_roles').select('role').eq('user_id', userId)
  const roleNames = (roles ?? []).map(r => r.role)
  if (roleNames.length === 0) return []
  const { data: perms } = await admin
    .from('role_permissions').select('permission_id').in('role', roleNames)
  return Array.from(new Set((perms ?? []).map(p => p.permission_id)))
}
