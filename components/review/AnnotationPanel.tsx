import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Annotation, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AnnotationPanel({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return <p className="text-muted-foreground">No annotations.</p>
  return (
    <div className="space-y-4">
      {ORDER.map(sev => {
        const items = annotations.filter(a => a.severity === sev)
        if (items.length === 0) return null
        return (
          <div key={sev}>
            <h4 className="mb-2 font-medium capitalize">{sev} ({items.length})</h4>
            <div className="space-y-2">
              {items.map(a => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge className={COLOR[a.severity]}>{a.severity}</Badge>
                    {a.section && <span className="text-xs text-muted-foreground">{a.section}</span>}
                  </div>
                  <p className="mt-1 text-sm">{a.comment}</p>
                  {a.suggestion && <p className="mt-1 text-sm text-green-700">Fix: {a.suggestion}</p>}
                </Card>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
