# PeerReady — Review-Page Vertical-Nav Layout (Phase 4) Design

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan
**Source:** `peerready-v2-upgrade-prompt.md` UPGRADE 3 (vertical section nav) + UPGRADE 5 (layout assembly), adapted to the codebase (spec shipped inline styles + a different data model). Final slice of the design-system cycle.

## Context

The completed review currently renders in `components/review/ReviewDashboard.tsx` — a ~370-line
client component that owns: the status poll loop, three on-demand start handlers
(adversarial/journals/reporting) with optimistic updates, four lifecycle branches
(loading / failed / awaiting_confirmation / processing), and a completed view built on shadcn
`Tabs` with five tab panels (Overview, Adversarial, Journals, Reporting, Progress), each carrying
its own not-started/running/complete/failed sub-states. Phase 2 added a `ReviewStages` tracker +
"Review N" label; Phase 3 rebranded everything via tokens.

This cycle replaces the **horizontal tabs with a two-column vertical-nav layout** and uses the
restructure as the moment to **decompose** the oversized file. No data model, pipeline, route, or
panel-internal changes.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Structure | **Decompose**: extract each section into its own component + a `VerticalSectionNav`; `ReviewDashboard` stays the orchestrator (data layer) |
| Sections in nav | Overview, Adversarial, Journals, Reporting, always; **Progress only when `score_delta` exists** |
| Left rail | `ReviewStages` (review-stage tracker, Phase 2) above the `VerticalSectionNav` |
| On-demand start logic | Stays centralized in `ReviewDashboard`; passed to sections as `onStart`/`status`/`starting` props (polling stays in one place) |
| Topbar | Review N pill · verdict · score · PDF report · .xlsx · **Upload revision** (links to `/manuscripts/[id]`) |
| Non-complete states | Unchanged behavior; swap the two hardcoded `text-red-600` for `text-destructive` (dark-mode correctness) |
| Responsive | Left rail stacks above content on small screens (`flex-col` → `md:flex-row`) |

## Architecture

`ReviewDashboard` keeps everything stateful and data-related; presentation moves into small,
focused components it composes. A pure helper owns the canonical section list.

### New files
- **`lib/review/sections.ts`** — `export type SectionId = 'overview' | 'adversarial' | 'journals' | 'reporting' | 'progress'`
  and `reviewSectionIds(hasProgress: boolean): SectionId[]` →
  `['overview','adversarial','journals','reporting', ...(hasProgress ? ['progress'] : [])]`.
  Single source of truth for which sections exist (unit-tested).
- **`components/review/VerticalSectionNav.tsx`** — props `{ active: SectionId; onSelect: (id: SectionId) => void; hasProgress: boolean }`.
  Renders nav rows (label + teal active accent/left bar via brand tokens); Progress row only when
  `hasProgress`.
- **`components/review/ReviewTopBar.tsx`** — props
  `{ reviewNumber: number; verdict?: string; score: number; sessionId: string; manuscriptId: string; onOpenPdf: () => void }`.
  Review N pill, verdict badge, `score / 80`, **PDF report** button (`onOpenPdf`), **.xlsx**
  (`<a href="/api/export/[sessionId]" download>`), **Upload revision** (`<Link href="/manuscripts/[manuscriptId]">`).
- **`components/review/sections/OverviewSection.tsx`** — `{ session }`: strengths/weaknesses +
  `ScoreRadar` + `ScoreList` + `AnnotationPanel`.
- **`components/review/sections/AdversarialSection.tsx`** — `{ session, status, starting, onStart }`:
  not-started/running/complete/failed + `AdversarialPanel`.
- **`components/review/sections/JournalsSection.tsx`** — `{ session, status, starting, onStart }`.
- **`components/review/sections/ReportingSection.tsx`** — `{ session, status, starting, onStart }`;
  owns its own guideline `select` state + `detectGuideline(...)` (moved out of ReviewDashboard);
  calls `onStart(guidelineId)`.
- **`components/review/sections/ProgressSection.tsx`** — `{ session }`: thin wrapper over
  `ProgressComparator delta={session.score_delta}`.

### Modified
- **`components/review/ReviewDashboard.tsx`** — unchanged: poll loop, `applySession`, the three
  start handlers, `showPdf`, and the loading/failed/awaiting/processing branches. New: `activeSection`
  state (default `'overview'`). Completed view becomes:
  ```
  <div className="flex flex-col gap-4 md:flex-row">
    <div className="md:w-52 shrink-0 space-y-4">
      <ReviewStages … />
      <VerticalSectionNav active onSelect hasProgress={!!session.score_delta} />
    </div>
    <div className="flex-1 min-w-0 space-y-4">
      <ReviewTopBar … onOpenPdf={() => setShowPdf(true)} />
      {activeSection === 'overview'    && <OverviewSection session={session} />}
      {activeSection === 'adversarial' && <AdversarialSection session onStart=startAdversarial status starting />}
      {activeSection === 'journals'    && <JournalsSection … />}
      {activeSection === 'reporting'   && <ReportingSection … />}
      {activeSection === 'progress' && session.score_delta && <ProgressSection session={session} />}
    </div>
  </div>
  {showPdf && <PdfReportModal … />}
  ```
  The guideline-selection state moves into `ReportingSection`; `ReviewDashboard` keeps only
  `startReporting(guidelineId)`.

## Data flow / error handling
No change to data flow: `ReviewDashboard` polls `/api/review/status`, drives optimistic `running`
states, and reconciles. On-demand sections render run/retry UI but delegate the start to the passed
handler, so the poll loop stays single-sourced. `activeSection` defaults to `'overview'`; the
Progress row/panel render only when `session.score_delta` is present. Failed lifecycle + per-section
failed states preserved.

## Testing
- Unit (`tests/reviewSections.test.ts`): `reviewSectionIds(true)` includes `'progress'`;
  `reviewSectionIds(false)` does not; order is stable.
- `npm run build` gates every commit (house rule; `npm test` is lenient).
- Manual: completed review renders the two-column layout; each section selectable from the nav;
  on-demand passes (adversarial/journals/reporting) still start, poll, and show results; Progress
  appears only with a prior review; PDF modal opens; Upload revision navigates to the manuscript
  page; both dark and light themes legible; left rail stacks on a narrow viewport.

## Out of scope
- AI pipeline, on-demand routes, and the section panels' internals — untouched.
- Any new data, columns, or endpoints.
- Restyling the loading/awaiting/processing screens beyond the `text-destructive` fix.

## Notes
- `.superpowers/` is already gitignored (Phase 3). Stop the visual-companion server when wrapping.
