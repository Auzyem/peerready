'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { Logo } from '@/components/layout/Logo'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo size={32} />
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold text-pr-navy">Create your account</h1>
        <form onSubmit={handleSignup} className="space-y-3">
          <input className="w-full rounded border p-2" placeholder="Full name"
            value={fullName} onChange={e => setFullName(e.target.value)} />
          <input className="w-full rounded border p-2" type="email" placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full rounded border p-2" type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Sign up'}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton label="Sign up with Google" />
        <p className="mt-4 text-sm text-muted-foreground">
          Have an account? <Link href="/login" className="underline">Log in</Link>
        </p>
      </Card>
    </div>
  )
}
