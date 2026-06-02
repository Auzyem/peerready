'use client'
import { useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type UploadStage = 'idle' | 'uploading' | 'creating_session' | 'done' | 'error'

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: 'Submit for review',
  uploading: 'Uploading manuscript…',
  creating_session: 'Creating next review…',
  done: 'Redirecting…',
  error: 'Try again',
}

export default function UploadRevisionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<UploadStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(pdf|docx)$/i)) {
      setError('Only PDF and DOCX files are accepted.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB.')
      return
    }
    setError(null)
    setFile(f)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const busy = stage === 'uploading' || stage === 'creating_session' || stage === 'done'

  async function safeJson<T>(res: Response): Promise<T> {
    const text = await res.text()
    try { return JSON.parse(text) as T } catch {
      throw new Error(text.slice(0, 200) || `Server error (${res.status})`)
    }
  }

  const handleSubmit = async () => {
    if (!file) return
    setStage('uploading')
    setError(null)
    try {
      // 1) Upload the revised file → creates a new draft (version_number + 1).
      const formData = new FormData()
      formData.append('file', file)
      formData.append('manuscriptId', params.id)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      const uploadData = await safeJson<{ error?: string; draft?: { id?: string } }>(uploadRes)
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed')
      if (!uploadData.draft?.id) throw new Error('No draft returned from upload')

      // 2) Start a review on the new draft. The pipeline auto-compares against
      //    the prior completed review and records the progress delta.
      setStage('creating_session')
      const sessionRes = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: uploadData.draft.id, mode: 'standard' }),
      })
      const sessionData = await safeJson<{ error?: string; sessionId?: string }>(sessionRes)
      if (!sessionRes.ok) throw new Error(sessionData.error ?? 'Failed to start review')
      if (!sessionData.sessionId) throw new Error('No sessionId returned')

      // 3) Navigate to the new review session.
      setStage('done')
      await new Promise(r => setTimeout(r, 600))
      router.push(`/manuscripts/${params.id}/review/${sessionData.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setStage('error')
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Upload revised manuscript</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your revised file. The system compares it against the previous review and
          generates the next review automatically.
        </p>
      </div>

      <Card
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById('revision-file-input')?.click()}
        className={`mb-4 cursor-pointer border-2 border-dashed p-9 text-center transition ${
          dragOver ? 'border-pr-teal bg-pr-teal/5' : 'border-border'
        }`}
      >
        <input
          id="revision-file-input"
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-5 w-5 text-pr-teal" />
            <div className="text-left">
              <div className="text-sm font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB · Click to change
              </div>
            </div>
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-2.5 h-7 w-7 text-muted-foreground" />
            <div className="text-sm font-medium">Drop your revised manuscript here</div>
            <div className="mt-1 text-xs text-muted-foreground">PDF or DOCX · Max 10 MB</div>
          </>
        )}
      </Card>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {stage === 'done' && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Review created — redirecting…
        </div>
      )}

      <Button onClick={handleSubmit} disabled={!file || busy} className="w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {STAGE_LABELS[stage]}
      </Button>
      <Button variant="outline" onClick={() => router.back()} className="mt-2.5 w-full" disabled={busy}>
        Cancel
      </Button>
    </div>
  )
}
