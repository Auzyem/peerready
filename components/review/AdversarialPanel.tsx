'use client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useResolve } from './useResolve'
import type { AdversarialCritique, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AdversarialPanel({ critiques }: { critiques: AdversarialCritique[] }) {
  const { toggle, isResolved, isPending } = useResolve('/api/critiques')

  if (critiques.length === 0) {
    return (
      <p className="text-muted-foreground">
        No critiques — the adversarial reviewer found nothing to escalate.
      </p>
    )
  }
  const sorted = [...critiques].sort((a, b) => {
    const bySeverity = ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)
    return bySeverity !== 0 ? bySeverity : a.critique_number - b.critique_number
  })
  const addressedCount = sorted.filter(c => isResolved(c.id, c.resolved)).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{addressedCount} of {sorted.length} addressed</p>
      {sorted.map(c => {
        const resolved = isResolved(c.id, c.resolved)
        return (
          <Card key={c.id} className={`p-4 ${resolved ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2">
              <Badge className={COLOR[c.severity]}>{c.severity}</Badge>
              <span className="font-medium">{c.title}</span>
              {c.section_reference && (
                <span className="text-xs text-muted-foreground">{c.section_reference}</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={isPending(c.id)}
                onClick={() => toggle(c.id, resolved)}
              >
                {resolved ? 'Addressed ✓' : 'Mark as addressed'}
              </Button>
            </div>
            {c.quoted_passage && (
              <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">
                {c.quoted_passage}
              </blockquote>
            )}
            <p className="mt-2 text-sm">{c.objection}</p>
            <p className="mt-1 text-sm text-green-700">Required fix: {c.required_fix}</p>
          </Card>
        )
      })}
    </div>
  )
}
