import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { computeCompleteness } from '@/lib/reporting/completeness'
import type { ReportingChecklistItem, ChecklistItemStatus } from '@/lib/types'

const STATUS_COLOR: Record<ChecklistItemStatus, string> = {
  present: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  missing: 'bg-red-100 text-red-800',
  not_applicable: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<ChecklistItemStatus, string> = {
  present: 'Present',
  partial: 'Partial',
  missing: 'Missing',
  not_applicable: 'N/A',
}

export function ReportingChecklist({
  items,
  guidelineName,
}: {
  items: ReportingChecklistItem[]
  guidelineName?: string
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No checklist results yet.</p>
  }

  const applicable = items.filter(i => i.status !== 'not_applicable')
  const present = items.filter(i => i.status === 'present').length
  const pct = Math.round(computeCompleteness(items) * 100)

  // Group by section, preserving first-seen order.
  const sections: { name: string; items: ReportingChecklistItem[] }[] = []
  for (const item of items) {
    const name = item.section ?? 'Other'
    let group = sections.find(s => s.name === name)
    if (!group) { group = { name, items: [] }; sections.push(group) }
    group.items.push(item)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {guidelineName && <span className="font-medium">{guidelineName}</span>}
        <span className="text-sm text-muted-foreground">
          {present} / {applicable.length} satisfied · {pct}% complete
        </span>
      </div>

      {sections.map(section => (
        <div key={section.name}>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{section.name}</h4>
          <div className="space-y-2">
            {section.items.map(item => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">#{item.item_code}</span>
                    {item.requirement && <p className="text-sm">{item.requirement}</p>}
                  </div>
                  <Badge className={STATUS_COLOR[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                </div>
                {item.evidence && (
                  <p className="mt-1 text-xs text-muted-foreground">Evidence: {item.evidence}</p>
                )}
                {item.fix && item.status !== 'present' && (
                  <p className="mt-1 text-sm text-amber-700">Fix: {item.fix}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
