import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import type { Draft, ReviewSession } from '@/lib/types'

export default async function ManuscriptDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: m } = await supabase
    .from('manuscripts')
    .select('*, drafts(*, review_sessions(*))')
    .eq('id', params.id)
    .single()

  if (!m) return <p>Manuscript not found.</p>

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{m.title}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{m.field ?? 'Field pending'} · {m.word_count ?? 0} words</p>
      <div className="space-y-3">
        {((m.drafts ?? []) as Draft[]).map((d: Draft) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">v{d.version_number} · {d.file_name}</p>
                <p className="text-sm text-muted-foreground">
                  {(d.review_sessions ?? []).length} review session(s)
                </p>
              </div>
              {(d.review_sessions ?? []).map((s: ReviewSession) => (
                <Link key={s.id} href={`/manuscripts/${m.id}/review/${s.id}`}
                  className="text-sm underline">
                  View review ({s.status})
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
