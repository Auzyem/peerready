'use client'
import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_KEY_SCOPES } from '@/lib/types'
import type { ApiKeyScope } from '@/lib/types'

interface Props {
  planScopes: ApiKeyScope[]
  onCreated: (plainKey: string) => void
  onClose: () => void
}

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never expires' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
]

function expiryToDate(value: string): string | null {
  if (value === 'never') return null
  const days = ({ '7d': 7, '30d': 30, '90d': 90, '1y': 365 } as Record<string, number>)[value] ?? 30
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function CreateKeyModal({ planScopes, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([])
  const [environment, setEnvironment] = useState<'live' | 'test'>('live')
  const [expiry, setExpiry] = useState('never')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleScope = (scope: ApiKeyScope) =>
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )

  const handleCreate = async () => {
    if (!name.trim()) return setError('Please enter a name for this key.')
    if (selectedScopes.length === 0) return setError('Please select at least one scope.')

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes: selectedScopes,
          environment,
          expiresAt: expiryToDate(expiry),
        }),
      })
      const text = await res.text()
      let data: { key?: { plain_key: string }; error?: string } = {}
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Server error: ${text.slice(0, 200)}`)
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create key')
      onCreated(data.key!.plain_key)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-pr-navy px-4 py-3">
          <span className="flex-1 text-sm font-medium text-white">Create new API key</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium">Key name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OJS – AJLII journal"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Environment */}
          <div>
            <label className="mb-1.5 block text-xs font-medium">Environment</label>
            <div className="flex gap-2">
              {(['live', 'test'] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => setEnvironment(env)}
                  className={`flex-1 rounded-md border py-1.5 text-xs capitalize transition-colors ${
                    environment === env
                      ? 'border-pr-teal bg-pr-teal text-white'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="mb-1.5 block text-xs font-medium">Expiry</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scopes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium">Scopes</label>
            {planScopes.length === 0 ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Your plan has no available scopes.
              </p>
            ) : (
              <div className="divide-y overflow-hidden rounded-md border">
                {planScopes.map((scope) => {
                  const meta = API_KEY_SCOPES[scope]
                  const checked = selectedScopes.includes(scope)
                  return (
                    <label
                      key={scope}
                      className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 ${
                        checked ? 'bg-pr-teal-tint' : 'bg-background'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      <div>
                        <div
                          className={`font-mono text-xs font-medium ${
                            checked ? 'text-pr-teal' : 'text-foreground'
                          }`}
                        >
                          {scope}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{meta?.description}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-pr-red-light px-3 py-2 text-xs text-pr-red">{error}</div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={loading} className="flex-1 bg-pr-teal hover:bg-pr-teal-600">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating…' : 'Create key'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
