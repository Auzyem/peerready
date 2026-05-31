import type { ChecklistItemStatus } from '@/lib/types'

// (present + 0.5*partial) / (total - not_applicable), in [0,1]. 0 when no applicable items.
export function computeCompleteness(items: Array<{ status: ChecklistItemStatus }>): number {
  const applicable = items.filter(i => i.status !== 'not_applicable')
  if (applicable.length === 0) return 0
  const earned = applicable.reduce((sum, i) => sum + (i.status === 'present' ? 1 : i.status === 'partial' ? 0.5 : 0), 0)
  return earned / applicable.length
}
