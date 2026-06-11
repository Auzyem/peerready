import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requirePermission('api_keys.view')
    const admin = createAdminClient()

    const q = new URL(request.url).searchParams.get('q') ?? ''

    let query = admin
      .from('api_keys')
      .select(
        'id, name, key_prefix, key_suffix, scopes, environment, last_used_at, created_at, profiles(email, full_name)'
      )
      .eq('revoked', false)
      .order('created_at', { ascending: false })
      .limit(100)

    if (q) query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ keys: data ?? [] })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
