'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
    // On success the browser is redirected to Google, so nothing else to do here.
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" onClick={signIn} disabled={busy}>
        {busy ? 'Redirecting…' : label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
