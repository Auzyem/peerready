# Review-Page Vertical-Nav Layout (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the review's horizontal tabs with a two-column vertical-nav layout, decomposing the oversized `ReviewDashboard` into focused section components.

**Architecture:** `ReviewDashboard` stays the orchestrator (poll loop, on-demand start handlers, lifecycle states). The completed view becomes a left rail (`ReviewStages` + `VerticalSectionNav`) plus a right column (`ReviewTopBar` + the active section panel). Each section's JSX is extracted verbatim into its own component, reusing the existing panel components unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind/shadcn, Vitest (node).

**Source spec:** `docs/superpowers/specs/2026-06-01-scholarlens-review-layout-design.md`.

**House rules:** gate every commit on `npm run build` (`npm test` is lenient). Branch `feat/review-layout` (already checked out; spec committed there).

**Build-order note:** Tasks 2–8 create new component files that aren't imported yet, so each builds green on its own. Task 9 rewires `ReviewDashboard` to use them and removes the old tab code.

**Reused panel components (unchanged), with their exact prop usage:**
`ScoreRadar scores=` · `ScoreList scores=` · `AnnotationPanel annotations=` · `AdversarialPanel critiques=` · `JournalMatchList matches=` · `ReportingChecklist items= guidelineName=` · `ProgressComparator delta=`. Reporting also uses `detectGuideline({docType,persona,title,abstract})` and `GUIDELINES`/`GUIDELINE_IDS`/`ReportingGuidelineId` from `@/lib/reporting/guidelines`. On-demand status values are `'not_started' | 'running' | 'complete' | 'failed'`.

---

## File Structure

**Create:**
- `lib/review/sections.ts` — `SectionId`, `reviewSectionIds(hasProgress)`, `SECTION_LABELS`
- `components/review/sections/OverviewSection.tsx`
- `components/review/sections/AdversarialSection.tsx`
- `components/review/sections/JournalsSection.tsx`
- `components/review/sections/ReportingSection.tsx`
- `components/review/sections/ProgressSection.tsx`
- `components/review/VerticalSectionNav.tsx`
- `components/review/ReviewTopBar.tsx`
- `tests/reviewSections.test.ts`

**Modify:**
- `components/review/ReviewDashboard.tsx` — orchestrator; completed view rewritten

---

## Task 1: Section-id helper

**Files:** Create `lib/review/sections.ts`; Test `tests/reviewSections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reviewSections.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { reviewSectionIds } from '@/lib/review/sections'

describe('reviewSectionIds', () => {
  it('includes progress only when hasProgress is true', () => {
    expect(reviewSectionIds(true)).toEqual(['overview', 'adversarial', 'journals', 'reporting', 'progress'])
  })
  it('omits progress when hasProgress is false', () => {
    expect(reviewSectionIds(false)).toEqual(['overview', 'adversarial', 'journals', 'reporting'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reviewSections.test.ts`
Expected: FAIL — `Cannot find module '@/lib/review/sections'`.

- [ ] **Step 3: Write the implementation**

Create `lib/review/sections.ts`:
```ts
export type SectionId = 'overview' | 'adversarial' | 'journals' | 'reporting' | 'progress'

export const SECTION_LABELS: Record<SectionId, string> = {
  overview: 'Overview',
  adversarial: 'Adversarial',
  journals: 'Journals',
  reporting: 'Reporting',
  progress: 'Progress',
}

export function reviewSectionIds(hasProgress: boolean): SectionId[] {
  const base: SectionId[] = ['overview', 'adversarial', 'journals', 'reporting']
  return hasProgress ? [...base, 'progress'] : base
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reviewSections.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review/sections.ts tests/reviewSections.test.ts
git commit -m "feat: review section-id helper"
```

---

## Task 2: OverviewSection

**Files:** Create `components/review/sections/OverviewSection.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/sections/OverviewSection.tsx`:
```tsx
import { ScoreList } from '../ScoreList'
import { ScoreRadar } from '../ScoreRadar'
import { AnnotationPanel } from '../AnnotationPanel'
import type { ReviewSession } from '@/lib/types'

export function OverviewSection({ session }: { session: ReviewSession }) {
  return (
    <div className="space-y-6">
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
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/sections/OverviewSection.tsx
git commit -m "feat: OverviewSection"
```

---

## Task 3: AdversarialSection

**Files:** Create `components/review/sections/AdversarialSection.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/sections/AdversarialSection.tsx`:
```tsx
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AdversarialPanel } from '../AdversarialPanel'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function AdversarialSection({
  session, status, starting, onStart,
}: {
  session: ReviewSession
  status: Status
  starting: boolean
  onStart: () => void
}) {
  return (
    <div className="space-y-4">
      {status === 'not_started' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Run a harsher second-pass review that escalates the weaknesses above.
          </p>
          <Button onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Run adversarial critique'}
          </Button>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Running adversarial critique…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && (
        <div className="space-y-4">
          {session.adversarial_summary && (
            <p className="text-sm"><strong>Biggest risk:</strong> {session.adversarial_summary}</p>
          )}
          <AdversarialPanel critiques={session.adversarial_critiques ?? []} />
        </div>
      )}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Adversarial critique failed.</p>
          <Button onClick={onStart} disabled={starting}>{starting ? 'Retrying…' : 'Retry'}</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/sections/AdversarialSection.tsx
git commit -m "feat: AdversarialSection"
```

---

## Task 4: JournalsSection

**Files:** Create `components/review/sections/JournalsSection.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/sections/JournalsSection.tsx`:
```tsx
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { JournalMatchList } from '../JournalMatchList'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function JournalsSection({
  session, status, starting, onStart,
}: {
  session: ReviewSession
  status: Status
  starting: boolean
  onStart: () => void
}) {
  return (
    <div className="space-y-4">
      {status === 'not_started' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Get a ranked list of journals to target, with acceptance odds, timelines, and the
            key change each one needs — tailored to this review.
          </p>
          <Button onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Find journal matches'}
          </Button>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Finding journal matches…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && <JournalMatchList matches={session.journal_matches ?? []} />}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Journal matching failed.</p>
          <Button onClick={onStart} disabled={starting}>{starting ? 'Retrying…' : 'Retry'}</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/sections/JournalsSection.tsx
git commit -m "feat: JournalsSection"
```

---

## Task 5: ReportingSection (owns its guideline select)

**Files:** Create `components/review/sections/ReportingSection.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/sections/ReportingSection.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ReportingChecklist } from '../ReportingChecklist'
import { detectGuideline } from '@/lib/reporting/detect'
import { GUIDELINES, GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function ReportingSection({
  session, status, starting, onStart,
}: {
  session: ReviewSession
  status: Status
  starting: boolean
  onStart: (guidelineId: ReportingGuidelineId) => void
}) {
  const [selected, setSelected] = useState<ReportingGuidelineId | null>(null)
  const manuscript = (session as unknown as {
    drafts?: { manuscripts?: { doc_type?: string; title?: string; abstract?: string } }
  }).drafts?.manuscripts
  const detected = detectGuideline({
    docType: manuscript?.doc_type,
    persona: session.reviewer_persona,
    title: manuscript?.title,
    abstract: manuscript?.abstract,
  })
  const activeGuideline: ReportingGuidelineId =
    selected ?? (session.reporting_guideline_id as ReportingGuidelineId) ?? detected.id

  return (
    <div className="space-y-4">
      {status === 'not_started' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Check this manuscript against a reporting-guideline checklist. Detected: {detected.rationale}
          </p>
          <select
            aria-label="Reporting guideline"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={activeGuideline}
            onChange={(e) => setSelected(e.target.value as ReportingGuidelineId)}
          >
            {GUIDELINE_IDS.map((id) => (
              <option key={id} value={id}>{GUIDELINES[id].name}</option>
            ))}
          </select>
          <div>
            <Button onClick={() => onStart(activeGuideline)} disabled={starting}>
              {starting ? 'Starting…' : 'Run compliance check'}
            </Button>
          </div>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Running compliance check…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && (
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
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Compliance check failed.</p>
          <Button onClick={() => onStart(activeGuideline)} disabled={starting}>
            {starting ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/sections/ReportingSection.tsx
git commit -m "feat: ReportingSection (owns guideline select)"
```

---

## Task 6: ProgressSection

**Files:** Create `components/review/sections/ProgressSection.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/sections/ProgressSection.tsx`:
```tsx
import { ProgressComparator } from '../ProgressComparator'
import type { ReviewSession } from '@/lib/types'

export function ProgressSection({ session }: { session: ReviewSession }) {
  if (!session.score_delta) return null
  return <ProgressComparator delta={session.score_delta} />
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/sections/ProgressSection.tsx
git commit -m "feat: ProgressSection"
```

---

## Task 7: VerticalSectionNav

**Files:** Create `components/review/VerticalSectionNav.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/VerticalSectionNav.tsx`:
```tsx
'use client'
import { reviewSectionIds, SECTION_LABELS, type SectionId } from '@/lib/review/sections'

export function VerticalSectionNav({
  active, onSelect, hasProgress,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
  hasProgress: boolean
}) {
  const ids = reviewSectionIds(hasProgress)
  return (
    <nav className="overflow-hidden rounded-lg border bg-card">
      {ids.map((id, i) => {
        const isActive = id === active
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex w-full items-center px-3.5 py-2.5 text-left text-sm transition-colors ${
              i > 0 ? 'border-t' : ''
            } ${
              isActive
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted-foreground hover:bg-accent/5 hover:text-foreground'
            }`}
          >
            {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent" />}
            {SECTION_LABELS[id]}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Visual fallback:** the active style uses `bg-accent/10 text-accent`, relying on Tailwind opacity
modifiers on the `hsl(var())` tokens (the shipped shadcn `Button` uses the same `bg-primary/90`
pattern, so this should work). If the manual check in Task 10 shows the active row's tint renders as
solid teal (modifier not applied) making `text-accent` unreadable, change the active class to
`bg-accent font-medium text-accent-foreground` and drop the left-bar `<span>`. Do not change it
preemptively — only if the visual check fails.

- [ ] **Step 3: Commit**

```bash
git add components/review/VerticalSectionNav.tsx
git commit -m "feat: VerticalSectionNav"
```

---

## Task 8: ReviewTopBar

**Files:** Create `components/review/ReviewTopBar.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/ReviewTopBar.tsx`:
```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/ReviewTopBar.tsx
git commit -m "feat: ReviewTopBar"
```

---

## Task 9: Rewrite ReviewDashboard to the two-column layout

**Files:** Modify `components/review/ReviewDashboard.tsx` (full rewrite)

**Note:** The poll loop, the three start handlers, optimistic `applySession`, and the
loading/failed/awaiting/processing branches are preserved verbatim. Only the imports, removed
state (`selectedGuideline`), the added `activeSection` state, and the completed-view JSX change.
The guideline-selection logic now lives in `ReportingSection`.

- [ ] **Step 1: Replace the entire file**

Replace the entire contents of `components/review/ReviewDashboard.tsx` with:
```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { FieldConfirm } from './FieldConfirm'
import { PdfReportModal } from './PdfReportModal'
import { ReviewStages } from './ReviewStages'
import { VerticalSectionNav } from './VerticalSectionNav'
import { ReviewTopBar } from './ReviewTopBar'
import { OverviewSection } from './sections/OverviewSection'
import { AdversarialSection } from './sections/AdversarialSection'
import { JournalsSection } from './sections/JournalsSection'
import { ReportingSection } from './sections/ReportingSection'
import { ProgressSection } from './sections/ProgressSection'
import { reviewNumberFromSession } from '@/lib/review/sequence'
import type { SectionId } from '@/lib/review/sections'
import type { ReportingGuidelineId } from '@/lib/reporting/guidelines'
import type { ReviewSession, ReviewerPersona } from '@/lib/types'

const STEPS = ['routing', 'reviewing', 'complete'] as const

export function ReviewDashboard({ sessionId, manuscriptId }: { sessionId: string; manuscriptId: string }) {
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [startingJournals, setStartingJournals] = useState(false)
  const [startingReporting, setStartingReporting] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionId>('overview')
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
    applySession(sessionRef.current ? { ...sessionRef.current, adversarial_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/adversarial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      applySession(sessionRef.current ? { ...sessionRef.current, adversarial_status: 'not_started' } : sessionRef.current)
    } finally {
      setStarting(false)
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      poll()
    }
  }

  async function startJournals() {
    setStartingJournals(true)
    applySession(sessionRef.current ? { ...sessionRef.current, journal_match_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/journals/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      applySession(sessionRef.current ? { ...sessionRef.current, journal_match_status: 'not_started' } : sessionRef.current)
    } finally {
      setStartingJournals(false)
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      poll()
    }
  }

  async function startReporting(guidelineId: ReportingGuidelineId) {
    setStartingReporting(true)
    applySession(sessionRef.current ? { ...sessionRef.current, reporting_check_status: 'running' } : sessionRef.current)
    try {
      await fetch('/api/review/reporting/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, guidelineId }),
      })
    } catch {
      applySession(sessionRef.current ? { ...sessionRef.current, reporting_check_status: 'not_started' } : sessionRef.current)
    } finally {
      setStartingReporting(false)
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      poll()
    }
  }

  if (!session) return <p>Loading review…</p>

  if (session.status === 'failed') {
    return <p className="text-destructive">Review failed: {session.error_message}</p>
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
  const reviewNumber = reviewNumberFromSession(
    session as unknown as { drafts?: { version_number?: number } }
  )
  const manuscriptTitle = (session as unknown as {
    drafts?: { manuscripts?: { title?: string } }
  }).drafts?.manuscripts?.title ?? 'Review'

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="shrink-0 space-y-4 md:w-52">
        <ReviewStages manuscriptId={manuscriptId} currentSessionId={sessionId} />
        <VerticalSectionNav active={activeSection} onSelect={setActiveSection} hasProgress={!!session.score_delta} />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <ReviewTopBar
          reviewNumber={reviewNumber}
          verdict={session.verdict}
          score={session.overall_score ?? 0}
          sessionId={sessionId}
          manuscriptId={manuscriptId}
          onOpenPdf={() => setShowPdf(true)}
        />

        {activeSection === 'overview' && <OverviewSection session={session} />}
        {activeSection === 'adversarial' && (
          <AdversarialSection session={session} status={adv} starting={starting} onStart={startAdversarial} />
        )}
        {activeSection === 'journals' && (
          <JournalsSection session={session} status={jm} starting={startingJournals} onStart={startJournals} />
        )}
        {activeSection === 'reporting' && (
          <ReportingSection session={session} status={rc} starting={startingReporting} onStart={startReporting} />
        )}
        {activeSection === 'progress' && <ProgressSection session={session} />}
      </div>

      {showPdf && (
        <PdfReportModal sessionId={sessionId} manuscriptTitle={manuscriptTitle} onClose={() => setShowPdf(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors. (Status props `adv`/`jm`/`rc` are typed by `ReviewSession`'s `*_status` fields, which match the sections' `Status` union; `startReporting` returning a Promise is assignable to the section's `onStart: (id) => void`.)

- [ ] **Step 3: Commit**

```bash
git add components/review/ReviewDashboard.tsx
git commit -m "feat: two-column vertical-nav review layout"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: All suites pass, including `tests/reviewSections.test.ts` (2 tests). Total 65 + 2 = 67.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles with no type errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`. On a completed review:
- Two-column layout renders: left rail = review-stage tracker + vertical section nav; right = topbar + active panel.
- Clicking each nav item swaps the panel (Overview / Adversarial / Journals / Reporting; Progress only when a prior review exists).
- On-demand passes still work: Adversarial / Journals / Reporting each start, show "running", poll, then render results; Retry works on a failed pass.
- Reporting's guideline dropdown selects and runs.
- Topbar: PDF report opens the modal; .xlsx downloads; Upload revision navigates to `/manuscripts/[id]`.
- Both dark (default) and light themes are legible; left rail stacks above content on a narrow viewport.
- A single-draft manuscript shows no stage tracker (ReviewStages hides for <2) and no Progress section.

- [ ] **Step 4: Final commit (if any stray changes)**

```bash
git add -A
git commit -m "chore: review layout verification pass"
```

---

## Deferred (not in this plan)
- Restyling the loading/awaiting/processing screens beyond the `text-destructive` fix.
- Any change to the AI pipeline, on-demand routes, or section panel internals.
