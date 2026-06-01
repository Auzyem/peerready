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
import { ReportingChecklist } from './ReportingChecklist'
import { PdfReportModal } from './PdfReportModal'
import { detectGuideline } from '@/lib/reporting/detect'
import { GUIDELINES, GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
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
  const [startingReporting, setStartingReporting] = useState(false)
  const [selectedGuideline, setSelectedGuideline] = useState<ReportingGuidelineId | null>(null)
  const [showPdf, setShowPdf] = useState(false)
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
    const rcRunning = !!next && next.reporting_check_status === 'running'
    if (mainPending || advRunning || jmRunning || rcRunning) {
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

  async function startReporting(guidelineId: ReportingGuidelineId) {
    setStartingReporting(true)
    // Optimistic: show "running" immediately; poll() then reconciles with the server.
    applySession(sessionRef.current ? { ...sessionRef.current, reporting_check_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/reporting/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, guidelineId }),
      })
    } catch {
      // Network failure: revert so the UI doesn't get stuck on "running".
      applySession(sessionRef.current ? { ...sessionRef.current, reporting_check_status: 'not_started' } : sessionRef.current)
    } finally {
      setStartingReporting(false)
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
  const rc = session.reporting_check_status ?? 'not_started'
  const rcManuscript = (session as unknown as {
    drafts?: { manuscripts?: { doc_type?: string; title?: string; abstract?: string } }
  }).drafts?.manuscripts
  const detected = detectGuideline({
    docType: rcManuscript?.doc_type,
    persona: session.reviewer_persona,
    title: rcManuscript?.title,
    abstract: rcManuscript?.abstract,
  })
  const activeGuideline: ReportingGuidelineId =
    selectedGuideline ?? (session.reporting_guideline_id as ReportingGuidelineId) ?? detected.id

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button variant="outline" className="ml-auto" onClick={() => setShowPdf(true)}>
          PDF report
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/export/${sessionId}`} download>Download .xlsx</a>
        </Button>
      </div>
      {showPdf && (
        <PdfReportModal
          sessionId={sessionId}
          manuscriptTitle={
            (session as unknown as { drafts?: { manuscripts?: { title?: string } } })
              .drafts?.manuscripts?.title ?? 'Review'
          }
          onClose={() => setShowPdf(false)}
        />
      )}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adversarial">Adversarial</TabsTrigger>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
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
        <TabsContent value="reporting" className="space-y-4 pt-4">
          {rc === 'not_started' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Check this manuscript against a reporting-guideline checklist. Detected:{' '}
                {detected.rationale}
              </p>
              <select
                aria-label="Reporting guideline"
                className="rounded-md border px-3 py-2 text-sm"
                value={activeGuideline}
                onChange={e => setSelectedGuideline(e.target.value as ReportingGuidelineId)}
              >
                {GUIDELINE_IDS.map(id => (
                  <option key={id} value={id}>{GUIDELINES[id].name}</option>
                ))}
              </select>
              <div>
                <Button onClick={() => startReporting(activeGuideline)} disabled={startingReporting}>
                  {startingReporting ? 'Starting…' : 'Run compliance check'}
                </Button>
              </div>
            </div>
          )}
          {rc === 'running' && (
            <div className="max-w-md">
              <p className="mb-2">Running compliance check…</p>
              <Progress value={50} />
            </div>
          )}
          {rc === 'complete' && (
            <div className="space-y-4">
              {session.reporting_summary && (
                <p className="text-sm"><strong>Summary:</strong> {session.reporting_summary}</p>
              )}
              <ReportingChecklist
                items={session.reporting_checklist_items ?? []}
                guidelineName={
                  session.reporting_guideline_id
                    ? GUIDELINES[session.reporting_guideline_id as ReportingGuidelineId]?.name
                    : undefined
                }
              />
            </div>
          )}
          {rc === 'failed' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">Compliance check failed.</p>
              <Button onClick={() => startReporting(activeGuideline)} disabled={startingReporting}>
                {startingReporting ? 'Retrying…' : 'Retry'}
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
