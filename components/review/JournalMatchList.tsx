import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { JournalMatch, AcceptanceBand } from '@/lib/types'

const BAND_COLOR: Record<AcceptanceBand, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
}
const BAND_LABEL: Record<AcceptanceBand, string> = {
  high: 'High acceptance odds',
  medium: 'Medium acceptance odds',
  low: 'Low acceptance odds',
}

export function JournalMatchList({ matches }: { matches: JournalMatch[] }) {
  if (matches.length === 0) {
    return <p className="text-muted-foreground">No journal matches yet.</p>
  }
  const sorted = [...matches].sort((a, b) => a.rank - b.rank)
  return (
    <div className="space-y-3">
      {sorted.map(j => (
        <Card key={j.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">#{j.rank}</span>
                <span className="font-medium">{j.journal_name}</span>
                {j.publisher && (
                  <span className="text-xs text-muted-foreground">· {j.publisher}</span>
                )}
              </div>
              {j.impact_factor_range && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Impact factor {j.impact_factor_range}
                  {typeof j.avg_decision_days === 'number' &&
                    ` · ~${j.avg_decision_days} days to first decision`}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={BAND_COLOR[j.acceptance_band]}>{BAND_LABEL[j.acceptance_band]}</Badge>
              {typeof j.fit_score === 'number' && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(j.fit_score * 100)}% fit
                </span>
              )}
            </div>
          </div>

          {j.rationale && <p className="mt-2 text-sm">{j.rationale}</p>}
          {j.key_change_required && (
            <p className="mt-1 text-sm text-amber-700">
              To be competitive here: {j.key_change_required}
            </p>
          )}
          {(j.open_access_options || j.apc_cost) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[j.open_access_options, j.apc_cost].filter(Boolean).join(' · ')}
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
