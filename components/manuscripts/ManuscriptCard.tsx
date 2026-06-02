'use client'
import Link from 'next/link'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ReviewSessionLite { id: string; status?: string; overall_score?: number; verdict?: string }
interface DraftLite { id: string; version_number?: number; review_sessions?: ReviewSessionLite[] }
export interface ManuscriptRow {
  id: string
  title: string
  field?: string
  word_count?: number
  archived?: boolean
  drafts?: DraftLite[]
}

const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept', minor_revision: 'Minor revision', major_revision: 'Major revision', reject: 'Reject',
}

function latestSession(m: ManuscriptRow): ReviewSessionLite | undefined {
  const sessions = (m.drafts ?? []).flatMap(d => d.review_sessions ?? [])
  return sessions[sessions.length - 1]
}

interface Props {
  manuscript: ManuscriptRow
  selected: boolean
  onSelect: () => void
  onArchive: () => void
  onDelete: () => void
}

export function ManuscriptCard({ manuscript: m, selected, onSelect, onArchive, onDelete }: Props) {
  const draftCount = m.drafts?.length ?? 0
  const latest = latestSession(m)

  return (
    <Card className={`mb-2 flex items-center gap-3 p-4 transition ${selected ? 'border-pr-teal ring-1 ring-pr-teal' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        className="h-3.5 w-3.5 cursor-pointer"
        aria-label={`Select ${m.title}`}
      />

      <Link href={`/manuscripts/${m.id}`} className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium">{m.title}</h3>
          {m.field && <Badge variant="secondary">{m.field}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {draftCount} draft{draftCount === 1 ? '' : 's'}
          {m.word_count ? ` · ${m.word_count.toLocaleString()} words` : ''}
          {latest?.verdict ? ` · ${VERDICT_LABEL[latest.verdict] ?? latest.verdict}` : latest?.status ? ` · ${latest.status}` : ''}
        </p>
      </Link>

      <div className="flex items-center gap-1">
        <button
          onClick={onArchive}
          title={m.archived ? 'Restore' : 'Archive'}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {m.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="rounded p-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}
