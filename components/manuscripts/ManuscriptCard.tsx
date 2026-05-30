import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Manuscript } from '@/lib/types'

export function ManuscriptCard({ m }: { m: Manuscript }) {
  const draftCount = m.drafts?.length ?? 0
  return (
    <Link href={`/manuscripts/${m.id}`}>
      <Card className="p-4 transition hover:shadow">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{m.title}</h3>
          {m.field && <Badge variant="secondary">{m.field}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {draftCount} draft{draftCount === 1 ? '' : 's'}
          {m.word_count ? ` · ${m.word_count.toLocaleString()} words` : ''}
        </p>
      </Card>
    </Link>
  )
}
