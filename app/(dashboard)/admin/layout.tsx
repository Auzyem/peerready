import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/admin/roles'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const hasAdminAccess = (roles ?? []).some(r => isAdminRole(r.role))
  if (!hasAdminAccess) redirect('/dashboard')

  return <>{children}</>
}
