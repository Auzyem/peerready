'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function UploadDropzone({ manuscriptId, onError }: {
  manuscriptId: string
  onError?: (msg: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  function pick(f: File | null) {
    if (!f) return
    const ok = /\.(pdf|docx)$/i.test(f.name)
    if (!ok) { onError?.('Only .pdf and .docx files are supported'); return }
    setFile(f)
  }

  async function submit() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('manuscriptId', manuscriptId)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json()
      if (!up.ok) throw new Error(upJson.error || 'Upload failed')

      const start = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: upJson.draft.id }),
      })
      const startJson = await start.json()
      if (!start.ok) throw new Error(startJson.error || 'Could not start review')

      window.location.href = `/manuscripts/${manuscriptId}/review/${startJson.sessionId}`
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : 'Upload failed')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
        className="flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground"
      >
        {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'Drag a .pdf or .docx here, or click to choose'}
        <input type="file" accept=".pdf,.docx" className="hidden"
          onChange={e => pick(e.target.files?.[0] ?? null)} />
      </label>
      <Button onClick={submit} disabled={!file || busy}>
        {busy ? 'Uploading & starting review…' : 'Upload & review'}
      </Button>
    </div>
  )
}
