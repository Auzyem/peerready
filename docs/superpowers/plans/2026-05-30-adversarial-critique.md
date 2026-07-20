# Adversarial Critique Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Reviewer 2" adversarial critique pass to a completed review — triggered from a new Adversarial tab, grounded in the standard review's findings, persisted to the existing `adversarial_critiques` table.

**Architecture:** A new detached pipeline (`waitUntil` + service-role admin client, mirroring `lib/ai/pipeline.ts`) runs a single Anthropic call that returns numbered objections. Progress is tracked by a new `adversarial_status` column on `review_sessions`. The review page polls the existing status route and renders the result in a second tab.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres/RLS), Anthropic SDK (`claude-sonnet-4-20250514`), `@vercel/functions` `waitUntil`, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-30-adversarial-critique-design.md`

**Working directory:** `C:\Users\emm24\dev\Claude\scholarlens` (branch `build/vertical-slice`).

---

## File Structure

```
scholarlens/
  supabase/migrations/002_adversarial_status.sql   NEW  adversarial_status + adversarial_summary columns
  lib/types/index.ts                               MOD  +2 ReviewSession fields, +AdversarialReviewerResult
  lib/ai/prompts/adversarialReviewer.ts            NEW  buildPriorReviewContext (pure) + runAdversarialReviewer
  lib/ai/adversarialPipeline.ts                    NEW  runAdversarialPipeline (service-role, detached)
  app/api/review/adversarial/start/route.ts        NEW  POST { sessionId } → guard → waitUntil(pipeline)
  components/review/AdversarialPanel.tsx           NEW  renders critiques ordered by severity then number
  components/review/ReviewDashboard.tsx            MOD  Adversarial tab + polling-while-running + start handler
  tests/ai/adversarialReviewer.test.ts             NEW  unit tests for buildPriorReviewContext
```

Each task ends green (`npx tsc --noEmit` clean) and is committed separately.

---

## Task 1: Migration 002 — adversarial status columns

**Files:**
- Create: `supabase/migrations/002_adversarial_status.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/002_adversarial_status.sql`:
```sql
alter table public.review_sessions
  add column adversarial_status text
    check (adversarial_status in ('not_started','running','complete','failed'))
    default 'not_started';

alter table public.review_sessions
  add column adversarial_summary text;
```

No new RLS: `review_sessions` and `adversarial_critiques` are already user-scoped (migration 001). The `default 'not_started'` applies to existing rows, so any review created before this migration is eligible to run an adversarial pass.

- [ ] **Step 2: Apply the migration**

Apply via the Supabase SQL editor (paste the file contents and run), OR `supabase db push` if the project is linked. Expected: `review_sessions` now has `adversarial_status` (default `not_started`) and `adversarial_summary` columns. (This is a manual live step — see Task 8 if deferring until verification.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_adversarial_status.sql
git commit -m "feat: migration for adversarial status columns"
```

---

## Task 2: Types

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Add the two ReviewSession fields**

In `lib/types/index.ts`, inside `interface ReviewSession`, add these two lines immediately after the existing `error_message?: string` line (currently line 66):
```typescript
  adversarial_status?: 'not_started' | 'running' | 'complete' | 'failed'
  adversarial_summary?: string
```

- [ ] **Step 2: Add the AdversarialReviewerResult interface**

In `lib/types/index.ts`, immediately after the closing `}` of `interface AdversarialCritique` (currently ends line 124), add:
```typescript
export interface AdversarialReviewerResult {
  summary: string
  critiques: Array<{
    severity: Severity
    title: string
    quoted_passage: string
    objection: string
    required_fix: string
    section_reference: string
  }>
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types/index.ts
git commit -m "feat: types for adversarial status + reviewer result"
```

---

## Task 3: Adversarial reviewer prompt + prior-review context helper (TDD)

**Files:**
- Create: `lib/ai/prompts/adversarialReviewer.ts`
- Test: `tests/ai/adversarialReviewer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ai/adversarialReviewer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildPriorReviewContext } from '@/lib/ai/prompts/adversarialReviewer'
import type { Score } from '@/lib/types'

function score(partial: Partial<Score>): Score {
  return {
    id: 'x',
    session_id: 's',
    dimension: 'methodology',
    score: 5,
    max_score: 10,
    rationale: 'r',
    improvements: [],
    ...partial,
  } as Score
}

describe('buildPriorReviewContext', () => {
  it('includes the weakness summary and the three lowest dimensions with rationales', () => {
    const scores: Score[] = [
      score({ dimension: 'originality', score: 8, rationale: 'novel' }),
      score({ dimension: 'methodology', score: 3, rationale: 'weak design' }),
      score({ dimension: 'evidence_quality', score: 4, rationale: 'thin data' }),
      score({ dimension: 'significance', score: 9, rationale: 'matters' }),
    ]
    const ctx = buildPriorReviewContext(scores, 'Underpowered study')
    expect(ctx).toContain('Underpowered study')
    expect(ctx).toContain('methodology (3/10): weak design')
    expect(ctx).toContain('evidence_quality (4/10): thin data')
    // Only the three lowest are kept, so the top dimension is excluded.
    expect(ctx).not.toContain('significance')
  })

  it('returns a fallback when there are no scores and no summary', () => {
    expect(buildPriorReviewContext([], undefined)).toMatch(/independently/i)
  })

  it('tolerates a missing rationale', () => {
    const scores: Score[] = [score({ dimension: 'methodology', score: 2, rationale: undefined })]
    const ctx = buildPriorReviewContext(scores, undefined)
    expect(ctx).toContain('methodology (2/10): no rationale given')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- adversarialReviewer`
Expected: FAIL — cannot resolve `@/lib/ai/prompts/adversarialReviewer` / `buildPriorReviewContext` not found.

- [ ] **Step 3: Implement the module**

Create `lib/ai/prompts/adversarialReviewer.ts`:
```typescript
import { anthropic, MODEL, MAX_TOKENS } from '../anthropic'
import { extractJson } from '../json'
import type { AdversarialReviewerResult, ReviewerPersona, Score } from '@/lib/types'

// Pure helper: assemble a compact summary of the standard review's findings to
// ground the adversarial pass. Exported for unit testing.
export function buildPriorReviewContext(scores: Score[], weaknessSummary?: string): string {
  const lines: string[] = []
  if (weaknessSummary && weaknessSummary.trim()) {
    lines.push(`Prior reviewer's weakness summary: ${weaknessSummary.trim()}`)
  }
  const weakest = [...scores].sort((a, b) => a.score - b.score).slice(0, 3)
  if (weakest.length > 0) {
    lines.push('Lowest-scoring dimensions from the standard review:')
    for (const s of weakest) {
      const rationale = s.rationale?.trim() || 'no rationale given'
      lines.push(`- ${s.dimension} (${s.score}/${s.max_score}): ${rationale}`)
    }
  }
  if (lines.length === 0) {
    return 'No prior review findings are available; review the manuscript independently.'
  }
  return lines.join('\n')
}

const SYSTEM = (persona: ReviewerPersona, field: string) =>
  `You are the harshest credible peer reviewer ("Reviewer 2") for ${field}, acting as a ${persona.replace(/_/g, ' ')} specialist with 200+ reviews behind you. A polite reviewer has already assessed this manuscript. Your job is NOT to repeat their points — it is to ESCALATE: surface the fatal flaws they softened or missed, and state the objections that would actually sink this paper in review.

Rules:
- Every critique must quote an exact passage from the manuscript.
- Every critique must give a concrete required fix, not a vague gesture.
- Be adversarial but fair: no fabricated weaknesses, no nitpicking typos as if fatal.
- Prefer a few devastating objections over many trivial ones.

Return ONLY valid JSON with this exact shape, no preamble, no markdown fences:
{
  "summary": string max 40 words — the single biggest reason this paper would be rejected,
  "critiques": [
    {
      "severity": "critical" | "major" | "minor",
      "title": string short label,
      "quoted_passage": string exact quote from the manuscript,
      "objection": string 2-4 sentences,
      "required_fix": string concrete action,
      "section_reference": string section name or location
    }
  ]
}`

export async function runAdversarialReviewer(
  manuscriptText: string,
  persona: ReviewerPersona,
  field: string,
  priorReviewContext: string
): Promise<AdversarialReviewerResult> {
  const call = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM(persona, field),
      messages: [{
        role: 'user',
        content: `Field: ${field}\nPersona: ${persona}\n\nStandard review findings to escalate:\n${priorReviewContext}\n\nManuscript:\n${manuscriptText.slice(0, 80000)}`,
      }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return extractJson<AdversarialReviewerResult>(text)
  }
  try {
    return await call()
  } catch {
    return await call() // one retry on malformed JSON
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- adversarialReviewer`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/ai/prompts/adversarialReviewer.ts tests/ai/adversarialReviewer.test.ts
git commit -m "feat: adversarial reviewer prompt + prior-review context helper (TDD)"
```

---

## Task 4: Adversarial pipeline

**Files:**
- Create: `lib/ai/adversarialPipeline.ts`

- [ ] **Step 1: Implement the pipeline**

Create `lib/ai/adversarialPipeline.ts`. Uses the **service-role admin client** (runs detached from the request, no user cookie — same pattern as `lib/ai/pipeline.ts`):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { runAdversarialReviewer, buildPriorReviewContext } from './prompts/adversarialReviewer'
import type { ReviewerPersona, Score } from '@/lib/types'

export async function runAdversarialPipeline(sessionId: string) {
  const supabase = createAdminClient()

  try {
    await supabase
      .from('review_sessions')
      .update({ adversarial_status: 'running' })
      .eq('id', sessionId)

    const { data: session, error } = await supabase
      .from('review_sessions')
      .select('*, scores(*), drafts(*, manuscripts(*))')
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')

    const draft = session.drafts as unknown as {
      parsed_text?: string
      manuscripts: { field?: string }
    }

    const manuscriptText = draft.parsed_text || ''
    if (!manuscriptText.trim()) throw new Error('Draft has no parsed text')

    const field = draft.manuscripts.field || 'this field'
    const persona = (session.reviewer_persona as ReviewerPersona) || 'social_science_quant'
    const scores = (session.scores as Score[]) || []
    const priorReviewContext = buildPriorReviewContext(
      scores,
      session.weakness_summary || undefined
    )

    const result = await runAdversarialReviewer(manuscriptText, persona, field, priorReviewContext)

    const critiqueRows = result.critiques.map((c, i) => ({
      session_id: sessionId,
      critique_number: i + 1,
      severity: c.severity,
      title: c.title,
      quoted_passage: c.quoted_passage,
      objection: c.objection,
      required_fix: c.required_fix,
      section_reference: c.section_reference,
    }))
    if (critiqueRows.length > 0) {
      await supabase.from('adversarial_critiques').insert(critiqueRows)
    }

    await supabase
      .from('review_sessions')
      .update({ adversarial_status: 'complete', adversarial_summary: result.summary })
      .eq('id', sessionId)
  } catch (err: unknown) {
    await supabase
      .from('review_sessions')
      .update({ adversarial_status: 'failed' })
      .eq('id', sessionId)
    throw err
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/ai/adversarialPipeline.ts
git commit -m "feat: adversarial review pipeline (service role, detached)"
```

---

## Task 5: Adversarial start API route

**Files:**
- Create: `app/api/review/adversarial/start/route.ts`

- [ ] **Step 1: Implement the start route**

Create `app/api/review/adversarial/start/route.ts`. The detached-trigger block mirrors the hardened pattern already used in `app/api/review/start/route.ts` (floating promise + `.catch` + `try/waitUntil` so it tolerates `next dev` outside the Vercel runtime):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runAdversarialPipeline } from '@/lib/ai/adversarialPipeline'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await request.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  // RLS: this select only returns the row if the session belongs to the user.
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select('id, status, adversarial_status')
    .eq('id', sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.status !== 'complete') {
    return NextResponse.json({ error: 'Standard review is not complete yet' }, { status: 409 })
  }
  if (session.adversarial_status === 'running' || session.adversarial_status === 'complete') {
    return NextResponse.json(
      { error: 'Adversarial critique already running or complete' },
      { status: 409 }
    )
  }

  // Run the pipeline detached from the response lifecycle. The promise starts
  // immediately; waitUntil keeps the function alive on Vercel. Outside the
  // Vercel runtime (e.g. `next dev`), waitUntil can throw — swallow it.
  const pipeline = runAdversarialPipeline(sessionId)
  pipeline.catch((e) => console.error('[adversarial pipeline] failed:', e))
  try {
    waitUntil(pipeline)
  } catch {
    // Non-Vercel runtime: the floating promise above continues on its own.
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add app/api/review/adversarial/start/route.ts
git commit -m "feat: adversarial start route with duplicate-run guard"
```

---

## Task 6: AdversarialPanel component

**Files:**
- Create: `components/review/AdversarialPanel.tsx`

- [ ] **Step 1: Implement the panel**

Create `components/review/AdversarialPanel.tsx` (orders by severity then `critique_number`; styling parallels `AnnotationPanel.tsx`):
```tsx
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AdversarialCritique, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AdversarialPanel({ critiques }: { critiques: AdversarialCritique[] }) {
  if (critiques.length === 0) {
    return (
      <p className="text-muted-foreground">
        No critiques — the adversarial reviewer found nothing to escalate.
      </p>
    )
  }
  const sorted = [...critiques].sort((a, b) => {
    const bySeverity = ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)
    return bySeverity !== 0 ? bySeverity : a.critique_number - b.critique_number
  })
  return (
    <div className="space-y-3">
      {sorted.map(c => (
        <Card key={c.id} className="p-4">
          <div className="flex items-center gap-2">
            <Badge className={COLOR[c.severity]}>{c.severity}</Badge>
            <span className="font-medium">{c.title}</span>
            {c.section_reference && (
              <span className="text-xs text-muted-foreground">{c.section_reference}</span>
            )}
          </div>
          {c.quoted_passage && (
            <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">
              {c.quoted_passage}
            </blockquote>
          )}
          <p className="mt-2 text-sm">{c.objection}</p>
          <p className="mt-1 text-sm text-green-700">Required fix: {c.required_fix}</p>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add components/review/AdversarialPanel.tsx
git commit -m "feat: AdversarialPanel component"
```

---

## Task 7: Wire the Adversarial tab into ReviewDashboard

**Files:**
- Modify: `components/review/ReviewDashboard.tsx`

- [ ] **Step 1: Replace the dashboard with the tab-enabled version**

Replace the entire contents of `components/review/ReviewDashboard.tsx` with the following. Changes vs. current: `poll` lifted into a `useCallback` driven by an `activeRef` so it can be re-kicked; polling continues while `adversarial_status === 'running'`; a `startAdversarial` handler; `Button` import; and a second "Adversarial" tab that branches on `adversarial_status`.
```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScoreList } from './ScoreList'
import { AnnotationPanel } from './AnnotationPanel'
import { AdversarialPanel } from './AdversarialPanel'
import type { ReviewSession } from '@/lib/types'

const STEPS = ['routing', 'reviewing', 'complete'] as const
const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept', minor_revision: 'Minor revision',
  major_revision: 'Major revision', reject: 'Reject',
}

export function ReviewDashboard({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [starting, setStarting] = useState(false)
  const activeRef = useRef(true)

  const poll = useCallback(async () => {
    const res = await fetch(`/api/review/status/${sessionId}`)
    const json = await res.json()
    if (!activeRef.current) return
    setSession(json.session)
    const s = json.session as ReviewSession | null
    const mainPending = !!s && s.status !== 'complete' && s.status !== 'failed'
    const advRunning = !!s && s.adversarial_status === 'running'
    if (mainPending || advRunning) {
      setTimeout(poll, 3000)
    }
  }, [sessionId])

  useEffect(() => {
    activeRef.current = true
    poll()
    return () => { activeRef.current = false }
  }, [poll])

  async function startAdversarial() {
    setStarting(true)
    // Optimistic: show "running" immediately; poll() then reconciles with the server.
    setSession(prev => (prev ? { ...prev, adversarial_status: 'running' } : prev))
    try {
      await fetch('/api/review/adversarial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } finally {
      setStarting(false)
      poll()
    }
  }

  if (!session) return <p>Loading review…</p>

  if (session.status === 'failed') {
    return <p className="text-red-600">Review failed: {session.error_message}</p>
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

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adversarial">Adversarial</TabsTrigger>
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
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: all tests pass (the 5 existing parser/json tests plus the 3 new `buildPriorReviewContext` tests).

- [ ] **Step 5: Commit**

```bash
git add components/review/ReviewDashboard.tsx
git commit -m "feat: adversarial tab with on-demand trigger + polling"
```

---

## Task 8: End-to-end verification (manual, live services)

**Files:** none.

- [ ] **Step 1: Confirm migration 002 is applied**

In the Supabase SQL editor, run `select adversarial_status, adversarial_summary from public.review_sessions limit 1;`. Expected: the query succeeds (columns exist) and `adversarial_status` defaults to `not_started`. If it errors, paste and run `supabase/migrations/002_adversarial_status.sql` now.

- [ ] **Step 2: Run a standard review to completion**

Run `npm run dev`, sign in, create a review, upload a `.pdf`/`.docx`, and wait until the Overview tab renders (status `complete`).

- [ ] **Step 3: Trigger the adversarial pass**

Click the **Adversarial** tab → **Run adversarial critique**. Expected: the tab shows "Running adversarial critique…", then within ~30–60s flips to a "Biggest risk" summary plus critique cards ordered critical → major → minor with quoted passages and required fixes.

- [ ] **Step 4: Reload mid-run**

Start the adversarial pass and immediately reload the page. Expected: the Adversarial tab still shows the running state (persisted via `adversarial_status`), not the Run button — confirming server-side state survives reloads.

- [ ] **Step 5: Duplicate-guard check**

After completion, confirm the Run button is gone (state is `complete`). Optionally, `POST /api/review/adversarial/start` again with the same `sessionId` (via devtools) and confirm a `409`.

- [ ] **Step 6: Failure path (optional)**

Temporarily unset `ANTHROPIC_API_KEY` (or point a session at a draft with empty `parsed_text`), trigger the pass, and confirm the tab shows the failed state with a working **Retry** button, while the Overview tab is unaffected.

- [ ] **Step 7: Final commit**

```bash
git commit -m "chore: adversarial critique verified end-to-end" --allow-empty
```

---

## Self-Review Notes

- **Spec §Data model:** migration 002 columns = Task 1. **§Types:** ReviewSession fields + `AdversarialReviewerResult` = Task 2. **§AI prompt module:** `runAdversarialReviewer` + pure `buildPriorReviewContext` (unit-tested) = Task 3. **§Pipeline:** `runAdversarialPipeline` service-role/detached = Task 4. **§API route:** start route + guard + `waitUntil` = Task 5. **§UI:** `AdversarialPanel` = Task 6, Adversarial tab + polling fix + branches = Task 7. **§Testing:** unit test = Task 3, build gates = Task 7, manual E2E = Task 8 — all covered.
- **Type consistency:** `buildPriorReviewContext(scores, weaknessSummary)` defined Task 3, used Task 4; `runAdversarialReviewer(manuscriptText, persona, field, priorReviewContext)` defined Task 3, used Task 4; `AdversarialReviewerResult` defined Task 2, used Tasks 3–4; `runAdversarialPipeline(sessionId)` defined Task 4, used Task 5; `adversarial_status` values `not_started|running|complete|failed` consistent across Tasks 1, 2, 4, 5, 7; `AdversarialCritique` fields consumed in Task 6 match the row type / pipeline insert in Task 4.
- **Status route:** already selects `adversarial_critiques(*)` and `*` covers the new columns — no change needed (spec §Components 5), so no task modifies it. Critique ordering happens client-side in Task 6.
- **No placeholders:** every code step shows complete code; every run step states expected output.
