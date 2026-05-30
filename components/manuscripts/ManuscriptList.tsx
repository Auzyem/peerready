import { ManuscriptCard } from './ManuscriptCard'
import type { Manuscript } from '@/lib/types'

export function ManuscriptList({ manuscripts }: { manuscripts: Manuscript[] }) {
  if (manuscripts.length === 0) {
    return <p className="text-muted-foreground">No manuscripts yet.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {manuscripts.map(m => <ManuscriptCard key={m.id} m={m} />)}
    </div>
  )
}
