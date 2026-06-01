import { GUIDELINES, type ReportingGuidelineId } from './guidelines'
import type { ReportingChecklistItem } from '@/lib/types'

// Reconstruct the canonical guideline order (section order + within-section order) from the
// static guideline data. The DB read has no ORDER BY and every row shares one `created_at`
// (single batched insert), so the order PostgREST returns is otherwise undefined — a string
// sort on the numeric `item_code` would also be wrong ("1","10","11",…,"2"). Items the
// guideline doesn't know about (or rows from an unknown guideline) sort to the end, stably.
export function sortByGuidelineOrder(items: ReportingChecklistItem[]): ReportingChecklistItem[] {
  if (items.length === 0) return items
  const guideline = GUIDELINES[items[0].guideline_id as ReportingGuidelineId]
  if (!guideline) return items
  const index = new Map(guideline.items.map((it, i) => [it.code, i]))
  const rank = (code: string) => index.get(code) ?? Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => rank(a.item_code) - rank(b.item_code))
}
