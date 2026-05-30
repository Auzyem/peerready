import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AdversarialCritique, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AdversarialPanel({ critiques }: { critiques: AdversarialCritique[] }) {
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
  return (
    <div className="space-y-3">
      {sorted.map(c => (
        <Card key={c.id} className="p-4">
          <div className="flex items-center gap-2">
            <Badge className={COLOR[c.severity]}>{c.severity}</Badge>
            <span className="font-medium">{c.title}</span>
            {c.section_reference && (
              <span className="text-xs text-muted-foreground">{c.section_reference}</span>
            )}
          </div>
          {c.quoted_passage && (
            <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">
              {c.quoted_passage}
            </blockquote>
          )}
          <p className="mt-2 text-sm">{c.objection}</p>
          <p className="mt-1 text-sm text-green-700">Required fix: {c.required_fix}</p>
        </Card>
      ))}
    </div>
  )
}
