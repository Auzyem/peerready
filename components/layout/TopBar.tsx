'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function TopBar({ email }: { email?: string }) {
  const router = useRouter()
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="text-sm text-muted-foreground">{email}</div>
      <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
    </header>
  )
}
