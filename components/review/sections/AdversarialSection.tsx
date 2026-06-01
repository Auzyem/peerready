import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AdversarialPanel } from '../AdversarialPanel'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function AdversarialSection({
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
            Run a harsher second-pass review that escalates the weaknesses above.
          </p>
          <Button onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Run adversarial critique'}
          </Button>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Running adversarial critique…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && (
        <div className="space-y-4">
          {session.adversarial_summary && (
            <p className="text-sm"><strong>Biggest risk:</strong> {session.adversarial_summary}</p>
          )}
          <AdversarialPanel critiques={session.adversarial_critiques ?? []} />
        </div>
      )}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Adversarial critique failed.</p>
          <Button onClick={onStart} disabled={starting}>{starting ? 'Retrying…' : 'Retry'}</Button>
        </div>
      )}
    </div>
  )
}
