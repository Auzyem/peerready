# Review Sequencing (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface "Review N" sequencing (derived from draft `version_number`), a per-manuscript stage tracker, and progress provenance — without adding a parallel sequencing system.

**Architecture:** `review_number` is derived (`draft.version_number`), never stored. Per-manuscript stages are derived from drafts + their latest sessions via a new read-only API. The only write-side change is recording `compared_to_session_id` when the pipeline computes a progress delta. A small Tailwind tracker + "Review N" labels surface it in the existing `ReviewDashboard` and the PDF header.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (SSR), Tailwind/shadcn, `@react-pdf/renderer`, Vitest (node).

**Source spec:** `docs/superpowers/specs/2026-06-01-peerready-review-sequencing-design.md`.

**House rules:** gate every commit on `npm run build` (`npm test` is lenient); new review-session relations go in all select sites (status/export/PDF). The Supabase CLI is wired — migrations apply with `npx supabase db push --yes`.

**Branch:** all work on `feat/review-sequencing` (already checked out; spec already committed there).

> **Controller note:** Applying migration `008` to the live DB (`npx supabase db push --yes`) is performed by the **controller** between tasks, NOT by an implementer subagent. Implementer tasks only create/commit files — nothing here mutates the database, and the build/tests don't require the column to exist.

---

## File Structure

**Create:**
- `supabase/migrations/008_review_provenance.sql` — adds `compared_to_session_id`
- `lib/review/sequence.ts` — pure helpers `reviewNumberFromSession`, `stageStatusFromSession`
- `app/api/manuscripts/[id]/stages/route.ts` — per-manuscript stages GET
- `components/review/ReviewStages.tsx` — Tailwind inline stage tracker
- `tests/reviewSequence.test.ts` — unit tests for the pure helpers

**Modify:**
- `lib/types/index.ts` — add `compared_to_session_id?` to `ReviewSession`
- `lib/ai/pipeline.ts` — persist `compared_to_session_id` in `runProgressComparison`
- `app/api/review/status/[sessionId]/route.ts` — widen `drafts(...)` select
- `components/review/ReviewDashboard.tsx` — `manuscriptId` prop, "Review N" label, `<ReviewStages>`
- `app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx` — pass `manuscriptId`
- `app/api/pdf/[sessionId]/route.ts` — add `version_number` to select
- `lib/pdf/ReviewReport.tsx` — "Review N" header

---

## Task 1: Migration 008 + type field

**Files:**
- Create: `supabase/migrations/008_review_provenance.sql`
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/008_review_provenance.sql`:
```sql
-- Provenance for the progress delta: which prior session this review was compared against.
alter table public.review_sessions
  add column if not exists compared_to_session_id uuid references public.review_sessions(id) on delete set null;
```

- [ ] **Step 2: Add the type field**

In `lib/types/index.ts`, in the `ReviewSession` interface, add `compared_to_session_id?: string` immediately after the `score_delta?: ProgressComparatorResult` line. The surrounding lines are:
```ts
  score_delta?: ProgressComparatorResult
  error_message?: string
```
Make it:
```ts
  score_delta?: ProgressComparatorResult
  compared_to_session_id?: string
  error_message?: string
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_review_provenance.sql lib/types/index.ts
git commit -m "feat: add compared_to_session_id provenance column + type"
```

> **Controller applies the migration after this commit:** `npx supabase db push --yes` (idempotent; adds one nullable column).

---

## Task 2: Pure sequence helpers

**Files:**
- Create: `lib/review/sequence.ts`
- Test: `tests/reviewSequence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reviewSequence.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { reviewNumberFromSession, stageStatusFromSession } from '@/lib/review/sequence'

describe('reviewNumberFromSession', () => {
  it('uses the draft version number', () => {
    expect(reviewNumberFromSession({ drafts: { version_number: 3 } })).toBe(3)
  })
  it('defaults to 1 when absent', () => {
    expect(reviewNumberFromSession({})).toBe(1)
    expect(reviewNumberFromSession(null)).toBe(1)
  })
})

describe('stageStatusFromSession', () => {
  it('maps terminal statuses', () => {
    expect(stageStatusFromSession({ status: 'complete' })).toBe('complete')
    expect(stageStatusFromSession({ status: 'failed' })).toBe('failed')
  })
  it('maps a missing session to pending', () => {
    expect(stageStatusFromSession(null)).toBe('pending')
    expect(stageStatusFromSession(undefined)).toBe('pending')
  })
  it('maps every in-flight status to active', () => {
    for (const s of ['queued', 'routing', 'awaiting_confirmation', 'reviewing', 'adversarial', 'matching', 'comparing'] as const) {
      expect(stageStatusFromSession({ status: s })).toBe('active')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reviewSequence.test.ts`
Expected: FAIL — `Cannot find module '@/lib/review/sequence'`.

- [ ] **Step 3: Write the implementation**

Create `lib/review/sequence.ts`:
```ts
import type { ReviewStatus } from '@/lib/types'

export type StageStatus = 'pending' | 'active' | 'complete' | 'failed'

// Review N == the draft's version number (one review per uploaded revision).
export function reviewNumberFromSession(
  session: { drafts?: { version_number?: number } | null } | null | undefined
): number {
  return session?.drafts?.version_number ?? 1
}

// Coarse stage status for the tracker. Any non-terminal lifecycle status is "active".
export function stageStatusFromSession(
  session: { status?: ReviewStatus } | null | undefined
): StageStatus {
  if (!session) return 'pending'
  if (session.status === 'complete') return 'complete'
  if (session.status === 'failed') return 'failed'
  return 'active'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reviewSequence.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review/sequence.ts tests/reviewSequence.test.ts
git commit -m "feat: pure review-sequence helpers"
```

---

## Task 3: Persist progress provenance in the pipeline

**Files:**
- Modify: `lib/ai/pipeline.ts`

- [ ] **Step 1: Update the score_delta write**

In `lib/ai/pipeline.ts`, inside `runProgressComparison`, find this exact line (near the end of the function):
```ts
  await supabase.from('review_sessions').update({ score_delta: result }).eq('id', sessionId)
```
Replace it with:
```ts
  await supabase.from('review_sessions')
    .update({ score_delta: result, compared_to_session_id: prior.id })
    .eq('id', sessionId)
```
(`prior` is already in scope — it's `priorSessions?.[0]`, which selected `id`.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/pipeline.ts
git commit -m "feat: record compared_to_session_id when computing progress delta"
```

---

## Task 4: Stages API route

**Files:**
- Create: `app/api/manuscripts/[id]/stages/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/manuscripts/[id]/stages/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stageStatusFromSession, type StageStatus } from '@/lib/review/sequence'

interface DraftRow {
  id: string
  version_number: number
  review_sessions: Array<{ id: string; status: string; created_at: string }> | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS scopes drafts to the owner via the manuscript policy; an unowned id yields [].
  const { data: drafts } = await supabase
    .from('drafts')
    .select('id, version_number, review_sessions(id, status, created_at)')
    .eq('manuscript_id', params.id)
    .order('version_number', { ascending: true })

  const stages = ((drafts as unknown as DraftRow[]) ?? []).map((d) => {
    const sessions = d.review_sessions ?? []
    // Latest session for this draft = most recent by created_at.
    const latest = sessions.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
    const status: StageStatus = stageStatusFromSession(
      latest ? { status: latest.status as never } : null
    )
    return {
      number: d.version_number,
      label: `Review ${d.version_number}`,
      status,
      sessionId: latest?.id ?? null,
    }
  })

  return NextResponse.json({ stages })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds; `/api/manuscripts/[id]/stages` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add "app/api/manuscripts/[id]/stages/route.ts"
git commit -m "feat: per-manuscript review stages API"
```

---

## Task 5: Widen the status route select

**Files:**
- Modify: `app/api/review/status/[sessionId]/route.ts`

- [ ] **Step 1: Add version_number + manuscript_id to the drafts select**

In `app/api/review/status/[sessionId]/route.ts`, find this exact line in the `.select(...)`:
```ts
      drafts(manuscripts(field, subfield, doc_type, title, abstract))
```
Replace it with:
```ts
      drafts(version_number, manuscript_id, manuscripts(field, subfield, doc_type, title, abstract))
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "app/api/review/status/[sessionId]/route.ts"
git commit -m "feat: expose draft version_number in review status"
```

---

## Task 6: ReviewStages tracker component

**Files:**
- Create: `components/review/ReviewStages.tsx`

- [ ] **Step 1: Write the component**

Create `components/review/ReviewStages.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, Loader2 } from 'lucide-react'

interface Stage {
  number: number
  label: string
  status: 'pending' | 'active' | 'complete' | 'failed'
  sessionId: string | null
}

export function ReviewStages({
  manuscriptId,
  currentSessionId,
}: {
  manuscriptId: string
  currentSessionId: string
}) {
  const [stages, setStages] = useState<Stage[]>([])

  useEffect(() => {
    let active = true
    fetch(`/api/manuscripts/${manuscriptId}/stages`)
      .then((r) => r.json())
      .then((d) => { if (active) setStages(d.stages ?? []) })
      .catch(() => {})
    return () => { active = false }
  }, [manuscriptId])

  // Single-review manuscripts look unchanged.
  if (stages.length < 2) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {stages.map((s, i) => {
        const isCurrent = s.sessionId === currentSessionId
        const icon =
          s.status === 'complete' ? <Check className="h-3 w-3" />
          : s.status === 'failed' ? <X className="h-3 w-3" />
          : s.status === 'active' ? <Loader2 className="h-3 w-3 animate-spin" />
          : <span className="text-[10px] leading-none">{s.number}</span>
        const chip = (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              isCurrent
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground'
            }`}
          >
            {icon} {s.label}
          </span>
        )
        return (
          <span key={s.number} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            {s.sessionId && !isCurrent ? (
              <Link href={`/manuscripts/${manuscriptId}/review/${s.sessionId}`}>{chip}</Link>
            ) : (
              chip
            )}
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/review/ReviewStages.tsx
git commit -m "feat: inline review stage tracker"
```

---

## Task 7: Wire label + tracker into ReviewDashboard

**Files:**
- Modify: `components/review/ReviewDashboard.tsx`

- [ ] **Step 1: Add imports**

After the existing line `import { PdfReportModal } from './PdfReportModal'`, add:
```tsx
import { ReviewStages } from './ReviewStages'
import { reviewNumberFromSession } from '@/lib/review/sequence'
```

- [ ] **Step 2: Add the manuscriptId prop**

Change the component signature. The current line is:
```tsx
export function ReviewDashboard({ sessionId }: { sessionId: string }) {
```
Replace it with:
```tsx
export function ReviewDashboard({ sessionId, manuscriptId }: { sessionId: string; manuscriptId: string }) {
```

- [ ] **Step 3: Add the tracker + "Review N" label to the completed view**

Find this exact block (the start of the completed-review return):
```tsx
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button variant="outline" className="ml-auto" onClick={() => setShowPdf(true)}>
          PDF report
        </Button>
```
Replace it with:
```tsx
  const reviewNumber = reviewNumberFromSession(
    session as unknown as { drafts?: { version_number?: number } }
  )

  return (
    <div>
      <ReviewStages manuscriptId={manuscriptId} currentSessionId={sessionId} />
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Review {reviewNumber}
        </span>
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
        <Button variant="outline" className="ml-auto" onClick={() => setShowPdf(true)}>
          PDF report
        </Button>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds. (Note: `const reviewNumber` sits after the earlier `if (session.status !== 'complete') return …` guards, so `session` is the completed session here — placing a `const` mid-function before the final `return` is valid.)

- [ ] **Step 5: Commit**

```bash
git add components/review/ReviewDashboard.tsx
git commit -m "feat: show Review N label + stage tracker in dashboard"
```

---

## Task 8: Pass manuscriptId from the review page

**Files:**
- Modify: `app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx`

- [ ] **Step 1: Pass the prop**

The current file body renders `<ReviewDashboard sessionId={params.sessionId} />`. Find this exact line:
```tsx
      <ReviewDashboard sessionId={params.sessionId} />
```
Replace it with:
```tsx
      <ReviewDashboard sessionId={params.sessionId} manuscriptId={params.id} />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx"
git commit -m "feat: pass manuscriptId to ReviewDashboard"
```

---

## Task 9: "Review N" in the PDF

**Files:**
- Modify: `app/api/pdf/[sessionId]/route.ts`, `lib/pdf/ReviewReport.tsx`

- [ ] **Step 1: Add version_number to the PDF select**

In `app/api/pdf/[sessionId]/route.ts`, find this exact line in the `.select(...)`:
```ts
      drafts(manuscripts(title, abstract))
```
Replace it with:
```ts
      drafts(version_number, manuscripts(title, abstract))
```

- [ ] **Step 2: Update the PDF props type**

In `lib/pdf/ReviewReport.tsx`, find the props interface:
```tsx
export interface ReviewPdfProps {
  session: ReviewSession & {
    drafts?: { manuscripts?: { title?: string; abstract?: string } }
  }
  generatedAt: string
}
```
Replace it with:
```tsx
export interface ReviewPdfProps {
  session: ReviewSession & {
    drafts?: { version_number?: number; manuscripts?: { title?: string; abstract?: string } }
  }
  generatedAt: string
}
```

- [ ] **Step 3: Use a "Review N" header**

In `lib/pdf/ReviewReport.tsx`, inside `ReviewPDFDocument`, find this line:
```tsx
  const title = session.drafts?.manuscripts?.title ?? 'Untitled manuscript'
```
Add immediately after it:
```tsx
  const reviewNumber = session.drafts?.version_number
  const headerTitle = reviewNumber ? `ScholarLens — Review ${reviewNumber}` : 'ScholarLens — Review report'
```
Then find the Page 1 header line:
```tsx
            <Text style={styles.headerTitle}>ScholarLens — Review report</Text>
```
Replace it with:
```tsx
            <Text style={styles.headerTitle}>{headerTitle}</Text>
```

- [ ] **Step 4: Verify build + PDF still renders**

Run: `npm run build`
Expected: Build succeeds.
Run: `npx vitest run tests/pdfReport.test.tsx`
Expected: PASS (the existing render test still produces a `%PDF` buffer; the test session has no `drafts.version_number`, so the header falls back to "Review report").

- [ ] **Step 5: Commit**

```bash
git add "app/api/pdf/[sessionId]/route.ts" lib/pdf/ReviewReport.tsx
git commit -m "feat: show Review N in PDF header"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: All suites pass, including the new `tests/reviewSequence.test.ts` (5 tests) and the existing `tests/pdfReport.test.tsx`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles; `/api/manuscripts/[id]/stages` is in the route list.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`. With a manuscript that has two drafts each reviewed:
- The review page for the v2 session shows a **"Review 2"** label and a two-chip tracker ("Review 1 → Review 2", current highlighted); clicking "Review 1" navigates to that session.
- A manuscript with a single draft shows **no** tracker and a "Review 1" label.
- The Progress tab still renders (the v2 session has `score_delta`), and the v2 session row now has `compared_to_session_id` set to the v1 session.
- The PDF for the v2 session shows **"ScholarLens — Review 2"** in the header.

- [ ] **Step 4: Final commit (if any stray changes)**

```bash
git add -A
git commit -m "chore: review sequencing verification pass"
```

---

## Deferred (not in this plan)
- Polished vertical-nav stage tracker + "Upload revision" button (design-system cycle).
- Rendering the tracker during in-flight (non-complete) review states.
- Surfacing `compared_to_session_id` as a "vs Review N−1" hint in the Progress tab.
