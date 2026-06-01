import { ScoreList } from '../ScoreList'
import { ScoreRadar } from '../ScoreRadar'
import { AnnotationPanel } from '../AnnotationPanel'
import type { ReviewSession } from '@/lib/types'

export function OverviewSection({ session }: { session: ReviewSession }) {
  return (
    <div className="space-y-6">
      {session.strength_summary && (
        <p className="text-sm"><strong>Strengths:</strong> {session.strength_summary}</p>
      )}
      {session.weakness_summary && (
        <p className="text-sm"><strong>Weaknesses:</strong> {session.weakness_summary}</p>
      )}
      <section>
        <h3 className="mb-2 font-medium">Scores</h3>
        <ScoreRadar scores={session.scores ?? []} />
        <ScoreList scores={session.scores ?? []} />
      </section>
      <section>
        <h3 className="mb-2 font-medium">Annotations</h3>
        <AnnotationPanel annotations={session.annotations ?? []} />
      </section>
    </div>
  )
}
