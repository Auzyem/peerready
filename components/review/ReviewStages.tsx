'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, Loader2 } from 'lucide-react'

interface Stage {
  number: number
  label: string
  status: 'pending' | 'active' | 'complete' | 'failed'
  sessionId: string | null
}

export function ReviewStages({
  manuscriptId,
  currentSessionId,
}: {
  manuscriptId: string
  currentSessionId: string
}) {
  const [stages, setStages] = useState<Stage[]>([])

  useEffect(() => {
    let active = true
    fetch(`/api/manuscripts/${manuscriptId}/stages`)
      .then((r) => r.json())
      .then((d) => { if (active) setStages(d.stages ?? []) })
      .catch(() => {})
    return () => { active = false }
  }, [manuscriptId])

  // Single-review manuscripts look unchanged.
  if (stages.length < 2) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {stages.map((s, i) => {
        const isCurrent = s.sessionId === currentSessionId
        const icon =
          s.status === 'complete' ? <Check className="h-3 w-3" />
          : s.status === 'failed' ? <X className="h-3 w-3" />
          : s.status === 'active' ? <Loader2 className="h-3 w-3 animate-spin" />
          : <span className="text-[10px] leading-none">{s.number}</span>
        const chip = (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              isCurrent
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground'
            }`}
          >
            {icon} {s.label}
          </span>
        )
        return (
          <span key={s.number} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            {s.sessionId && !isCurrent ? (
              <Link href={`/manuscripts/${manuscriptId}/review/${s.sessionId}`}>{chip}</Link>
            ) : (
              chip
            )}
          </span>
        )
      })}
    </div>
  )
}
