# Reporting-Guideline Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third on-demand review pass that checks a manuscript against the canonical reporting checklist for its study type (CONSORT, PRISMA, ARRIVE, STROBE, or a generic fallback) and returns a per-item present/partial/missing/N/A verdict with evidence, a fix, and a completeness score.

**Architecture:** Mirrors the existing journal-match / adversarial add-ons exactly: a `reporting_check_status` lifecycle column + a results table with RLS, a pure prompt module, a detached `waitUntil` pipeline, a `/start` route gated on `status==='complete'`, and a "Reporting" tab in `ReviewDashboard` watched by the poll loop. Checklist items are embedded canonical data (Claude only judges them); guideline selection is deterministic with a user override.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), Anthropic Claude (`claude-sonnet-4-6`), Vitest, `xlsx`.

**Conventions (from the codebase):**
- Tests live in `tests/<area>/<name>.test.ts`, import via the `@/` alias, use `describe/it/expect` from `vitest`.
- Prompt modules export a pure `build*Context` (unit-tested) + a `run*` that calls Claude with one retry on malformed JSON.
- Pipelines use `createAdminClient()` (service-role), set status `running` → do work → set `complete`, and set `failed` in `catch`.
- **The commit gate is `npm run build`** (the project's `npm test` is lenient). Each code task commits; the final task runs the build.

**Branch note:** This session has been committing directly to `main`. Continue on `main` unless you prefer a feature branch.

---

## File structure

**Create:**
- `lib/reporting/guidelines.ts` — guideline data types + `GUIDELINES` + `GUIDELINE_IDS`
- `lib/reporting/detect.ts` — `detectGuideline()` (pure, deterministic)
- `lib/reporting/completeness.ts` — `computeCompleteness()` (pure)
- `lib/ai/prompts/reportingChecker.ts` — `buildReportingContext()` + `runReportingChecker()`
- `lib/ai/reportingCheckPipeline.ts` — detached pipeline
- `app/api/review/reporting/start/route.ts` — on-demand trigger
- `supabase/migrations/005_reporting_check.sql` — schema
- `components/review/ReportingChecklist.tsx` — results UI
- Tests: `tests/reporting/guidelines.test.ts`, `tests/reporting/detect.test.ts`, `tests/reporting/completeness.test.ts`, `tests/ai/reportingChecker.test.ts`

**Modify:**
- `lib/types/index.ts` — new types + `ReviewSession` fields
- `app/api/review/status/[sessionId]/route.ts` — widen the nested select
- `components/review/ReviewDashboard.tsx` — Reporting tab + `startReporting` + poll
- `lib/exporters/reviewMatrix.ts` (+ `tests/exporters/reviewMatrix.test.ts`) — 5th sheet

---

## Task 1: Domain types

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Add the reporting types and extend `ReviewSession`**

At the end of `lib/types/index.ts` add:

```ts
export type ChecklistItemStatus = 'present' | 'partial' | 'missing' | 'not_applicable'

// One persisted checklist row (denormalized: stores section + requirement so the
// result is self-contained and survives changes to the static guideline data).
export interface ReportingChecklistItem {
  id: string
  session_id: string
  guideline_id: string
  item_code: string
  section?: string
  requirement?: string
  status: ChecklistItemStatus
  evidence?: string
  fix?: string
}

// Raw AI output shape (one entry per item the model judged).
export interface ReportingCheckerResult {
  summary: string
  items: Array<{
    code: string
    status: ChecklistItemStatus
    evidence: string
    fix: string
  }>
}
```

In the `ReviewSession` interface (after the `journal_match_status?` line) add:

```ts
  reporting_check_status?: 'not_started' | 'running' | 'complete' | 'failed'
  reporting_guideline_id?: string
  reporting_summary?: string
```

And in the relations block of `ReviewSession` (alongside `journal_matches?`) add:

```ts
  reporting_checklist_items?: ReportingChecklistItem[]
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing state unchanged).

- [ ] **Step 3: Commit**

```bash
git add lib/types/index.ts
git commit -m "feat: reporting-checklist domain types"
```

---

## Task 2: Embedded guideline data

**Files:**
- Create: `lib/reporting/guidelines.ts`
- Test: `tests/reporting/guidelines.test.ts`

The four published guidelines must be transcribed from their **official sources** (do not invent wording). Model **one entry per top-level numbered checklist item**, merging any a/b sub-items into the `requirement` text. The generic list is authored in full below.

Official sources (fetch with WebFetch during this task and transcribe the requirement text):
- CONSORT 2010 (25 items): https://www.consort-statement.org/checklists/view/32-consort-2010/66-title
- PRISMA 2020 (27 items): https://www.prisma-statement.org/prisma-2020-checklist
- ARRIVE 2.0 Essential 10 (10 items): https://arriveguidelines.org/arrive-guidelines
- STROBE (22 items): https://www.strobe-statement.org/checklists/

- [ ] **Step 1: Write the failing test**

Create `tests/reporting/guidelines.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GUIDELINES, GUIDELINE_IDS } from '@/lib/reporting/guidelines'

const EXPECTED_COUNTS: Record<string, number> = {
  consort_2010: 25,
  prisma_2020: 27,
  arrive_2: 10,
  strobe: 22,
  generic: 8,
}

describe('GUIDELINES', () => {
  it('exposes exactly the five v1 guideline ids', () => {
    expect([...GUIDELINE_IDS].sort()).toEqual(
      ['arrive_2', 'consort_2010', 'generic', 'prisma_2020', 'strobe'].sort()
    )
  })

  it('every id in GUIDELINE_IDS has a guideline object with a matching id', () => {
    for (const id of GUIDELINE_IDS) {
      expect(GUIDELINES[id]).toBeDefined()
      expect(GUIDELINES[id].id).toBe(id)
    }
  })

  it('each guideline has the documented number of items', () => {
    for (const id of GUIDELINE_IDS) {
      expect(GUIDELINES[id].items.length).toBe(EXPECTED_COUNTS[id])
    }
  })

  it('item codes are unique within each guideline', () => {
    for (const id of GUIDELINE_IDS) {
      const codes = GUIDELINES[id].items.map(i => i.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('every item has a non-empty requirement and section', () => {
    for (const id of GUIDELINE_IDS) {
      for (const item of GUIDELINES[id].items) {
        expect(item.requirement.trim().length).toBeGreaterThan(0)
        expect(item.section.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reporting/guidelines.test.ts`
Expected: FAIL — cannot resolve `@/lib/reporting/guidelines`.

- [ ] **Step 3: Create the module scaffold + generic list**

Create `lib/reporting/guidelines.ts`:

```ts
export type ReportingGuidelineId =
  | 'consort_2010' | 'prisma_2020' | 'arrive_2' | 'strobe' | 'generic'

export interface ReportingGuidelineItem {
  code: string        // e.g. "1", "13"
  section: string     // e.g. "Title and abstract"
  requirement: string // the checklist item text
}

export interface ReportingGuideline {
  id: ReportingGuidelineId
  name: string
  version: string
  url: string
  applicableTo: string
  items: ReportingGuidelineItem[]
}

const GENERIC: ReportingGuideline = {
  id: 'generic',
  name: 'Reporting essentials',
  version: '1.0',
  url: '',
  applicableTo: 'Any manuscript with no study-type-specific reporting guideline',
  items: [
    { code: '1', section: 'Title and abstract', requirement: 'A structured abstract that states background, methods, results, and conclusions, and a title that identifies the study type.' },
    { code: '2', section: 'Title and abstract', requirement: 'Keywords appropriate for indexing and discovery.' },
    { code: '3', section: 'Funding', requirement: 'A funding statement naming sources of support (or stating that none were received).' },
    { code: '4', section: 'Ethics', requirement: 'A statement of ethics / institutional review board (IRB) approval, or an explanation of why approval was not required.' },
    { code: '5', section: 'Ethics', requirement: 'A statement that informed consent was obtained from participants where applicable.' },
    { code: '6', section: 'Declarations', requirement: 'A conflict-of-interest / competing-interests declaration for all authors.' },
    { code: '7', section: 'Declarations', requirement: 'A data-availability statement describing where the underlying data can be accessed.' },
    { code: '8', section: 'Declarations', requirement: 'An author-contributions statement describing each author’s role.' },
  ],
}

const CONSORT: ReportingGuideline = {
  id: 'consort_2010',
  name: 'CONSORT 2010',
  version: '2010',
  url: 'https://www.consort-statement.org/checklists/view/32-consort-2010/66-title',
  applicableTo: 'Randomized controlled trials',
  items: [
    // Transcribe the 25 top-level CONSORT 2010 items from the URL above.
    // Codes "1".."25"; merge a/b sub-items into the requirement text.
    // Sections follow the checklist: Title and abstract, Introduction, Methods,
    // Results, Discussion, Other information.
  ],
}

const PRISMA: ReportingGuideline = {
  id: 'prisma_2020',
  name: 'PRISMA 2020',
  version: '2020',
  url: 'https://www.prisma-statement.org/prisma-2020-checklist',
  applicableTo: 'Systematic reviews and meta-analyses',
  items: [
    // Transcribe the 27 top-level PRISMA 2020 items. Codes "1".."27";
    // merge sub-items (e.g. 10a/10b, 13a-f) into the requirement text.
  ],
}

const ARRIVE: ReportingGuideline = {
  id: 'arrive_2',
  name: 'ARRIVE 2.0 (Essential 10)',
  version: '2.0',
  url: 'https://arriveguidelines.org/arrive-guidelines',
  applicableTo: 'In vivo animal research',
  items: [
    // Transcribe the ARRIVE 2.0 "Essential 10" items. Codes "1".."10".
  ],
}

const STROBE: ReportingGuideline = {
  id: 'strobe',
  name: 'STROBE',
  version: '2007',
  url: 'https://www.strobe-statement.org/checklists/',
  applicableTo: 'Observational studies (cohort, case-control, cross-sectional)',
  items: [
    // Transcribe the 22 STROBE items (combined checklist). Codes "1".."22";
    // merge a/b/c/d/e sub-items into the requirement text.
  ],
}

export const GUIDELINES: Record<ReportingGuidelineId, ReportingGuideline> = {
  consort_2010: CONSORT,
  prisma_2020: PRISMA,
  arrive_2: ARRIVE,
  strobe: STROBE,
  generic: GENERIC,
}

export const GUIDELINE_IDS = Object.keys(GUIDELINES) as ReportingGuidelineId[]
```

- [ ] **Step 4: Populate the four published guidelines from their official sources**

Use WebFetch on each URL in the table above and transcribe one `ReportingGuidelineItem` per top-level numbered item into the corresponding `items: [...]` array. Use the official section headings for `section` and the canonical item numbers for `code`. Merge a/b sub-items into a single `requirement`. Do not paraphrase loosely or invent items — the count test pins completeness.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/reporting/guidelines.test.ts`
Expected: PASS (all five guidelines present, counts 25/27/10/22/8, unique codes, non-empty fields).

- [ ] **Step 6: Commit**

```bash
git add lib/reporting/guidelines.ts tests/reporting/guidelines.test.ts
git commit -m "feat: embedded reporting-guideline checklist data"
```

---

## Task 3: Deterministic guideline detection

**Files:**
- Create: `lib/reporting/detect.ts`
- Test: `tests/reporting/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reporting/detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectGuideline } from '@/lib/reporting/detect'

describe('detectGuideline', () => {
  it('routes systematic reviews to PRISMA', () => {
    expect(detectGuideline({ docType: 'systematic_review' }).id).toBe('prisma_2020')
  })

  it('routes RCTs to CONSORT via persona', () => {
    expect(detectGuideline({ persona: 'biomedical_rct' }).id).toBe('consort_2010')
  })

  it('routes RCTs to CONSORT via title/abstract phrasing', () => {
    expect(detectGuideline({ title: 'A randomised controlled trial of X' }).id).toBe('consort_2010')
    expect(detectGuideline({ abstract: 'We conducted an RCT.' }).id).toBe('consort_2010')
  })

  it('routes animal studies to ARRIVE', () => {
    expect(detectGuideline({ abstract: 'Experiments were performed in vivo using mice.' }).id).toBe('arrive_2')
  })

  it('routes observational studies to STROBE', () => {
    expect(detectGuideline({ abstract: 'A retrospective cohort study of 400 patients.' }).id).toBe('strobe')
  })

  it('falls back to generic when nothing matches', () => {
    const r = detectGuideline({ title: 'A theoretical note on category theory' })
    expect(r.id).toBe('generic')
    expect(r.rationale.length).toBeGreaterThan(0)
  })

  it('prefers systematic review over RCT phrasing when both could apply', () => {
    expect(detectGuideline({ docType: 'systematic_review', abstract: 'meta-analysis of RCTs' }).id).toBe('prisma_2020')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reporting/detect.test.ts`
Expected: FAIL — cannot resolve `@/lib/reporting/detect`.

- [ ] **Step 3: Implement `detectGuideline`**

Create `lib/reporting/detect.ts`:

```ts
import type { ReportingGuidelineId } from './guidelines'

export interface DetectInput {
  docType?: string
  persona?: string
  title?: string
  abstract?: string
}

export interface DetectResult {
  id: ReportingGuidelineId
  rationale: string
}

const RCT_RE = /randomi[sz]ed\s+controlled\s+trial|\bRCT\b/i
const ANIMAL_RE = /\b(mice|mouse|rats?|in vivo|animal model|murine|zebrafish)\b/i
const OBSERVATIONAL_RE = /\b(cohort|case[-\s]control|cross[-\s]sectional|observational)\b/i

// First match wins. Pure and deterministic — no model call.
export function detectGuideline(input: DetectInput): DetectResult {
  const text = `${input.title ?? ''} ${input.abstract ?? ''}`

  if (input.docType === 'systematic_review') {
    return { id: 'prisma_2020', rationale: 'Document type is a systematic review.' }
  }
  if (input.persona === 'biomedical_rct' || RCT_RE.test(text)) {
    return { id: 'consort_2010', rationale: 'The manuscript appears to report a randomized controlled trial.' }
  }
  if (ANIMAL_RE.test(text)) {
    return { id: 'arrive_2', rationale: 'The manuscript appears to describe in vivo animal research.' }
  }
  if (OBSERVATIONAL_RE.test(text)) {
    return { id: 'strobe', rationale: 'The manuscript appears to report an observational study.' }
  }
  return { id: 'generic', rationale: 'No study-type-specific guideline matched; using general reporting essentials.' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/reporting/detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reporting/detect.ts tests/reporting/detect.test.ts
git commit -m "feat: deterministic reporting-guideline detection"
```

---

## Task 4: Completeness helper

**Files:**
- Create: `lib/reporting/completeness.ts`
- Test: `tests/reporting/completeness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reporting/completeness.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCompleteness } from '@/lib/reporting/completeness'
import type { ChecklistItemStatus } from '@/lib/types'

const s = (statuses: ChecklistItemStatus[]) => statuses.map(status => ({ status }))

describe('computeCompleteness', () => {
  it('returns 1 when every applicable item is present', () => {
    expect(computeCompleteness(s(['present', 'present']))).toBe(1)
  })

  it('counts partial as half', () => {
    expect(computeCompleteness(s(['present', 'partial']))).toBe(0.75)
  })

  it('counts missing as zero', () => {
    expect(computeCompleteness(s(['present', 'missing']))).toBe(0.5)
  })

  it('excludes not_applicable items from the denominator', () => {
    expect(computeCompleteness(s(['present', 'not_applicable']))).toBe(1)
  })

  it('returns 0 for an empty or all-N/A list (no divide-by-zero)', () => {
    expect(computeCompleteness([])).toBe(0)
    expect(computeCompleteness(s(['not_applicable']))).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reporting/completeness.test.ts`
Expected: FAIL — cannot resolve `@/lib/reporting/completeness`.

- [ ] **Step 3: Implement `computeCompleteness`**

Create `lib/reporting/completeness.ts`:

```ts
import type { ChecklistItemStatus } from '@/lib/types'

// (present + 0.5*partial) / (total - not_applicable), in [0,1]. 0 when no applicable items.
export function computeCompleteness(items: Array<{ status: ChecklistItemStatus }>): number {
  const applicable = items.filter(i => i.status !== 'not_applicable')
  if (applicable.length === 0) return 0
  const earned = applicable.reduce((sum, i) => sum + (i.status === 'present' ? 1 : i.status === 'partial' ? 0.5 : 0), 0)
  return earned / applicable.length
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/reporting/completeness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reporting/completeness.ts tests/reporting/completeness.test.ts
git commit -m "feat: reporting-checklist completeness helper"
```

---

## Task 5: Prompt module

**Files:**
- Create: `lib/ai/prompts/reportingChecker.ts`
- Test: `tests/ai/reportingChecker.test.ts`

- [ ] **Step 1: Write the failing test (pure context builder only)**

Create `tests/ai/reportingChecker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildReportingContext } from '@/lib/ai/prompts/reportingChecker'
import { GUIDELINES } from '@/lib/reporting/guidelines'

describe('buildReportingContext', () => {
  it('includes the guideline name and every item code', () => {
    const guideline = GUIDELINES.generic
    const ctx = buildReportingContext({ manuscriptText: 'My paper body.', guideline })
    expect(ctx).toContain(guideline.name)
    for (const item of guideline.items) {
      expect(ctx).toContain(item.code)
    }
  })

  it('includes the manuscript text', () => {
    const ctx = buildReportingContext({ manuscriptText: 'UNIQ_BODY_MARKER', guideline: GUIDELINES.generic })
    expect(ctx).toContain('UNIQ_BODY_MARKER')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/reportingChecker.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/prompts/reportingChecker`.

- [ ] **Step 3: Implement the prompt module**

Create `lib/ai/prompts/reportingChecker.ts`:

```ts
import { anthropic, MODEL, MAX_TOKENS } from '../anthropic'
import { extractJson } from '../json'
import type { ReportingGuideline } from '@/lib/reporting/guidelines'
import type { ReportingCheckerResult } from '@/lib/types'

const SYSTEM_PROMPT = `You are an expert journal editor checking whether a manuscript satisfies a specific reporting-guideline checklist.

You will be given the manuscript text and a numbered checklist. For EVERY checklist item, decide one status:
- "present": the manuscript clearly and fully addresses the item.
- "partial": the item is addressed but incompletely or ambiguously.
- "missing": the item is not addressed.
- "not_applicable": the item does not apply to this study (use sparingly, only when clearly inapplicable).

For each item provide brief "evidence" (a short quote or the section where it is addressed; empty string if missing) and a concrete "fix" (what the author should add or change; empty string if already present).

Return ONLY valid JSON matching this exact shape:
{
  "summary": string,                 // 1-2 sentences on overall reporting completeness
  "items": [
    {
      "code": string,                // must match a checklist item code exactly
      "status": "present" | "partial" | "missing" | "not_applicable",
      "evidence": string,
      "fix": string
    }
  ]
}

Include one entry for every checklist item. Do not invent items beyond the checklist.`

export interface ReportingCheckParams {
  manuscriptText: string
  guideline: ReportingGuideline
}

/** Pure, testable: assembles the user prompt from the manuscript + canonical items. */
export function buildReportingContext(p: ReportingCheckParams): string {
  const items = p.guideline.items
    .map(i => `- [${i.code}] (${i.section}) ${i.requirement}`)
    .join('\n')
  return [
    `Reporting guideline: ${p.guideline.name}`,
    `Applies to: ${p.guideline.applicableTo}`,
    '',
    'Checklist items:',
    items,
    '',
    'Manuscript text:',
    p.manuscriptText,
  ].join('\n')
}

export async function runReportingChecker(
  params: ReportingCheckParams
): Promise<ReportingCheckerResult> {
  const userPrompt = buildReportingContext(params)

  const call = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return extractJson<ReportingCheckerResult>(text)
  }
  try {
    return await call()
  } catch {
    return await call() // one retry on malformed JSON
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ai/reportingChecker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts/reportingChecker.ts tests/ai/reportingChecker.test.ts
git commit -m "feat: reporting-checker prompt module"
```

---

## Task 6: Database migration

**Files:**
- Create: `supabase/migrations/005_reporting_check.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_reporting_check.sql`:

```sql
-- On-demand reporting-guideline checklist (mirrors 003_journal_match_status).
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

- [ ] **Step 2: Apply the migration to Supabase**

Run the SQL in the Supabase SQL editor (or via the project's migration workflow). Confirm `reporting_checklist_items` exists and `review_sessions` has the three new columns.

> Note: the project exposes the `public` schema to PostgREST; if a `PGRST205` "table not found" error appears after the app queries the new table, reload the PostgREST schema cache (Supabase: Settings → API → "Reload schema", or `notify pgrst, 'reload schema';`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_reporting_check.sql
git commit -m "feat: reporting-check schema (migration 005)"
```

---

## Task 7: Pipeline

**Files:**
- Create: `lib/ai/reportingCheckPipeline.ts`

- [ ] **Step 1: Implement the pipeline**

Create `lib/ai/reportingCheckPipeline.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { runReportingChecker } from './prompts/reportingChecker'
import { GUIDELINES, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
import type { ChecklistItemStatus } from '@/lib/types'

export async function runReportingCheckPipeline(sessionId: string) {
  const supabase = createAdminClient()

  try {
    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'running' })
      .eq('id', sessionId)

    const { data: session, error } = await supabase
      .from('review_sessions')
      .select('*, drafts(*, manuscripts(*))')
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')

    const guidelineId = session.reporting_guideline_id as ReportingGuidelineId | null
    const guideline = guidelineId ? GUIDELINES[guidelineId] : undefined
    if (!guideline) throw new Error('No guideline selected for this session')

    const draft = session.drafts as unknown as { parsed_text?: string }
    const manuscriptText = draft.parsed_text || ''

    const result = await runReportingChecker({ manuscriptText, guideline })

    // Build verdict lookup from the model, then iterate the CANONICAL items so the
    // row set is always complete even if the model omits one (default: missing).
    const byCode = new Map(result.items.map(i => [i.code, i]))
    const rows = guideline.items.map(item => {
      const verdict = byCode.get(item.code)
      const status = (verdict?.status ?? 'missing') as ChecklistItemStatus
      return {
        session_id: sessionId,
        guideline_id: guideline.id,
        item_code: item.code,
        section: item.section,
        requirement: item.requirement,
        status,
        evidence: verdict?.evidence ?? '',
        fix: verdict?.fix ?? '',
      }
    })
    if (rows.length > 0) {
      await supabase.from('reporting_checklist_items').insert(rows)
    }

    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'complete', reporting_summary: result.summary })
      .eq('id', sessionId)
  } catch (err: unknown) {
    await supabase
      .from('review_sessions')
      .update({ reporting_check_status: 'failed' })
      .eq('id', sessionId)
    throw err
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/reportingCheckPipeline.ts
git commit -m "feat: reporting-check pipeline"
```

---

## Task 8: Start route

**Files:**
- Create: `app/api/review/reporting/start/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/review/reporting/start/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runReportingCheckPipeline } from '@/lib/ai/reportingCheckPipeline'
import { GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, guidelineId } = await request.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  if (!GUIDELINE_IDS.includes(guidelineId as ReportingGuidelineId)) {
    return NextResponse.json({ error: 'Unknown guidelineId' }, { status: 400 })
  }

  // RLS: this select only returns the row if the session belongs to the user.
  const { data: session, error } = await supabase
    .from('review_sessions')
    .select('id, status, reporting_check_status')
    .eq('id', sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.status !== 'complete') {
    return NextResponse.json({ error: 'Standard review is not complete yet' }, { status: 409 })
  }
  if (session.reporting_check_status === 'running' || session.reporting_check_status === 'complete') {
    return NextResponse.json({ error: 'Reporting check already running or complete' }, { status: 409 })
  }

  // Persist the chosen guideline so the pipeline (service-role, no body) can read it.
  await supabase
    .from('review_sessions')
    .update({ reporting_guideline_id: guidelineId })
    .eq('id', sessionId)

  const pipeline = runReportingCheckPipeline(sessionId)
  pipeline.catch((e) => console.error('[reporting check pipeline] failed:', e))
  try {
    waitUntil(pipeline)
  } catch {
    // Non-Vercel runtime: the floating promise above continues on its own.
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/review/reporting/start/route.ts
git commit -m "feat: reporting-check start route"
```

---

## Task 9: Widen the status route

**Files:**
- Modify: `app/api/review/status/[sessionId]/route.ts`

- [ ] **Step 1: Add the new relation and manuscript fields to the select**

In `app/api/review/status/[sessionId]/route.ts`, replace the `.select(...)` template so it reads:

```ts
    .select(`
      *,
      scores(*),
      annotations(*),
      journal_matches(*),
      adversarial_critiques(*),
      reporting_checklist_items(*),
      drafts(manuscripts(field, subfield, doc_type, title, abstract))
    `)
```

(Adds `reporting_checklist_items(*)` and widens the manuscript sub-select with `title, abstract` so the dashboard can run `detectGuideline()` client-side.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/review/status/[sessionId]/route.ts"
git commit -m "feat: include reporting items + manuscript title/abstract in status"
```

---

## Task 10: Results component

**Files:**
- Create: `components/review/ReportingChecklist.tsx`

- [ ] **Step 1: Implement the component**

Create `components/review/ReportingChecklist.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { computeCompleteness } from '@/lib/reporting/completeness'
import type { ReportingChecklistItem, ChecklistItemStatus } from '@/lib/types'

const STATUS_COLOR: Record<ChecklistItemStatus, string> = {
  present: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  missing: 'bg-red-100 text-red-800',
  not_applicable: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<ChecklistItemStatus, string> = {
  present: 'Present',
  partial: 'Partial',
  missing: 'Missing',
  not_applicable: 'N/A',
}

export function ReportingChecklist({
  items,
  guidelineName,
}: {
  items: ReportingChecklistItem[]
  guidelineName?: string
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No checklist results yet.</p>
  }

  const applicable = items.filter(i => i.status !== 'not_applicable')
  const present = items.filter(i => i.status === 'present').length
  const pct = Math.round(computeCompleteness(items) * 100)

  // Group by section, preserving first-seen order.
  const sections: { name: string; items: ReportingChecklistItem[] }[] = []
  for (const item of items) {
    const name = item.section ?? 'Other'
    let group = sections.find(s => s.name === name)
    if (!group) { group = { name, items: [] }; sections.push(group) }
    group.items.push(item)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {guidelineName && <span className="font-medium">{guidelineName}</span>}
        <span className="text-sm text-muted-foreground">
          {present} / {applicable.length} satisfied · {pct}% complete
        </span>
      </div>

      {sections.map(section => (
        <div key={section.name}>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{section.name}</h4>
          <div className="space-y-2">
            {section.items.map(item => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">#{item.item_code}</span>
                    {item.requirement && <p className="text-sm">{item.requirement}</p>}
                  </div>
                  <Badge className={STATUS_COLOR[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                </div>
                {item.evidence && (
                  <p className="mt-1 text-xs text-muted-foreground">Evidence: {item.evidence}</p>
                )}
                {item.fix && item.status !== 'present' && (
                  <p className="mt-1 text-sm text-amber-700">Fix: {item.fix}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/review/ReportingChecklist.tsx
git commit -m "feat: ReportingChecklist results component"
```

---

## Task 11: Dashboard tab + trigger + poll

**Files:**
- Modify: `components/review/ReviewDashboard.tsx`

- [ ] **Step 1: Add imports**

After the existing review-component imports (near `import { ProgressComparator } ...`) add:

```tsx
import { ReportingChecklist } from './ReportingChecklist'
import { detectGuideline } from '@/lib/reporting/detect'
import { GUIDELINES, GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
```

- [ ] **Step 2: Add component state**

After the `const [startingJournals, setStartingJournals] = useState(false)` line add:

```tsx
  const [startingReporting, setStartingReporting] = useState(false)
  const [selectedGuideline, setSelectedGuideline] = useState<ReportingGuidelineId | null>(null)
```

- [ ] **Step 3: Extend the poll-loop continuation check**

In `poll()`, where `jmRunning` is computed, add a sibling line and include it in the condition:

```tsx
    const jmRunning = !!next && next.journal_match_status === 'running'
    const rcRunning = !!next && next.reporting_check_status === 'running'
    if (mainPending || advRunning || jmRunning || rcRunning) {
      timerRef.current = setTimeout(poll, 3000)
    }
```

- [ ] **Step 4: Add the `startReporting` handler**

After the `startJournals` function add:

```tsx
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
```

- [ ] **Step 5: Compute the reporting state + detected guideline (after `const jm = ...`)**

```tsx
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
```

- [ ] **Step 6: Add the tab trigger**

In `<TabsList>`, after the `journals` trigger add:

```tsx
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
```

- [ ] **Step 7: Add the tab content (after the `journals` `<TabsContent>` block)**

```tsx
        <TabsContent value="reporting" className="space-y-4 pt-4">
          {rc === 'not_started' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Check this manuscript against a reporting-guideline checklist. Detected:{' '}
                {detected.rationale}
              </p>
              <select
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
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add components/review/ReviewDashboard.tsx
git commit -m "feat: Reporting tab in the review dashboard"
```

---

## Task 12: Export sheet

**Files:**
- Modify: `lib/exporters/reviewMatrix.ts`
- Test: `tests/exporters/reviewMatrix.test.ts`

- [ ] **Step 1: Update the test for the 5th sheet**

In `tests/exporters/reviewMatrix.test.ts`, add a `reporting_checklist_items` array to `sampleSession()` (inside the returned object):

```ts
    reporting_checklist_items: [
      { id: 'r1', session_id: 's1', guideline_id: 'consort_2010', item_code: '1', section: 'Title and abstract', requirement: 'Identification as a randomised trial in the title', status: 'present', evidence: 'title says RCT', fix: '' },
    ],
```

Update the "four expected sheets" test to expect five:

```ts
  it('produces a workbook with the five expected sheets', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames).toEqual([
      'Score Summary',
      'Response Matrix',
      'Adversarial Review',
      'Journal Targets',
      'Reporting Checklist',
    ])
  })
```

Add a content test:

```ts
  it('writes checklist items into the Reporting Checklist sheet', () => {
    const buf = generateReviewMatrix(sampleSession(), 'My Paper')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Reporting Checklist'], { header: 1 })
    const flat = rows.flat().join(' ')
    expect(flat).toContain('Identification as a randomised trial in the title')
  })
```

Update the "does not throw when empty" test to also clear the new array:

```ts
    const empty: ReviewSession = { ...sampleSession(), scores: [], annotations: [], adversarial_critiques: [], journal_matches: [], reporting_checklist_items: [] }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/exporters/reviewMatrix.test.ts`
Expected: FAIL — only four sheets, "Reporting Checklist" missing.

- [ ] **Step 3: Add the sheet to the exporter**

In `lib/exporters/reviewMatrix.ts`, after the "Sheet 4 — Journal targets" block (before `return XLSX.write(...)`) add:

```ts
  // Sheet 5 — Reporting checklist
  const reportingData: Cell[][] = [
    ['Code', 'Section', 'Requirement', 'Status', 'Evidence', 'Fix'],
    ...(session.reporting_checklist_items ?? []).map((r): Cell[] => [
      r.item_code,
      r.section ?? '',
      r.requirement ?? '',
      r.status,
      r.evidence ?? '',
      r.fix ?? '',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportingData), 'Reporting Checklist')
```

Also update the JSDoc sheet list above the function to mention the 5th sheet.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/exporters/reviewMatrix.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/exporters/reviewMatrix.ts tests/exporters/reviewMatrix.test.ts
git commit -m "feat: reporting checklist sheet in xlsx export"
```

---

## Task 13: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass (existing + the new `reporting/*`, `ai/reportingChecker`, and updated `exporters/reviewMatrix`).

- [ ] **Step 2: Run the production build (the project's commit gate)**

Run: `npm run build`
Expected: compiles with exit 0; the route list includes `/api/review/reporting/start`.

- [ ] **Step 3: Manual smoke (optional but recommended)**

With a completed review open in the dashboard: open the **Reporting** tab, confirm the detected guideline is preselected, change it via the dropdown, click **Run compliance check**, confirm it transitions running → complete and renders grouped items with a completeness figure, then download the `.xlsx` and confirm the **Reporting Checklist** sheet is populated.

- [ ] **Step 4: Final commit (if any build-fix changes were needed)**

```bash
git add -A
git commit -m "chore: reporting-guideline checklist verification fixes"
```
