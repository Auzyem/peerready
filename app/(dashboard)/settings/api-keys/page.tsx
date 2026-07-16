'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Copy, Trash2, AlertTriangle, CheckCircle2, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { API_KEY_SCOPES, type ApiKey, type ApiKeyScope } from '@/lib/types'
import { CreateKeyModal } from '@/components/settings/CreateKeyModal'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [planScopes, setPlanScopes] = useState<ApiKeyScope[]>([])
  const [maxKeys, setMaxKeys] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null) // shown once after creation
  const [copied, setCopied] = useState(false)

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/keys')
    const { keys: k } = await res.json()
    setKeys(k ?? [])
    setLoading(false)
  }, [])

  const fetchPlanInfo = useCallback(async () => {
    const [{ plans }, current] = await Promise.all([
      fetch('/api/billing/plans').then((r) => r.json()),
      fetch('/api/billing/current').then((r) => r.json()),
    ])
    if (current.isSuperAdmin) {
      setPlanScopes(Object.keys(API_KEY_SCOPES) as ApiKeyScope[])
      setMaxKeys(-1)
      return
    }
    const plan = plans?.find((p: { id: string }) => p.id === current.plan)
    if (plan) {
      setPlanScopes(plan.allowed_scopes ?? [])
      setMaxKeys(plan.max_api_keys ?? 0)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
    fetchPlanInfo()
  }, [fetchKeys, fetchPlanInfo])

  const handleDelete = async (keyId: string, keyName: string) => {
    if (!confirm(`Revoke "${keyName}"? Any services using this key will immediately lose access.`)) return
    await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
    setKeys((prev) => prev.filter((k) => k.id !== keyId))
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const usedKeys = keys.length
  const atLimit = maxKeys !== -1 && usedKeys >= maxKeys

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">API keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {maxKeys === 0
              ? 'Upgrade to Starter or above to create API keys.'
              : maxKeys === -1
                ? `${usedKeys} key${usedKeys !== 1 ? 's' : ''} · Unlimited`
                : `${usedKeys} of ${maxKeys} keys used`}
          </p>
        </div>
        {maxKeys !== 0 && (
          <Button
            onClick={() => setShowCreate(true)}
            disabled={atLimit}
            className="bg-pr-teal hover:bg-pr-teal-600"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" /> New key
          </Button>
        )}
      </div>

      {/* New key reveal — shown once after creation */}
      {newKey && (
        <div className="mb-5 rounded-lg border border-pr-green/40 bg-pr-green-light p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-pr-green" />
            <span className="text-sm font-medium text-pr-green">
              Key created — save it now. This is the only time it will be shown.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-pr-green/40 bg-white px-3 py-2 font-mono text-xs">
              {newKey}
            </code>
            <Button size="sm" className="bg-pr-green hover:bg-pr-green/90" onClick={() => handleCopy(newKey)}>
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2.5 text-xs text-pr-green hover:underline"
          >
            I have saved this key — dismiss
          </button>
        </div>
      )}

      {/* Free plan upgrade prompt */}
      {maxKeys === 0 && (
        <div className="flex gap-3 rounded-lg border border-pr-gold/40 bg-pr-gold-light p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pr-gold" />
          <div>
            <div className="text-sm font-medium text-[#78350F]">
              API keys require a Starter plan or above
            </div>
            <p className="mb-2.5 mt-1 text-xs text-[#92400E]">
              Connect OJS, Zapier, or any external service to PeerReady by upgrading your plan.
            </p>
            <Button asChild size="sm" className="bg-pr-teal hover:bg-pr-teal-600">
              <a href="/billing">View plans</a>
            </Button>
          </div>
        </div>
      )}

      {/* Keys list */}
      {!loading && keys.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {keys.map((key) => (
            <div key={key.id} className="flex items-start gap-3 px-4 py-3">
              <Key className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{key.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {key.scopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="font-mono">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {key.key_prefix}••••••••{key.key_suffix}
                  {' · '}
                  {key.last_used_at
                    ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}`
                    : 'Never used'}
                  {key.expires_at && ` · Expires ${new Date(key.expires_at).toLocaleDateString()}`}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-pr-red hover:text-pr-red"
                onClick={() => handleDelete(key.id, key.name)}
                aria-label={`Revoke ${key.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loading && keys.length === 0 && maxKeys !== 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No API keys yet. Create one to connect external services.
        </div>
      )}

      {showCreate && (
        <CreateKeyModal
          planScopes={planScopes}
          onCreated={(plain) => {
            setNewKey(plain)
            setShowCreate(false)
            fetchKeys()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
