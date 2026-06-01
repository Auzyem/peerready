import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept',
  minor_revision: 'Minor revision',
  major_revision: 'Major revision',
  reject: 'Reject',
}

export function ReviewTopBar({
  reviewNumber, verdict, score, sessionId, manuscriptId, onOpenPdf,
}: {
  reviewNumber: number
  verdict?: string
  score: number
  sessionId: string
  manuscriptId: string
  onOpenPdf: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Review {reviewNumber}
      </span>
      <Badge>{VERDICT_LABEL[verdict ?? ''] ?? verdict}</Badge>
      <span className="text-lg font-semibold">{score} / 80</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onOpenPdf}>PDF report</Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/${sessionId}`} download>.xlsx</a>
        </Button>
        <Button asChild size="sm">
          <Link href={`/manuscripts/${manuscriptId}`}>Upload revision</Link>
        </Button>
      </div>
    </div>
  )
}
