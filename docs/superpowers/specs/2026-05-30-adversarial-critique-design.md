# ScholarLens — Adversarial Critique Design Spec

**Date:** 2026-05-30
**Status:** Approved (brainstorming) — ready for implementation plan
**Builds on:** `docs/superpowers/plans/2026-05-30-scholarlens-vertical-slice.md` (vertical slice, Tasks 1–19 complete)

## Goal

Add an **on-demand adversarial critique** to a completed review: a second, hostile "Reviewer 2"
pass that the user triggers from the review page. It is grounded in the manuscript *and* the
standard review's findings, and is briefed to **escalate, not repeat** — surfacing the fatal
flaws a polite reviewer softened. Output is a list of numbered objections, each with a quoted
passage and a required fix, plus a short summary. Results render in a new "Adversarial" tab.

The standard review and its Overview tab are never disturbed — the fast happy path is untouched.

## Why these choices (settled during brainstorming)

- **On-demand, not automatic or opt-in-at-start.** The standard review completes as today; the
  user opts into the harsher pass only when they want it. No mode selector on the new-review page.
- **Grounded in the prior review.** The adversarial reviewer sees the manuscript plus a compact
  summary of the standard review's weakest dimensions and `weakness_summary`, with a brief to
  pressure-test and escalate them — producing non-redundant, harsher critiques.
- **Server-side status column.** A dedicated `adversarial_status` makes progress unambiguous
  (survives page reloads, distinguishes "running" from "done with zero critiques", and records a
  real failure) at the cost of one more manual migration step.

## Existing scaffolding reused (no change)

- `adversarial_critiques` table + its RLS policy (migration 001).
- `AdversarialCritique` row interface in `lib/types/index.ts`.
- `ReviewStatus` already includes `'adversarial'`; `ReviewSession.adversarial_critiques?` exists.
- Status route `app/api/review/status/[sessionId]/route.ts` already selects
  `adversarial_critiques(*)`; `*` covers the new columns. No change beyond client-side ordering.
- Dashboard `Tabs` shell in `components/review/ReviewDashboard.tsx`.
- Detached-pipeline pattern (`waitUntil` + service-role admin client) from `lib/ai/pipeline.ts`.

## Architecture

```
Completed review page
  └─ ReviewDashboard.tsx  ── Adversarial tab
        ├─ adversarial_status = not_started → "Run adversarial critique" button
        │      └─ POST /api/review/adversarial/start { sessionId }
        │            ├─ cookie/RLS client: auth + ownership + guard
        │            └─ waitUntil( runAdversarialPipeline(sessionId) )   [service-role, detached]
        │                  ├─ set adversarial_status = 'running'
        │                  ├─ load manuscript + scores + weakness_summary
        │                  ├─ runAdversarialReviewer(...)   [Anthropic + extractJson + 1 retry]
        │                  ├─ insert adversarial_critiques rows
        │                  └─ set adversarial_status='complete' + adversarial_summary
        ├─ running   → poll status every 3s, show "Running adversarial critique…"
        ├─ complete  → adversarial_summary + AdversarialPanel(critiques)
        └─ failed    → error + retry button
```

## Components

### 1. Migration — `supabase/migrations/002_adversarial_status.sql`

```sql
alter table public.review_sessions
  add column adversarial_status text
    check (adversarial_status in ('not_started','running','complete','failed'))
    default 'not_started';
alter table public.review_sessions
  add column adversarial_summary text;
```

No new RLS: `review_sessions` and `adversarial_critiques` are already user-scoped.
Applied manually in the Supabase SQL editor (same as 001).

**Backfill note:** the `default 'not_started'` applies to existing rows on add, so any review
sessions created before this migration become `not_started` and are eligible to run.

### 2. Types — `lib/types/index.ts`

Add to `ReviewSession`:
```typescript
adversarial_status?: 'not_started' | 'running' | 'complete' | 'failed'
adversarial_summary?: string
```

Add a new result interface (the AI output shape, distinct from the stored row):
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

`AdversarialCritique` (stored row, includes `id`, `session_id`, `critique_number`, `resolved`)
already exists and is unchanged.

### 3. AI prompt module — `lib/ai/prompts/adversarialReviewer.ts`

Mirrors `deepReviewer.ts`: a system prompt, one Anthropic call, `extractJson` with one retry.

- **Signature:** `runAdversarialReviewer(manuscriptText: string, persona: ReviewerPersona,
  field: string, priorReviewContext: string): Promise<AdversarialReviewerResult>`
- **System prompt:** frames a hostile but fair "Reviewer 2" who has reviewed 200+ papers in the
  field. Explicitly instructed to **escalate and pressure-test the weaknesses already raised, not
  restate them**; every critique must quote an exact passage and give a concrete required fix.
  Returns ONLY JSON matching `AdversarialReviewerResult`.
- **User message:** field + persona + the prior-review context string + the manuscript text
  (`.slice(0, 80000)`, same cap as deep reviewer).
- **Pure, unit-testable seam:** `buildPriorReviewContext(scores: Score[], weaknessSummary?:
  string): string` — assembles a compact string listing the lowest-scoring dimensions (with their
  rationales) and the weakness summary. Exported for testing. This is the TDD touchpoint; the
  network call itself is not unit-tested (consistent with `deepReviewer`).

### 4. Pipeline — `lib/ai/adversarialPipeline.ts`

`runAdversarialPipeline(sessionId: string): Promise<void>`, using the **service-role admin
client** (`createAdminClient()`), because it runs detached from the request (no user cookie) —
identical pattern to `lib/ai/pipeline.ts`.

Steps:
1. `update review_sessions set adversarial_status='running' where id=sessionId`
2. Load `review_sessions` with `drafts(*, manuscripts(*))` and the session's existing `scores(*)`
   plus `weakness_summary` and `reviewer_persona`.
3. `const priorReviewContext = buildPriorReviewContext(scores, weakness_summary)`
4. `runAdversarialReviewer(parsed_text, reviewer_persona, manuscript.field, priorReviewContext)`
5. Insert `adversarial_critiques` rows, assigning `critique_number` by array index (1-based).
6. `update review_sessions set adversarial_status='complete', adversarial_summary=result.summary`
7. **On error:** `update review_sessions set adversarial_status='failed'`. The main review's
   `status` and `error_message` are left untouched (the standard review remains valid).

Guard against a missing persona/field: fall back to a generic persona string and the field on
the manuscript row; if `parsed_text` is empty, fail fast with `adversarial_status='failed'`.

### 5. API route — `app/api/review/adversarial/start/route.ts`

```
POST { sessionId }      export const maxDuration = 300
```
1. Cookie/RLS server client; `getUser()` → 401 if no user.
2. Select the session by id under RLS. If no row → 404 (RLS blocks non-owners — also the
   ownership guarantee).
3. **Guard:** only proceed if `adversarial_status` is `not_started` or `failed`. If `running` or
   `complete`, return `409 { error: 'Adversarial critique already running or complete' }` (no
   duplicate runs / no clobbering).
4. `waitUntil(runAdversarialPipeline(sessionId))`; return `{ ok: true }`.

### 6. UI

**`components/review/AdversarialPanel.tsx`** (new): given `AdversarialCritique[]`, render them
ordered by severity (`critical → major → minor`) then `critique_number`. Each card shows the
severity badge, `title`, the `quoted_passage` (styled as a quote), the `objection`, the
`required_fix` (highlighted), and `section_reference` if present. Empty state: "No critiques —
the adversarial reviewer found nothing to escalate."

**`components/review/ReviewDashboard.tsx`** (modify):
- Add a second tab: `<TabsTrigger value="adversarial">Adversarial</TabsTrigger>` and a matching
  `TabsContent`. The tab is present once the main review is `complete`.
- Tab content branches on `session.adversarial_status` (treat `undefined` as `not_started`):
  - `not_started` → intro line + **"Run adversarial critique"** button. On click: POST the start
    route, optimistically set local state to `running`, and resume polling.
  - `running` → `Progress`/spinner with "Running adversarial critique…".
  - `complete` → `adversarial_summary` paragraph + `AdversarialPanel`.
  - `failed` → red error line + **"Retry"** button (same POST; guard allows `failed`).
- **Polling fix:** the effect currently stops polling when main `status` is `complete`/`failed`.
  Change the continue-condition to keep polling while **either** the main status is non-terminal
  **or** `adversarial_status === 'running'`. Critiques are ordered in `AdversarialPanel`, so the
  status route needs no ordering change.

## Data flow (happy path)

1. User opens a `complete` review → Adversarial tab shows the Run button.
2. Click → `POST /api/review/adversarial/start { sessionId }` → 200; pipeline detached.
3. Dashboard resumes 3s polling of the status route; sees `adversarial_status: 'running'`.
4. Pipeline finishes → next poll returns `adversarial_status: 'complete'` with
   `adversarial_critiques` populated and `adversarial_summary` set.
5. Tab renders the summary + ordered critique cards. Polling stops.

## Error handling

- **Malformed AI JSON:** `extractJson` + one retry inside the reviewer; if both fail, the pipeline
  catch sets `adversarial_status='failed'` → UI shows the failed state + Retry.
- **Duplicate start:** guarded by the status check → `409`, no second pipeline.
- **Non-owner / missing session:** RLS yields no row → `404`.
- **Empty `parsed_text`:** pipeline fails fast → `failed`.
- The standard review's data and Overview tab are never modified by this feature.

## Testing

- **Unit (TDD):** `tests/ai/adversarialReviewer.test.ts` for `buildPriorReviewContext` — verifies
  it includes the lowest dimensions, their rationales, and the weakness summary, and tolerates
  empty/zero-score inputs. (Network call not unit-tested, matching `deepReviewer`.)
- **Build gates:** `npx tsc --noEmit` and `npm run build` clean; existing `npm test` still passes.
- **Manual E2E:** run a standard review to `complete` → open Adversarial tab → Run → observe
  `running` → `complete` with critiques and summary; reload mid-run and confirm `running` persists;
  trigger a failure path (e.g., temporarily empty text) and confirm the failed + Retry state.

## Cost / limits

~15–25k tokens and ~30–60s per adversarial pass, within `maxDuration: 300` on the start route
(Vercel Pro; the Hobby 60s limit caveat from the slice still applies).

## Out of scope (unchanged from slice deferrals)

Journal matching, draft-to-draft progress comparison, XLSX export, Google OAuth, settings page,
low-confidence "confirm field" step, rate limiting, and marking critiques `resolved` in the UI
(the `resolved` column exists but no toggle UI is built here).
