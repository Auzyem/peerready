// Lightweight, dependency-free rate limiting. Counts are done against the
// RLS-scoped Supabase client (so they're per-user and survive across serverless
// instances, unlike in-memory counters). Coarse but real.

export const RATE_LIMITS = {
  reviewsPerHour: 10,
  uploadsPerHour: 10,
}

// Main-review statuses that count as "actively running" — we allow only one at a
// time per user. awaiting_confirmation is excluded (it's idle, waiting on the user).
export const ACTIVE_REVIEW_STATUSES = ['queued', 'routing', 'reviewing'] as const

/** ISO timestamp one hour before `now` (ms). Pure, for the rolling-window cutoff. */
export function hourAgoIso(now: number = Date.now()): string {
  return new Date(now - 60 * 60 * 1000).toISOString()
}
