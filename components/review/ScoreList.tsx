import { Card } from '@/components/ui/card'
import type { Score } from '@/lib/types'

export function ScoreList({ scores }: { scores: Score[] }) {
  return (
    <div className="space-y-2">
      {scores.map(s => (
        <Card key={s.id} className="p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize">{s.dimension.replace(/_/g, ' ')}</span>
            <span className="text-sm">{s.score}/{s.max_score}</span>
          </div>
          {s.rationale && <p className="mt-1 text-sm text-muted-foreground">{s.rationale}</p>}
        </Card>
      ))}
    </div>
  )
}
