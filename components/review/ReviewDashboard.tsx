'use client'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScoreList } from './ScoreList'
import { AnnotationPanel } from './AnnotationPanel'
import type { ReviewSession } from '@/lib/types'

const STEPS = ['routing', 'reviewing', 'complete'] as const
const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept', minor_revision: 'Minor revision',
  major_revision: 'Major revision', reject: 'Reject',
}

export function ReviewDashboard({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ReviewSession | null>(null)

  useEffect(() => {
    let active = true
    async function poll() {
      const res = await fetch(`/api/review/status/${sessionId}`)
      const json = await res.json()
      if (!active) return
      setSession(json.session)
      if (json.session && json.session.status !== 'complete' && json.session.status !== 'failed') {
        setTimeout(poll, 3000)
      }
    }
    poll()
    return () => { active = false }
  }, [sessionId])

  if (!session) return <p>Loading review…</p>

  if (session.status === 'failed') {
    return <p className="text-red-600">Review failed: {session.error_message}</p>
  }

  if (session.status !== 'complete') {
    const idx = STEPS.indexOf(session.status as any)
    const pct = Math.max(5, Math.round(((idx + 1) / STEPS.length) * 100))
    return (
      <div className="max-w-md">
        <p className="mb-2 capitalize">Status: {session.status}…</p>
        <Progress value={pct} />
        <p className="mt-2 text-sm text-muted-foreground">Routing → Reviewing → Done</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6 pt-4">
          {session.strength_summary && (
            <p className="text-sm"><strong>Strengths:</strong> {session.strength_summary}</p>
          )}
          {session.weakness_summary && (
            <p className="text-sm"><strong>Weaknesses:</strong> {session.weakness_summary}</p>
          )}
          <section>
            <h3 className="mb-2 font-medium">Scores</h3>
            <ScoreList scores={session.scores ?? []} />
          </section>
          <section>
            <h3 className="mb-2 font-medium">Annotations</h3>
            <AnnotationPanel annotations={session.annotations ?? []} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
