import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/admin/roles'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

// Authenticated pages depend on per-request cookies; never statically prerender.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: sub }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('full_name, career_stage').eq('id', user.id).single(),
    supabase.from('subscriptions').select('plan_id').eq('user_id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ])

  const isAdmin = (roles ?? []).some(r => isAdminRole(r.role))

  return (
    <div className="flex min-h-screen">
      <Sidebar
        name={profile?.full_name ?? undefined}
        careerStage={profile?.career_stage ?? undefined}
        plan={sub?.plan_id ?? 'free'}
        isAdmin={isAdmin}
      />
      <div className="flex flex-1 flex-col">
        <TopBar email={user.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
