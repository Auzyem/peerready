'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2, Archive, ArchiveRestore, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManuscriptCard, type ManuscriptRow } from '@/components/manuscripts/ManuscriptCard'

const FIELDS = ['Computer Science', 'Medicine', 'Social Science', 'Humanities', 'Engineering', 'Education', 'Economics', 'Environmental Science', 'Library Science', 'Other']
type Status = 'active' | 'archived' | 'all'
type Action = 'archive' | 'unarchive' | 'delete'

export default function ManuscriptsPage() {
  const router = useRouter()
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [field, setField] = useState('')
  const [status, setStatus] = useState<Status>('active')
  const [sort, setSort] = useState('updated_at')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const fetchManuscripts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ q, field, status, sort })
    const res = await fetch(`/api/manuscripts?${params}`)
    const { manuscripts: m } = await res.json()
    setManuscripts(m ?? [])
    setLoading(false)
    setSelected(new Set())
  }, [q, field, status, sort])

  useEffect(() => { fetchManuscripts() }, [fetchManuscripts])

  const runAction = async (action: Action, ids: string[]) => {
    if (ids.length === 0) return
    if (action === 'delete' && !confirm(`Permanently delete ${ids.length} manuscript(s)? This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/manuscripts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      })
      const text = await res.text()
      let data: { error?: string; affected?: number } = {}
      try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      const verb = action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'restored'
      setToast(`${data.affected ?? ids.length} manuscript(s) ${verb}`)
      await fetchManuscripts()
    } catch (e) {
      setToast(`Error: ${e instanceof Error ? e.message : 'Action failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(prev => (prev.size === manuscripts.length ? new Set() : new Set(manuscripts.map(m => m.id))))
  }

  return (
    <div>
      {toast && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-3 rounded-md bg-pr-teal px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
          <button onClick={() => setToast(null)} className="text-white/60 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold">Manuscripts</h1>
        <Button onClick={() => router.push('/manuscripts/new')}>
          <Plus className="h-4 w-4" /> New manuscript
        </Button>
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by title…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select value={field} onChange={e => setField(e.target.value)} className="h-9 rounded-md border bg-background px-2.5 text-sm">
          <option value="">All fields</option>
          {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-md border">
          {(['active', 'archived', 'all'] as const).map(sv => (
            <button
              key={sv}
              onClick={() => setStatus(sv)}
              className={`h-9 px-3.5 text-xs capitalize transition ${status === sv ? 'bg-pr-teal text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              {sv}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} className="h-9 rounded-md border bg-background px-2.5 text-sm">
          <option value="updated_at">Last updated</option>
          <option value="created_at">Date created</option>
          <option value="title">Title A–Z</option>
          <option value="word_count">Word count</option>
        </select>
      </div>

      {/* Batch toolbar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2.5 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5">
          <span className="flex-1 text-sm text-blue-700">{selected.size} selected</span>
          {status !== 'archived' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction('archive', Array.from(selected))}>
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
          )}
          {status === 'archived' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction('unarchive', Array.from(selected))}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction('delete', Array.from(selected))} className="border-red-300 bg-red-50 text-red-600 hover:bg-red-100">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {manuscripts.length > 0 && (
        <label className="mb-2 flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={selected.size === manuscripts.length && manuscripts.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 cursor-pointer" />
          Select all ({manuscripts.length})
        </label>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : manuscripts.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {q || field ? 'No manuscripts match your search.' : status === 'archived' ? 'No archived manuscripts.' : 'No manuscripts yet. Upload your first one!'}
        </div>
      ) : (
        manuscripts.map(m => (
          <ManuscriptCard
            key={m.id}
            manuscript={m}
            selected={selected.has(m.id)}
            onSelect={() => toggleSelect(m.id)}
            onArchive={() => runAction(m.archived ? 'unarchive' : 'archive', [m.id])}
            onDelete={() => runAction('delete', [m.id])}
          />
        ))
      )}
    </div>
  )
}
