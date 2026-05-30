'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UploadDropzone } from '@/components/manuscripts/UploadDropzone'

export default function NewManuscriptPage() {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [manuscriptId, setManuscriptId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function createManuscript(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setError(null)
    const res = await fetch('/api/manuscripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, submission_target: target }),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) { setError(json.error || 'Failed to create'); return }
    setManuscriptId(json.manuscript.id)
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold">New review</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!manuscriptId ? (
        <Card className="p-6">
          <form onSubmit={createManuscript} className="space-y-3">
            <input className="w-full rounded border p-2" placeholder="Manuscript title"
              value={title} onChange={e => setTitle(e.target.value)} required />
            <input className="w-full rounded border p-2" placeholder="Target journal (optional)"
              value={target} onChange={e => setTarget(e.target.value)} />
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Continue to upload'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="mb-3 text-sm text-muted-foreground">Upload your draft to start the review.</p>
          <UploadDropzone manuscriptId={manuscriptId} onError={setError} />
        </Card>
      )}
    </div>
  )
}
