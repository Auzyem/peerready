import type { ReviewStatus } from '@/lib/types'

export type StageStatus = 'pending' | 'active' | 'complete' | 'failed'

// Review N == the draft's version number (one review per uploaded revision).
export function reviewNumberFromSession(
  session: { drafts?: { version_number?: number } | null } | null | undefined
): number {
  return session?.drafts?.version_number ?? 1
}

// Coarse stage status for the tracker. Any non-terminal lifecycle status is "active".
export function stageStatusFromSession(
  session: { status?: ReviewStatus } | null | undefined
): StageStatus {
  if (!session) return 'pending'
  if (session.status === 'complete') return 'complete'
  if (session.status === 'failed') return 'failed'
  return 'active'
}
