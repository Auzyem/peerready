import { ProgressComparator } from '../ProgressComparator'
import type { ReviewSession } from '@/lib/types'

export function ProgressSection({ session }: { session: ReviewSession }) {
  if (!session.score_delta) return null
  return <ProgressComparator delta={session.score_delta} />
}
