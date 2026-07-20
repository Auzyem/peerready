# ScholarLens — Review Sequencing (Phase 2) Design

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan
**Source:** `peerready-v2-upgrade-prompt.md` UPGRADE 1 (review sequencing) + UPGRADE 6 (stages API), reconciled against the live codebase. Deferred from V2 Phase 1.

## Context

The app already sequences reviews by draft `version_number`:

- Manuscript → drafts (each upload increments `version_number` in `app/api/upload/route.ts`) →
  each draft gets a `review_session` (`app/api/review/start/route.ts`).
- After a deep review, `lib/ai/pipeline.ts → runProgressComparison` finds the prior draft's
  most-recent completed session and stores a `score_delta` on the current session (powers the
  Progress tab and the PDF Progress page).

What does **not** exist: a "Review N" label in the UI, a manuscript-level stage tracker, or a
stored link to the session the progress delta compared against.

The original spec (UPGRADE 1) proposed a parallel `review_number` column + `review_label`
generated column + `review_stage_status` table + `compared_to_session_id`. A separate
`review_number` is **redundant** with `version_number` (one review per uploaded draft) and a
`review_stage_status` table duplicates state already implicit in drafts + sessions. Maintaining
two sequencing mechanisms invites drift.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| What "Review N" counts | **Each uploaded revision** → `review_number === draft.version_number` |
| Schema footprint | **Derive + one provenance column.** No `review_number` column, no `review_stage_status` table. Add only `compared_to_session_id` on `review_sessions`. |
| UI scope this cycle | **"Review N" labels + a minimal inline stage tracker** in the existing Tailwind `ReviewDashboard`. Polished vertical-nav layout stays deferred to the design-system cycle. |
| PDF | Show **"Review N"** in the report header (cheap consistency). |
| In-flight status mapping | Any non-terminal session status (queued/routing/awaiting_confirmation/reviewing/adversarial/matching/comparing) → stage status **`active`**. |

## Architecture

`review_number` is a **derived value** (`draft.version_number`), surfaced via existing joins —
never a stored counter. Per-manuscript stages are **derived** from drafts + their latest
sessions via a new read-only API. The only write-side change is recording progress provenance.

### Data
- **`supabase/migrations/008_review_provenance.sql`**
  `alter table public.review_sessions add column if not exists compared_to_session_id uuid references public.review_sessions(id) on delete set null;`
  Idempotent; apply via `npx supabase db push --yes` (CLI now wired).
- **`lib/types/index.ts`** — add `compared_to_session_id?: string` to `ReviewSession`.

### Logic
- **`lib/review/sequence.ts`** (new, pure, unit-tested):
  - `reviewNumberFromSession(session)` → `session.drafts?.version_number ?? 1`.
  - `stageStatusFromSession(session)` → `'pending' | 'active' | 'complete' | 'failed'`
    (`complete`→complete, `failed`→failed, none→pending, otherwise→active).
- **`lib/ai/pipeline.ts → runProgressComparison`** — when a prior session is found, persist
  `compared_to_session_id: prior.id` alongside the existing `score_delta` update (one extra field;
  `prior.id` is already selected). Still best-effort (wrapped in the existing try/catch).

### API
- **`app/api/manuscripts/[id]/stages/route.ts`** (new) — `GET`. Auth via `createClient()`;
  RLS scopes ownership through the existing `drafts`/`manuscripts` policies. Query the manuscript's
  drafts ordered by `version_number`, each with its sessions; for each draft pick the latest session
  and return `[{ number: version_number, label: "Review N", status: stageStatusFromSession(latest), sessionId }]`.
  A draft with no session → `status: 'pending'`, `sessionId: null`.
- **`app/api/review/status/[sessionId]/route.ts`** — widen the `drafts(...)` select to
  `drafts(version_number, manuscript_id, manuscripts(field, subfield, doc_type, title, abstract))`
  so the dashboard can label the review and fetch stages.

### UI (existing Tailwind/shadcn; no redesign)
- **`components/review/ReviewStages.tsx`** (new) — compact inline tracker: one chip/row per stage
  ("Review 1 ✓ · Review 2 active"), current session highlighted, each non-current stage with a
  session links to `/manuscripts/[id]/review/[sessionId]`. Hidden when there is only one stage.
- **`components/review/ReviewDashboard.tsx`** — add a `manuscriptId: string` prop; show a
  "Review N" label beside the verdict/score (from `reviewNumberFromSession`); render `<ReviewStages>`
  (fetches `/api/manuscripts/[manuscriptId]/stages`).
- **`app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx`** — pass `manuscriptId={params.id}`.

### PDF
- **`app/api/pdf/[sessionId]/route.ts`** — add `version_number` to the `drafts(...)` select.
- **`lib/pdf/ReviewReport.tsx`** — header shows "ScholarLens — Review N" when a version is present
  (falls back to "Review report"). `ReviewPdfProps.session.drafts` gains `version_number?: number`.

## Data flow

Upload revision → draft `vN` → start review → session. Pipeline: routing → (confirm) → deep
review → `runProgressComparison` stores `score_delta` **and** `compared_to_session_id` (the prior
draft's completed session). Dashboard: status route returns `drafts.version_number` →
`reviewNumberFromSession` → "Review N"; `ReviewStages` fetches the stages API and renders the
tracker. PDF header shows "Review N".

## Error handling
Stages API returns `[]` when a manuscript has no drafts; `ReviewStages` renders nothing for <2
stages. Progress provenance write stays inside the existing best-effort try/catch (never fails the
saved review). RLS denial → empty result, not an error leak.

## Testing
- Unit (`tests/reviewSequence.test.ts`): `reviewNumberFromSession` (version present / absent),
  `stageStatusFromSession` (complete / failed / none / each in-flight status → active).
- `npm run build` gates every commit (house rule; `npm test` is lenient).
- Manual: manuscript with two drafts → dashboard shows "Review 2" + a two-stage tracker; Progress
  tab/PDF reflect the delta; PDF header reads "Review 2".

## Out of scope (deferred)
- Polished vertical-nav stage tracker + "Upload revision" button (design-system cycle).
- Any separate `review_number` counter or `review_stage_status` table.
- Surfacing `compared_to_session_id` as a "vs Review N−1" UI hint (optional later polish).
