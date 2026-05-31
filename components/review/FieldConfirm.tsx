'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReviewerPersona } from '@/lib/types'

const PERSONAS: ReviewerPersona[] = [
  'biomedical_rct', 'social_science_quant', 'social_science_qual',
  'cs_systems', 'cs_ml_theory', 'economics_theory', 'humanities_interpretive',
  'environmental_science', 'engineering_applied', 'education_research',
]

const personaLabel = (p: string) => p.replace(/_/g, ' ')

export function FieldConfirm({
  sessionId,
  detectedField,
  detectedPersona,
  confidence,
  onConfirmed,
}: {
  sessionId: string
  detectedField?: string
  detectedPersona?: ReviewerPersona
  confidence?: number
  onConfirmed: () => void
}) {
  const [field, setField] = useState(detectedField ?? '')
  const [persona, setPersona] = useState<ReviewerPersona>(detectedPersona ?? 'social_science_quant')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/review/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, field, persona }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to confirm')
      }
      onConfirmed() // parent resumes polling; this component then unmounts
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to confirm')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Confirm the field</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We weren&apos;t fully sure how to classify this manuscript
          {typeof confidence === 'number' && ` (${Math.round(confidence * 100)}% confidence)`}.
          Confirm or correct it before the review runs.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Field</label>
        <input
          value={field}
          onChange={e => setField(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          placeholder="e.g. Environmental Science"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Reviewer persona</label>
        <select
          value={persona}
          onChange={e => setPersona(e.target.value as ReviewerPersona)}
          className="w-full rounded-md border bg-background px-3 py-2 capitalize"
        >
          {PERSONAS.map(p => (
            <option key={p} value={p}>{personaLabel(p)}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={confirm} disabled={busy}>
        {busy ? 'Starting review…' : 'Confirm & continue'}
      </Button>
    </div>
  )
}
