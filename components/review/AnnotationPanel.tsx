'use client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useResolve } from './useResolve'
import type { Annotation, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AnnotationPanel({ annotations }: { annotations: Annotation[] }) {
  const { toggle, isResolved, isPending } = useResolve('/api/annotations')

  if (annotations.length === 0) {
    return <p className="text-muted-foreground">No annotations.</p>
  }
  const sorted = [...annotations].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)
  )
  const resolvedCount = sorted.filter(a => isResolved(a.id, a.resolved)).length

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{resolvedCount} of {sorted.length} resolved</p>
      {sorted.map(a => {
        const resolved = isResolved(a.id, a.resolved)
        return (
          <Card key={a.id} className={`p-3 ${resolved ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2">
              <Badge className={COLOR[a.severity]}>{a.severity}</Badge>
              {a.section && <span className="text-xs text-muted-foreground">{a.section}</span>}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={isPending(a.id)}
                onClick={() => toggle(a.id, resolved)}
              >
                {resolved ? 'Resolved ✓' : 'Mark resolved'}
              </Button>
            </div>
            <p className="mt-1 text-sm">{a.comment}</p>
            {a.suggestion && <p className="mt-1 text-sm text-green-700">Suggestion: {a.suggestion}</p>}
          </Card>
        )
      })}
    </div>
  )
}
