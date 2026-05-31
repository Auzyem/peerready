import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ProgressComparatorResult } from '@/lib/types'

const READINESS: Record<ProgressComparatorResult['readiness'], { label: string; color: string }> = {
  not_ready: { label: 'Not ready', color: 'bg-red-100 text-red-800' },
  minor_fixes: { label: 'Minor fixes left', color: 'bg-amber-100 text-amber-800' },
  submission_ready: { label: 'Submission ready', color: 'bg-green-100 text-green-800' },
}

const ADDRESSED: Record<string, string> = {
  fully: 'text-green-700',
  partially: 'text-amber-700',
  not_addressed: 'text-red-700',
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (!items || items.length === 0) return null
  return (
    <section>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <ul className={`list-disc space-y-1 pl-5 text-sm ${tone ?? ''}`}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  )
}

export function ProgressComparator({ delta }: { delta: ProgressComparatorResult }) {
  const readiness = READINESS[delta.readiness] ?? { label: delta.readiness, color: 'bg-gray-100 text-gray-800' }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Badge className={readiness.color}>{readiness.label}</Badge>
        <span className="text-sm text-muted-foreground">{delta.recommended_action}</span>
      </div>

      {delta.overall_summary && <p className="text-sm">{delta.overall_summary}</p>}

      <section>
        <h3 className="mb-2 text-sm font-medium">Dimension changes (v1 → v2)</h3>
        <div className="space-y-1">
          {delta.dimension_changes.map(c => {
            const arrow = c.delta > 0 ? '▲' : c.delta < 0 ? '▼' : '—'
            const color = c.delta > 0 ? 'text-green-700' : c.delta < 0 ? 'text-red-700' : 'text-muted-foreground'
            return (
              <Card key={c.dimension} className="flex items-center justify-between p-2 text-sm">
                <span className="capitalize">{String(c.dimension).replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">{c.v1_score} → {c.v2_score}</span>
                  <span className={`tabular-nums ${color}`}>{arrow} {c.delta > 0 ? `+${c.delta}` : c.delta}</span>
                  <span className={`text-xs ${ADDRESSED[c.comment_addressed] ?? ''}`}>
                    {c.comment_addressed.replace(/_/g, ' ')}
                  </span>
                </span>
              </Card>
            )
          })}
        </div>
      </section>

      <List title="Top improvements" items={delta.top_improvements} tone="text-green-700" />
      <List title="Remaining issues" items={delta.remaining_issues} tone="text-amber-700" />
      <List title="New problems introduced" items={delta.new_problems_introduced} tone="text-red-700" />
    </div>
  )
}
