import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { JournalMatchList } from '../JournalMatchList'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function JournalsSection({
  session, status, starting, onStart,
}: {
  session: ReviewSession
  status: Status
  starting: boolean
  onStart: () => void
}) {
  return (
    <div className="space-y-4">
      {status === 'not_started' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Get a ranked list of journals to target, with acceptance odds, timelines, and the
            key change each one needs — tailored to this review.
          </p>
          <Button onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Find journal matches'}
          </Button>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Finding journal matches…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && <JournalMatchList matches={session.journal_matches ?? []} />}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Journal matching failed.</p>
          <Button onClick={onStart} disabled={starting}>{starting ? 'Retrying…' : 'Retry'}</Button>
        </div>
      )}
    </div>
  )
}
