'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AdminApiKey {
  id: string
  name: string
  key_prefix: string
  key_suffix: string
  scopes: string[]
  environment: string
  last_used_at: string | null
  created_at: string
  profiles?: { email?: string; full_name?: string } | null
}

export function AdminApiKeys() {
  const [keys, setKeys] = useState<AdminApiKey[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/api-keys?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setKeys(data.keys ?? [])
    setLoading(false)
  }, [q])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const revokeKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Revoke key "${keyName}"? The owning user will lose access immediately.`)) return
    await fetch(`/api/admin/api-keys/${keyId}`, { method: 'DELETE' })
    setKeys((prev) => prev.filter((k) => k.id !== keyId))
  }

  return (
    <div>
      <div className="mb-4 flex gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by key name…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchKeys}>
          Search
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {key.name}
                  <Badge variant="outline" className="font-mono uppercase">
                    {key.environment}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {key.profiles?.email ?? 'unknown'} · {key.key_prefix}••••{key.key_suffix} ·{' '}
                  {key.scopes?.join(', ')}
                </div>
              </div>
              <div
                className={`whitespace-nowrap text-xs ${
                  key.last_used_at ? 'text-pr-teal' : 'text-muted-foreground'
                }`}
              >
                {key.last_used_at
                  ? `Used ${new Date(key.last_used_at).toLocaleDateString()}`
                  : 'Never used'}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-pr-red hover:text-pr-red"
                onClick={() => revokeKey(key.id, key.name)}
                aria-label="Revoke key"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {keys.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No keys found.</div>
          )}
        </div>
      )}
    </div>
  )
}
