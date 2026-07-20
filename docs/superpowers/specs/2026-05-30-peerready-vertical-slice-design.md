# ScholarLens — Vertical Slice Design

**Date:** 2026-05-30
**Status:** Approved (scope + architecture)
**Scope of this spec:** First end-to-end review path ("one real review, end to end"). Later passes layer the remaining features.

---

## 1. Purpose

ScholarLens is an AI peer review platform for academic researchers. A researcher uploads a
manuscript (PDF/DOCX); the system parses it, runs it through a Claude review pipeline, and
returns scored rubric dimensions, a verdict, and inline annotations. Later versions add
adversarial critique, journal matching, progress comparison across drafts, and XLSX export.

This spec defines **only the vertical slice**: the minimum complete path that proves the whole
architecture works and is verifiable locally against real Supabase + Anthropic.

**Target user:** PhD candidates / early-career researchers submitting to journals for the first time.

---

## 2. Slice goal (definition of done)

A logged-in user can:

1. Sign up / log in (email + password).
2. Create a manuscript record and upload a draft (`.pdf` or `.docx`).
3. The file is stored in Supabase Storage, parsed to text + sections, and saved as a `draft`.
4. Start a review. A pipeline runs **discipline routing → deep review**, persisting scores,
   annotations, verdict, and strength/weakness summaries.
5. The review dashboard polls status, shows a step progress indicator, and on completion
   renders the **Overview tab**: verdict badge, overall score / 80, the 8 scored dimensions with
   rationale, and annotations grouped by severity.

**Verified** by running it locally end-to-end with real credentials and observing a real review.

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui (`button card badge progress tabs separator`) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password in slice; Google OAuth deferred) |
| File storage | Supabase Storage (`manuscripts` bucket, private) |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| PDF parsing | `pdf-parse` (imported via `pdf-parse/lib/pdf-parse.js`) |
| DOCX parsing | `mammoth` |
| Background work | `waitUntil` from `@vercel/functions` |
| Deployment | Vercel (target; slice verified locally) |

---

## 4. Architecture

### 4.1 Components and boundaries

- **Auth pages** (`app/(auth)/login`, `signup`) — Supabase email/password. Server actions or
  client calls to Supabase Auth. Redirect to `/dashboard` on success.
- **Middleware** (`middleware.ts`) — refreshes the Supabase session and redirects unauthenticated
  users away from protected routes. As written in the source prompt.
- **Supabase clients** (`lib/supabase/`):
  - `client.ts` — browser client (cookie/anon).
  - `server.ts` — server client bound to request cookies (RLS as the user). Used by all
    **user-facing** API routes.
  - `admin.ts` (**new, server-only**) — service-role client. Imported **only** by the pipeline.
    Never imported into any client component or browser bundle.
- **Parsers** (`lib/parsers/`) — pure functions `Buffer -> ParsedDocument`. No I/O beyond parsing.
- **AI prompt modules** (`lib/ai/prompts/`) — each is one function: input → Claude call → typed
  JSON result. Slice uses `disciplineRouter` and `deepReviewer`. JSON parsing wrapped in
  try/catch with one retry.
- **Pipeline** (`lib/ai/pipeline.ts`) — orchestrates the stages, updates `status` as it goes,
  persists results, marks `complete`/`failed`. Uses the **service-role** client.
- **API routes** (`app/api/`):
  - `upload/route.ts` — auth-gated; stores file, parses, inserts draft, updates manuscript word count.
  - `review/start/route.ts` — auth-gated; creates session, kicks off pipeline via `waitUntil`.
  - `review/status/[sessionId]/route.ts` — auth-gated; returns session + nested results for polling.
  - `manuscripts/route.ts` + `manuscripts/[id]/route.ts` — CRUD for manuscript records.
- **UI** (`components/`) — `UploadDropzone`, `ReviewDashboard` (Overview tab), supporting cards.

### 4.2 Data flow (happy path)

```
signup ─▶ profiles row auto-created (trigger)
create manuscript ─▶ manuscripts row
UploadDropzone ─▶ POST /api/upload
                    ├─ store file in Storage (userId/manuscriptId/vN_name)
                    ├─ parse (pdf|docx) ─▶ text + sections + word_count + abstract
                    └─ insert draft, update manuscript
                 ─▶ POST /api/review/start
                    ├─ insert review_session (status=queued)
                    ├─ waitUntil(runReviewPipeline(sessionId))   ◀── detached, service role
                    └─ return { sessionId }
                 ─▶ redirect /manuscripts/[id]/review/[sessionId]

ReviewDashboard polls GET /api/review/status/[sessionId] every 3s
runReviewPipeline:
   status=routing   ─▶ disciplineRouter(title, abstract) ─▶ update manuscript field/subfield/doc_type, session persona
   status=reviewing ─▶ deepReviewer(text, persona, field, target)
                       ├─ insert scores (8 rows)
                       ├─ insert annotations
                       └─ update session: overall_score, verdict, summaries
   status=complete  ─▶ completed_at set
   (any throw)      ─▶ status=failed, error_message set
```

### 4.3 Database

Apply the full source-prompt migration verbatim as `supabase/migrations/001_initial_schema.sql`
(all 8 tables, RLS policies, storage bucket + policy, `handle_new_user` trigger). The slice only
*writes* to `profiles`, `manuscripts`, `drafts`, `review_sessions`, `scores`, `annotations`, but
creating the full schema now avoids a second migration later.

---

## 5. Architectural corrections to the source prompt

These deviate from the source build prompt deliberately. They are bug fixes, not redesigns.

1. **Background trigger uses `waitUntil`, not a fire-and-forget fetch.**
   The source has `/api/review/start` call `fetch('/api/review/run')` without awaiting. On
   serverless, the runtime can terminate the un-awaited request once the response is sent, so the
   pipeline may never run. Replace with `waitUntil(runReviewPipeline(sessionId))` directly inside
   `start`. **`app/api/review/run/route.ts` is removed from the plan.**

2. **Pipeline uses the service-role client.**
   Because the pipeline runs detached from the HTTP request, it carries no user session cookie.
   The source's cookie-based `createClient()` would have every insert blocked by the project's own
   RLS policies. The pipeline uses a server-only service-role client (`lib/supabase/admin.ts`).
   This honors Critical Note #4 (service role never reaches the client) while letting the pipeline
   write. All user-facing routes keep the cookie client so RLS still governs user access.

3. **`pdf-parse` import path.**
   Import `pdf-parse/lib/pdf-parse.js`, not the package root, to avoid the package's top-level
   debug code that throws when no test file is present.

4. **Missing endpoints referenced by the source are out of slice scope** (e.g.
   `PATCH /api/annotations/[id]/resolve`, journal/adversarial/progress UIs). Deferred — see §7.

---

## 6. Error handling

- **AI JSON parsing:** every `JSON.parse` of a model response is wrapped in try/catch and retried
  once (one extra Claude call) before failing the stage.
- **Pipeline failure:** any thrown error sets `review_sessions.status = 'failed'` and
  `error_message`; the dashboard renders a failure state and stops polling.
- **Upload validation:** reject non-`.pdf`/`.docx`; enforce a 10 MB size cap; return 400 on
  missing `file`/`manuscriptId`; 401 when unauthenticated.
- **Manuscript text truncation:** slice text to 80,000 chars before sending to Claude (chunking is
  a later concern).

---

## 7. Explicitly out of scope (deferred passes)

Adversarial stage + `AdversarialPanel`; journal matcher + `JournalMatchList`; progress comparator +
`ProgressComparator`; XLSX export route + `reviewMatrix`; Google OAuth; settings page; the
`confidence < 0.7` "confirm your field" step; rate limiting (one active session per user). The DB
schema and types for these are created now so later passes are additive.

---

## 8. Testing / verification

- **Parsers:** unit-test `parsePDF` / `parseDOCX` against a small fixture PDF and DOCX, asserting
  non-empty `full_text`, plausible `word_count`, and section extraction.
- **End-to-end (manual, real credentials):** sign up → create manuscript → upload a sample paper →
  start review → observe status transitions → confirm Overview renders 8 scores, a verdict, and
  annotations. This is the slice's definition of done.
- **RLS sanity:** confirm a second user cannot read the first user's session via the status route.

---

## 9. Environment

`.env.local.example` (and a real `.env.local` the user fills in):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
