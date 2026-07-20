# Reporting-Guideline Checklist — Design

**Date:** 2026-05-31
**Status:** Approved (design)
**Feature:** A new on-demand review pass that checks a manuscript against the canonical
reporting checklist for its study type (CONSORT, PRISMA, ARRIVE, STROBE, or a generic
fallback), returning a per-item verdict with evidence and a concrete fix, plus a
completeness score.

## Context

ScholarLens already runs a standard review pipeline and two on-demand add-on passes —
**Adversarial critique** and **Journal matching**. Both follow an identical shape:

- a `<feature>_status` lifecycle column on `review_sessions`
  (`not_started → running → complete | failed`),
- a results table with RLS scoped through `manuscripts → drafts → review_sessions`,
- a pure, testable prompt module (`lib/ai/prompts/*.ts`),
- a detached pipeline (`lib/ai/*Pipeline.ts`) run via `waitUntil`,
- a `/start` API route gated on `status === 'complete'`,
- a tab in `ReviewDashboard` whose poll loop watches the `running` state.

The reporting-guideline checklist slots into this exact mold as the third add-on.

## Decisions (locked during brainstorming)

1. **Checklist item source: embedded canonical lists.** The real checklist items are
   hard-coded as static data; Claude only judges each item against the manuscript. The
   standard is fixed and complete; only the per-item judgment is AI. (Rejected: letting
   Claude recall the items itself — weaker as a "compliance" claim.)
2. **Guideline selection: auto-detect, user can override.** Detection is deterministic
   (no model call); the detected guideline is shown in a dropdown the user can change
   before running.
3. **v1 guideline set: core 4 + generic fallback** — CONSORT, PRISMA, ARRIVE, STROBE,
   and a generic "reporting essentials" list for papers matching none.

## Components

### 1. Embedded checklist data — `lib/reporting/guidelines.ts`

Pure static module. No DB, no AI, no side effects.

```ts
export type ReportingGuidelineId =
  | 'consort_2010' | 'prisma_2020' | 'arrive_2' | 'strobe' | 'generic'

export interface ReportingGuidelineItem {
  code: string        // e.g. "1a", "13b"
  section: string     // e.g. "Title and abstract", "Methods"
  requirement: string // the checklist item text
}

export interface ReportingGuideline {
  id: ReportingGuidelineId
  name: string         // "CONSORT 2010"
  version: string
  url: string          // canonical reference URL
  applicableTo: string // human-readable scope, also used in detection rationale
  items: ReportingGuidelineItem[]
}

export const GUIDELINES: Record<ReportingGuidelineId, ReportingGuideline>
export const GUIDELINE_IDS: ReportingGuidelineId[]
```

v1 item sets:

| id             | name              | items | applies to                                  |
|----------------|-------------------|-------|---------------------------------------------|
| `consort_2010` | CONSORT 2010      | 25    | Randomized controlled trials                |
| `prisma_2020`  | PRISMA 2020       | 27    | Systematic reviews / meta-analyses          |
| `arrive_2`     | ARRIVE 2.0        | 10    | Animal research (the **Essential 10** subset) |
| `strobe`       | STROBE            | 22    | Observational studies (cohort / case-control / cross-sectional) |
| `generic`      | Reporting essentials | ~8 | Fallback: structured abstract, keywords, funding, ethics/IRB, informed consent, conflict-of-interest, data availability, author contributions |

**ARRIVE scope:** v1 embeds the ARRIVE 2.0 **Essential 10** (not the full 21-item set) to
keep the data tractable and high-value. Expanding to the full set is a future enhancement.

### 2. Guideline selection — `detectGuideline()` (pure, deterministic)

Lives alongside the guideline data. No Claude call — maps existing session/manuscript
metadata to a guideline + rationale string:

```ts
export function detectGuideline(input: {
  docType?: string
  persona?: string
  title?: string
  abstract?: string
}): { id: ReportingGuidelineId; rationale: string }
```

Rules (first match wins):

1. `docType === 'systematic_review'` → `prisma_2020`
2. RCT signals — `persona === 'biomedical_rct'` OR title/abstract matches
   `/randomi[sz]ed controlled trial|\bRCT\b/i` → `consort_2010`
3. Animal signals — title/abstract matches `/\b(mice|mouse|rats?|in vivo|animal model|murine|zebrafish)\b/i`
   → `arrive_2`
4. Observational signals — matches `/cohort|case-control|cross-sectional|observational/i`
   → `strobe`
5. else → `generic`

The detected id is the **default** in the UI dropdown; the user can override before
running. The override simply changes which item list is fed to Claude.

### 3. Prompt module — `lib/ai/prompts/reportingChecker.ts`

Mirrors `journalMatcher.ts`.

```ts
export interface ReportingCheckParams {
  manuscriptText: string
  guideline: ReportingGuideline
}

export function buildReportingContext(p: ReportingCheckParams): string
export function runReportingChecker(p: ReportingCheckParams): Promise<ReportingCheckerResult>
```

- System prompt: expert assessing the manuscript against the named guideline; for each
  numbered item decide `present | partial | missing | not_applicable`, give brief
  `evidence` (a short quote or the section where it is satisfied), and a concrete `fix`
  when not fully present. Return ONLY JSON.
- `buildReportingContext` assembles the manuscript text (same `parsed_text` the deep
  reviewer consumes) plus the explicit item list (code + section + requirement) so Claude
  judges against the canonical items rather than recalling them.
- `runReportingChecker` calls Claude (shared `MODEL` / `MAX_TOKENS`), extracts JSON, with
  **one retry on malformed JSON** — same as the other prompt modules.

```ts
export interface ReportingCheckerResult {
  summary: string
  items: Array<{
    code: string
    status: 'present' | 'partial' | 'missing' | 'not_applicable'
    evidence: string
    fix: string
  }>
}
```

**Completeness is computed server-side**, not trusted from the model:
`completeness = (present + 0.5 * partial) / (total - not_applicable)`, in `[0,1]`.
A pure helper `computeCompleteness(items)` is unit-tested.

### 4. Pipeline — `lib/ai/reportingCheckPipeline.ts`

Mirrors `journalMatchPipeline.ts`:

1. `reporting_check_status = 'running'`.
2. Load `review_sessions` joined to `drafts → manuscripts` (admin/service-role client).
3. Resolve the guideline from `session.reporting_guideline_id` (set by the start route).
4. `runReportingChecker({ manuscriptText: draft.parsed_text, guideline })`.
5. Insert one `reporting_checklist_items` row per item (denormalized: also stores
   `section` + `requirement` so the result is self-contained).
6. Store `reporting_summary` on the session; set `reporting_check_status = 'complete'`.
7. On throw: set `reporting_check_status = 'failed'` and rethrow.

### 5. Data layer — migration `005_reporting_check.sql`

```sql
alter table public.review_sessions
  add column reporting_check_status text
    check (reporting_check_status in ('not_started','running','complete','failed'))
    default 'not_started',
  add column reporting_guideline_id text,
  add column reporting_summary text;

create table public.reporting_checklist_items (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  guideline_id text not null,
  item_code text not null,
  section text,
  requirement text,
  status text check (status in ('present','partial','missing','not_applicable')) not null,
  evidence text,
  fix text,
  created_at timestamptz default now()
);

alter table public.reporting_checklist_items enable row level security;

create policy "users_own_reporting_items" on public.reporting_checklist_items for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
```

### 6. API — `app/api/review/reporting/start/route.ts`

Mirrors `journals/start/route.ts`:

- Auth; RLS-scoped fetch of the session (returns only the user's own).
- Body `{ sessionId, guidelineId }`. Validate `guidelineId ∈ GUIDELINE_IDS` → 400 if not.
- Gate: `session.status === 'complete'` (else 409) and `reporting_check_status` not
  already `running`/`complete` (else 409).
- Persist `reporting_guideline_id = guidelineId`.
- `waitUntil(runReportingCheckPipeline(sessionId))` with the same non-Vercel fallback.

**Status route** (`app/api/review/status/[sessionId]`): add `reporting_checklist_items(*)`
to the nested select, and widen the manuscript sub-select from
`(field, subfield, doc_type)` to also include `title, abstract` so the dashboard can run
`detectGuideline()` client-side (it already needs `persona`, which is on the session).

### 7. Types — `lib/types/index.ts`

- Extend `ReviewSession` with `reporting_check_status?`, `reporting_guideline_id?`,
  `reporting_summary?`, and `reporting_checklist_items?: ReportingChecklistItem[]`.
- Add `ChecklistItemStatus` and `ReportingChecklistItem` (the persisted row shape) plus
  the `ReportingCheckerResult` (AI output) interface noted above.

### 8. UI

**`components/review/ReportingChecklist.tsx`** — renders persisted items grouped by
`section`; status chips with the established colour language
(present = green, partial = amber, missing = red, not_applicable = gray); each item shows
its `requirement`, `evidence`, and `fix`. Header shows the guideline name and completeness
("19 / 25 satisfied", derived from the items).

**`components/review/ReviewDashboard.tsx`** — add a **"Reporting"** tab mirroring the four
states of the Journals tab:

- `not_started`: explanatory copy + a guideline `<select>` (default = `detectGuideline(...)`,
  computed from the session's `reviewer_persona` and the manuscript `doc_type`/`title`/
  `abstract` now returned by the status route) + a "Run compliance check" button.
- `running`: progress indicator.
- `complete`: `<ReportingChecklist>`.
- `failed`: error + retry (re-uses the last chosen guideline).

Add `startReporting(guidelineId)` mirroring `startJournals()` (optimistic `running`, POST,
revert on failure, reconciling `poll()`), and extend the poll-loop continuation check with
`reporting_check_status === 'running'`.

### 9. Export — `lib/exporters/reviewMatrix.ts`

Add a 5th sheet, **"Reporting checklist"**: columns = item code, section, requirement,
status, evidence, fix. Present only when reporting items exist.

## Testing (TDD)

- `guidelines.ts`: each guideline has the expected item count (CONSORT 25, PRISMA 27,
  ARRIVE 10, STROBE 22) and unique item codes; every id is in `GUIDELINE_IDS`.
- `detectGuideline()`: each rule fires for representative inputs; unmatched input → `generic`.
- `buildReportingContext()`: output includes every item code in the chosen guideline.
- `computeCompleteness()`: present/partial/missing/not_applicable math, including the
  all-N/A edge case (avoid divide-by-zero).
- Pipeline and route follow the existing add-ons' test depth (pure pieces unit-tested;
  pipeline exercised against the same patterns as `journalMatchPipeline`).

## Scope boundaries (YAGNI)

- **One guideline per run, locked once complete** — exactly like journal matching.
  Re-running a session with a different guideline is a future enhancement, not v1.
- ARRIVE limited to the **Essential 10** in v1.
- No PDF/inline annotation of checklist items; no simultaneous multi-guideline checks.

## Verification gate

Per project convention, the commit gate is `npm run build` (not `npm test`, which is
lenient). All new pure units ship with passing Vitest tests, and the production build must
compile clean before the work is considered done.
