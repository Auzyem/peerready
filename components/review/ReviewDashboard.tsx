'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScoreList } from './ScoreList'
import { ScoreRadar } from './ScoreRadar'
import { AnnotationPanel } from './AnnotationPanel'
import { AdversarialPanel } from './AdversarialPanel'
import { JournalMatchList } from './JournalMatchList'
import { ProgressComparator } from './ProgressComparator'
import { FieldConfirm } from './FieldConfirm'
import type { ReviewSession, ReviewerPersona } from '@/lib/types'

const STEPS = ['routing', 'reviewing', 'complete'] as const
const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept', minor_revision: 'Minor revision',
  major_revision: 'Major revision', reject: 'Reject',
}

export function ReviewDashboard({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [startingJournals, setStartingJournals] = useState(false)
  const activeRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirrors `session` so the poll loop can decide whether to keep polling even
  // when a fetch throws (it has no fresh server value to read in that case).
  const sessionRef = useRef<ReviewSession | null>(null)

  const applySession = useCallback((s: ReviewSession | null) => {
    sessionRef.current = s
    setSession(s)
  }, [])

  const poll = useCallback(async () => {
    // Default to the last known session so a transient fetch failure keeps the
    // running/pending loop alive instead of silently dying.
    let next: ReviewSession | null = sessionRef.current
    try {
      const res = await fetch(`/api/review/status/${sessionId}`)
      const json = await res.json()
      if (!activeRef.current) return
      next = json.session as ReviewSession | null
      applySession(next)
    } catch {
      if (!activeRef.current) return
    }
    const mainPending = !!next && next.status !== 'complete' && next.status !== 'failed' && next.status !== 'awaiting_confirmation'
    const advRunning = !!next && next.adversarial_status === 'running'
    const jmRunning = !!next && next.journal_match_status === 'running'
    if (mainPending || advRunning || jmRunning) {
      timerRef.current = setTimeout(poll, 3000)
    }
  }, [sessionId, applySession])

  useEffect(() => {
    activeRef.current = true
    poll()
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [poll])

  async function startAdversarial() {
    setStarting(true)
    // Optimistic: show "running" immediately; poll() then reconciles with the server.
    applySession(sessionRef.current ? { ...sessionRef.current, adversarial_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/adversarial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // Network failure: revert so the UI doesn't get stuck on "running".
      applySession(sessionRef.current ? { ...sessionRef.current, adversarial_status: 'not_started' } : sessionRef.current)
    } finally {
      setStarting(false)
      // Cancel any in-flight timer before kicking a fresh reconciling poll.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      poll()
    }
  }

  async function startJournals() {
    setStartingJournals(true)
    // Optimistic: show "running" immediately; poll() then reconciles with the server.
    applySession(sessionRef.current ? { ...sessionRef.current, journal_match_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/journals/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // Network failure: revert so the UI doesn't get stuck on "running".
      applySession(sessionRef.current ? { ...sessionRef.current, journal_match_status: 'not_started' } : sessionRef.current)
    } finally {
      setStartingJournals(false)
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      poll()
    }
  }

  if (!session) return <p>Loading review…</p>

  if (session.status === 'failed') {
    return <p className="text-red-600">Review failed: {session.error_message}</p>
  }

  if (session.status === 'awaiting_confirmation') {
    const manuscript = (session as unknown as {
      drafts?: { manuscripts?: { field?: string } }
    }).drafts?.manuscripts
    return (
      <FieldConfirm
        sessionId={sessionId}
        detectedField={manuscript?.field}
        detectedPersona={session.reviewer_persona as ReviewerPersona | undefined}
        confidence={session.routing_confidence}
        onConfirmed={() => {
          if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
          // Optimistically advance so polling resumes immediately.
          applySession({ ...session, status: 'reviewing' })
          poll()
        }}
      />
    )
  }

  if (session.status !== 'complete') {
    const idx = STEPS.indexOf(session.status as (typeof STEPS)[number])
    const pct = Math.max(5, Math.round(((idx + 1) / STEPS.length) * 100))
    return (
      <div className="max-w-md">
        <p className="mb-2 capitalize">Status: {session.status}…</p>
        <Progress value={pct} />
        <p className="mt-2 text-sm text-muted-foreground">Routing → Reviewing → Done</p>
      </div>
    )
  }

  const adv = session.adversarial_status ?? 'not_started'
  const jm = session.journal_match_status ?? 'not_started'

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button asChild variant="outline" className="ml-auto">
          <a href={`/api/export/${sessionId}`} download>Download .xlsx</a>
        </Button>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adversarial">Adversarial</TabsTrigger>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          {session.score_delta && <TabsTrigger value="progress">Progress</TabsTrigger>}
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
            <ScoreRadar scores={session.scores ?? []} />
            <ScoreList scores={session.scores ?? []} />
          </section>
          <section>
            <h3 className="mb-2 font-medium">Annotations</h3>
            <AnnotationPanel annotations={session.annotations ?? []} />
          </section>
        </TabsContent>
        <TabsContent value="adversarial" className="space-y-4 pt-4">
          {adv === 'not_started' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Run a harsher second-pass review that escalates the weaknesses above.
              </p>
              <Button onClick={startAdversarial} disabled={starting}>
                {starting ? 'Starting…' : 'Run adversarial critique'}
              </Button>
            </div>
          )}
          {adv === 'running' && (
            <div className="max-w-md">
              <p className="mb-2">Running adversarial critique…</p>
              <Progress value={50} />
            </div>
          )}
          {adv === 'complete' && (
            <div className="space-y-4">
              {session.adversarial_summary && (
                <p className="text-sm"><strong>Biggest risk:</strong> {session.adversarial_summary}</p>
              )}
              <AdversarialPanel critiques={session.adversarial_critiques ?? []} />
            </div>
          )}
          {adv === 'failed' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">Adversarial critique failed.</p>
              <Button onClick={startAdversarial} disabled={starting}>
                {starting ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="journals" className="space-y-4 pt-4">
          {jm === 'not_started' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Get a ranked list of journals to target, with acceptance odds, timelines, and the
                key change each one needs — tailored to this review.
              </p>
              <Button onClick={startJournals} disabled={startingJournals}>
                {startingJournals ? 'Starting…' : 'Find journal matches'}
              </Button>
            </div>
          )}
          {jm === 'running' && (
            <div className="max-w-md">
              <p className="mb-2">Finding journal matches…</p>
              <Progress value={50} />
            </div>
          )}
          {jm === 'complete' && (
            <JournalMatchList matches={session.journal_matches ?? []} />
          )}
          {jm === 'failed' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">Journal matching failed.</p>
              <Button onClick={startJournals} disabled={startingJournals}>
                {startingJournals ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          )}
        </TabsContent>
        {session.score_delta && (
          <TabsContent value="progress" className="pt-4">
            <ProgressComparator delta={session.score_delta} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
