'use client'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'

export function TopBar({ email }: { email?: string }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="text-sm text-muted-foreground">{email}</div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {/* Server-side sign out: clears the cookie before redirecting so the
            middleware never sees a stale session. */}
        <form action="/api/auth/signout" method="POST">
          <Button type="submit" variant="outline" size="sm">Sign out</Button>
        </form>
      </div>
    </header>
  )
}
