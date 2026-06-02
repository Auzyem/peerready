import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface UserRow {
  id: string
  email: string
  full_name?: string
  institution?: string
  career_stage?: string
  created_at: string
  subscriptions?: { plan_id?: string; status?: string } | { plan_id?: string; status?: string }[] | null
  user_roles?: { role: string }[] | null
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission('users.view')
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const q    = searchParams.get('q') ?? ''
    const role = searchParams.get('role') ?? ''
    const plan = searchParams.get('plan') ?? ''

    let query = admin
      .from('profiles')
      .select('id, email, full_name, institution, career_stage, created_at, subscriptions(plan_id, status), user_roles(role)')

    if (q) query = query.ilike('email', `%${q}%`)

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    let users = (data ?? []) as unknown as UserRow[]
    if (role) users = users.filter(u => (u.user_roles ?? []).some(r => r.role === role))
    if (plan) users = users.filter(u => {
      const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions
      return sub?.plan_id === plan
    })

    return NextResponse.json({ users })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
