# PeerReady Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end PeerReady path — a user uploads a manuscript, it is parsed and stored, a Claude pipeline (discipline routing → deep review) scores it, and the dashboard shows verdict, scores, and annotations — verified locally against real Supabase + Anthropic.

**Architecture:** Next.js 14 App Router. User-facing API routes use the cookie-bound Supabase server client so RLS applies. The review pipeline runs detached via `waitUntil` and uses a server-only service-role client to persist results. Parsers and AI prompt modules are pure, independently testable units.

**Tech Stack:** Next.js 14, TypeScript, Tailwind + shadcn/ui, Supabase (Postgres/Auth/Storage), Anthropic SDK (`claude-sonnet-4-20250514`), `pdf-parse`, `mammoth`, `@vercel/functions`, Vitest.

**Working directory:** `C:\Users\emm24\dev\Claude\peerready` (git already initialized, `main` branch).

---

## File Structure

```
peerready/
  app/
    layout.tsx                                  root layout
    globals.css
    (auth)/login/page.tsx                        email/password login
    (auth)/signup/page.tsx                        email/password signup
    (dashboard)/layout.tsx                        sidebar + topbar shell, auth guard
    (dashboard)/dashboard/page.tsx                landing after login
    (dashboard)/manuscripts/page.tsx              manuscript list
    (dashboard)/manuscripts/new/page.tsx          create + upload flow
    (dashboard)/manuscripts/[id]/page.tsx         manuscript detail (drafts list)
    (dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx  review page
    api/manuscripts/route.ts                      POST create / GET list
    api/manuscripts/[id]/route.ts                 GET one / DELETE
    api/upload/route.ts                           store + parse + insert draft
    api/review/start/route.ts                     create session + waitUntil(pipeline)
    api/review/status/[sessionId]/route.ts        poll status + nested results
  components/
    ui/                                           shadcn components
    manuscripts/UploadDropzone.tsx
    manuscripts/ManuscriptCard.tsx
    manuscripts/ManuscriptList.tsx
    review/ReviewDashboard.tsx
    review/ScoreList.tsx
    review/AnnotationPanel.tsx
    layout/Sidebar.tsx
    layout/TopBar.tsx
  lib/
    supabase/client.ts                            browser client
    supabase/server.ts                            cookie server client (RLS as user)
    supabase/admin.ts                             service-role client (server-only, pipeline)
    ai/anthropic.ts                               SDK instance + constants
    ai/prompts/disciplineRouter.ts
    ai/prompts/deepReviewer.ts
    ai/json.ts                                    safe parse-with-retry helper
    ai/pipeline.ts                                router -> deepReviewer orchestration
    parsers/pdfParser.ts
    parsers/docxParser.ts
    types/index.ts
  supabase/migrations/001_initial_schema.sql
  middleware.ts
  next.config.js
  vercel.json
  tailwind.config.ts
  .env.local.example
  vitest.config.ts
  tests/fixtures/                                 sample.pdf, sample.docx
```

---

## Task 1: Scaffold Next.js 14 project

**Files:**
- Create: project files via `create-next-app`
- Modify: `package.json` (deps)

- [ ] **Step 1: Scaffold into the existing directory**

The directory already exists with `docs/` and `.git`. Scaffold in place.

Run:
```bash
cd "C:/Users/emm24/dev/Claude/peerready"
npx create-next-app@14 . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
```
Expected: prompts to proceed in a non-empty dir → yes. Creates `app/`, `next.config.mjs` (we replace with `.js`), `tsconfig.json`, `tailwind.config.ts`, `package.json`.

- [ ] **Step 2: Install runtime + dev dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk pdf-parse mammoth xlsx lucide-react @vercel/functions
npm install -D @types/pdf-parse vitest @vitejs/plugin-react
```
Expected: installs complete with no peer-dep errors that block.

- [ ] **Step 3: Initialize shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button card badge progress tabs separator
```
Expected: `components/ui/` populated; `components.json` created. (`shadcn-ui` is deprecated; `shadcn` is the current CLI.)

- [ ] **Step 4: Verify dev server boots**

Run:
```bash
npm run build
```
Expected: build succeeds (default starter compiles).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 + tailwind + shadcn"
```

---

## Task 2: Project configuration files

**Files:**
- Create: `next.config.js`, `vercel.json`, `.env.local.example`, `vitest.config.ts`
- Delete: `next.config.mjs` (if created by scaffold)

- [ ] **Step 1: Replace Next config**

Delete `next.config.mjs` / `next.config.ts` if present, create `next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth'],
  },
}

module.exports = nextConfig
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "functions": {
    "app/api/review/start/route.ts": {
      "maxDuration": 300
    }
  }
}
```
Note: the pipeline now runs inside `start` via `waitUntil`, so `start` is the long-running function (not the deleted `run` route).

- [ ] **Step 3: Create `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 5: Add test script to `package.json`**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: project config (next, vercel, env, vitest)"
```

---

## Task 3: Supabase schema migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/001_initial_schema.sql` with the full schema (copy exactly from the source spec — all 8 tables, RLS, storage bucket, trigger):

```sql
create extension if not exists "uuid-ossp";

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  institution text,
  discipline text,
  career_stage text check (career_stage in ('phd_student','postdoc','junior_faculty','senior_faculty','independent')),
  native_language text default 'english',
  created_at timestamptz default now()
);

create table public.manuscripts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  abstract text,
  field text,
  subfield text,
  doc_type text check (doc_type in ('journal_article','thesis_chapter','conference_paper','grant_proposal','systematic_review')),
  submission_target text,
  word_count integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.drafts (
  id uuid default uuid_generate_v4() primary key,
  manuscript_id uuid references public.manuscripts(id) on delete cascade not null,
  version_number integer not null default 1,
  storage_path text not null,
  file_name text not null,
  file_type text check (file_type in ('pdf','docx')),
  parsed_text text,
  parsed_sections jsonb,
  created_at timestamptz default now(),
  unique(manuscript_id, version_number)
);

create table public.review_sessions (
  id uuid default uuid_generate_v4() primary key,
  draft_id uuid references public.drafts(id) on delete cascade not null,
  status text check (status in ('queued','routing','reviewing','adversarial','matching','comparing','complete','failed')) default 'queued',
  reviewer_persona text,
  mode text check (mode in ('standard','adversarial','journal_focused')) default 'standard',
  overall_score integer,
  verdict text check (verdict in ('accept','minor_revision','major_revision','reject')),
  strength_summary text,
  weakness_summary text,
  score_delta jsonb,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.scores (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  dimension text check (dimension in (
    'originality','significance','methodology','evidence_quality',
    'literature_engagement','internal_logic','presentation_clarity','ethical_compliance'
  )) not null,
  score integer check (score between 1 and 10) not null,
  max_score integer default 10,
  rationale text,
  improvements jsonb,
  created_at timestamptz default now()
);

create table public.annotations (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  section text,
  char_start integer,
  char_end integer,
  severity text check (severity in ('critical','major','minor')) not null,
  comment text not null,
  suggestion text,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table public.journal_matches (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  rank integer not null,
  journal_name text not null,
  publisher text,
  fit_score float check (fit_score between 0 and 1),
  acceptance_band text check (acceptance_band in ('high','medium','low')),
  impact_factor_range text,
  avg_decision_days integer,
  key_change_required text,
  open_access_options text,
  apc_cost text,
  rationale text,
  created_at timestamptz default now()
);

create table public.adversarial_critiques (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  critique_number integer not null,
  severity text check (severity in ('critical','major','minor')) not null,
  title text not null,
  quoted_passage text,
  objection text not null,
  required_fix text not null,
  section_reference text,
  resolved boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.manuscripts enable row level security;
alter table public.drafts enable row level security;
alter table public.review_sessions enable row level security;
alter table public.scores enable row level security;
alter table public.annotations enable row level security;
alter table public.journal_matches enable row level security;
alter table public.adversarial_critiques enable row level security;

create policy "users_own_profile" on public.profiles for all using (auth.uid() = id);
create policy "users_own_manuscripts" on public.manuscripts for all using (auth.uid() = user_id);
create policy "users_own_drafts" on public.drafts for all using (
  auth.uid() = (select user_id from public.manuscripts where id = manuscript_id)
);
create policy "users_own_sessions" on public.review_sessions for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    where d.id = draft_id)
);
create policy "users_own_scores" on public.scores for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_annotations" on public.annotations for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_journal_matches" on public.journal_matches for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_adversarial" on public.adversarial_critiques for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);

insert into storage.buckets (id, name, public) values ('manuscripts', 'manuscripts', false);
create policy "users_own_manuscript_files" on storage.objects for all
  using (auth.uid()::text = (storage.foldername(name))[1]);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Apply the migration**

The user has a Supabase project. Apply via the Supabase SQL editor (paste the file contents and run), OR via CLI if linked:
```bash
# If using Supabase CLI and project is linked:
supabase db push
```
Expected: all tables created, no errors. Verify in Supabase dashboard → Table editor that `profiles`, `manuscripts`, `drafts`, `review_sessions`, `scores`, `annotations`, `journal_matches`, `adversarial_critiques` exist and the `manuscripts` storage bucket exists.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: initial supabase schema migration"
```

---

## Task 4: TypeScript types

**Files:**
- Create: `lib/types/index.ts`

- [ ] **Step 1: Create the types file**

Create `lib/types/index.ts` with the full type set from the source spec (Step 3). Include all enums, row interfaces, and AI result interfaces:

```typescript
export type CareerStage = 'phd_student' | 'postdoc' | 'junior_faculty' | 'senior_faculty' | 'independent'
export type DocType = 'journal_article' | 'thesis_chapter' | 'conference_paper' | 'grant_proposal' | 'systematic_review'
export type ReviewStatus = 'queued' | 'routing' | 'reviewing' | 'adversarial' | 'matching' | 'comparing' | 'complete' | 'failed'
export type Verdict = 'accept' | 'minor_revision' | 'major_revision' | 'reject'
export type Severity = 'critical' | 'major' | 'minor'
export type AcceptanceBand = 'high' | 'medium' | 'low'
export type ScoreDimension =
  | 'originality' | 'significance' | 'methodology' | 'evidence_quality'
  | 'literature_engagement' | 'internal_logic' | 'presentation_clarity' | 'ethical_compliance'

export type ReviewerPersona =
  | 'biomedical_rct' | 'social_science_quant' | 'social_science_qual'
  | 'cs_systems' | 'cs_ml_theory' | 'economics_theory' | 'humanities_interpretive'
  | 'environmental_science' | 'engineering_applied' | 'education_research'

export interface Profile {
  id: string
  email: string
  full_name?: string
  institution?: string
  discipline?: string
  career_stage?: CareerStage
  native_language?: string
  created_at: string
}

export interface Manuscript {
  id: string
  user_id: string
  title: string
  abstract?: string
  field?: string
  subfield?: string
  doc_type?: DocType
  submission_target?: string
  word_count?: number
  created_at: string
  updated_at: string
  drafts?: Draft[]
}

export interface Draft {
  id: string
  manuscript_id: string
  version_number: number
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'docx'
  parsed_text?: string
  parsed_sections?: Record<string, string>
  created_at: string
  review_sessions?: ReviewSession[]
}

export interface ReviewSession {
  id: string
  draft_id: string
  status: ReviewStatus
  reviewer_persona?: ReviewerPersona
  mode: 'standard' | 'adversarial' | 'journal_focused'
  overall_score?: number
  verdict?: Verdict
  strength_summary?: string
  weakness_summary?: string
  score_delta?: Record<string, number>
  error_message?: string
  created_at: string
  completed_at?: string
  scores?: Score[]
  annotations?: Annotation[]
  journal_matches?: JournalMatch[]
  adversarial_critiques?: AdversarialCritique[]
}

export interface Score {
  id: string
  session_id: string
  dimension: ScoreDimension
  score: number
  max_score: number
  rationale?: string
  improvements?: string[]
}

export interface Annotation {
  id: string
  session_id: string
  section?: string
  char_start?: number
  char_end?: number
  severity: Severity
  comment: string
  suggestion?: string
  resolved: boolean
}

export interface JournalMatch {
  id: string
  session_id: string
  rank: number
  journal_name: string
  publisher?: string
  fit_score: number
  acceptance_band: AcceptanceBand
  impact_factor_range?: string
  avg_decision_days?: number
  key_change_required?: string
  open_access_options?: string
  apc_cost?: string
  rationale?: string
}

export interface AdversarialCritique {
  id: string
  session_id: string
  critique_number: number
  severity: Severity
  title: string
  quoted_passage?: string
  objection: string
  required_fix: string
  section_reference?: string
  resolved: boolean
}

export interface DisciplineRouterResult {
  field: string
  subfield: string
  doc_type: DocType
  persona: ReviewerPersona
  confidence: number
  reasoning: string
}

export interface DeepReviewerResult {
  scores: Array<{ dimension: ScoreDimension; score: number; rationale: string; improvements: string[] }>
  verdict: Verdict
  overall_score: number
  strength_summary: string
  weakness_summary: string
  annotations: Array<{
    section: string
    severity: Severity
    comment: string
    suggestion: string
  }>
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: domain types"
```

---

## Task 5: Supabase clients + middleware

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `middleware.ts`

- [ ] **Step 1: Browser client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Cookie server client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Service-role admin client (server-only)**

Create `lib/supabase/admin.ts`:
```typescript
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS. NEVER import this into a client component.
// Used only by the detached review pipeline, which has no user cookie.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
```

Run:
```bash
npm install server-only
```

- [ ] **Step 4: Middleware**

Create `middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ['/', '/login', '/signup', '/api']
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: supabase clients (browser/server/admin) + middleware"
```

---

## Task 6: PDF parser (TDD)

**Files:**
- Create: `lib/parsers/pdfParser.ts`, `tests/parsers/pdfParser.test.ts`, `tests/fixtures/sample.pdf`

- [ ] **Step 1: Add a fixture PDF**

Create a tiny real PDF at `tests/fixtures/sample.pdf` containing the text below (use any tool; the content must include an "Abstract" and "Introduction" heading):
```
Abstract
This is a sample manuscript abstract about widget reliability.
Introduction
We study widgets. Methods follow.
Methods
We measured widgets.
```
If no PDF tool is handy, generate one with Node:
```bash
node -e "const fs=require('fs');const p=Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 20 170 Td (Abstract) Tj 0 -20 Td (This is a sample abstract.) Tj 0 -20 Td (Introduction) Tj 0 -20 Td (We study widgets.) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 6>>\nstartxref\n0\n%%EOF','latin1');fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/sample.pdf',p);"
```

- [ ] **Step 2: Write the failing test**

Create `tests/parsers/pdfParser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parsePDF } from '@/lib/parsers/pdfParser'

describe('parsePDF', () => {
  it('extracts non-empty text and a plausible word count', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/sample.pdf'))
    const result = await parsePDF(buf)
    expect(result.full_text.length).toBeGreaterThan(0)
    expect(result.word_count).toBeGreaterThan(0)
    expect(typeof result.sections).toBe('object')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm test -- pdfParser
```
Expected: FAIL — `parsePDF` not found / module missing.

- [ ] **Step 4: Implement the parser**

Create `lib/parsers/pdfParser.ts` (note the `pdf-parse/lib/pdf-parse.js` import path — importing the package root runs debug code that throws):
```typescript
import pdf from 'pdf-parse/lib/pdf-parse.js'

export interface ParsedDocument {
  full_text: string
  word_count: number
  sections: Record<string, string>
  title?: string
  abstract?: string
}

const SECTION_PATTERNS = [
  /^(abstract|introduction|background|literature review|related work|methodology|methods|materials and methods|results|findings|discussion|conclusion|conclusions|references|acknowledgements?|appendix)/im
]

export async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  const data = await pdf(buffer)
  const full_text = data.text
  const word_count = full_text.split(/\s+/).filter(Boolean).length
  const sections = extractSections(full_text)

  return {
    full_text,
    word_count,
    sections,
    title: sections['title'],
    abstract: sections['abstract'],
  }
}

function extractSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sections: Record<string, string> = {}
  let currentSection = 'preamble'
  let buffer: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const isHeading = SECTION_PATTERNS.some(p => p.test(trimmed)) && trimmed.length < 80
    if (isHeading) {
      sections[currentSection] = buffer.join('\n').trim()
      currentSection = trimmed.toLowerCase().replace(/\s+/g, '_')
      buffer = []
    } else {
      buffer.push(line)
    }
  }
  sections[currentSection] = buffer.join('\n').trim()
  return sections
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm test -- pdfParser
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pdf parser with section extraction"
```

---

## Task 7: DOCX parser (TDD)

**Files:**
- Create: `lib/parsers/docxParser.ts`, `tests/parsers/docxParser.test.ts`, `tests/fixtures/sample.docx`

- [ ] **Step 1: Generate a fixture DOCX**

Generate a minimal valid `.docx` with Node + the already-installed `mammoth` is read-only, so create one via a zip. Simplest: use the `docx` generation inline script:
```bash
node -e "const fs=require('fs');const {execSync}=require('child_process');" 2>/dev/null; node -e "
const JSZip=require('jszip')||null;
" 2>/dev/null || echo "use manual fixture"
```
If `JSZip` is unavailable, create `tests/fixtures/sample.docx` manually: open Word/Google Docs, type the text below, export as `.docx`:
```
Abstract
This is a sample manuscript abstract about widget reliability and validity.
Introduction
We study widgets in depth across many conditions.
```

- [ ] **Step 2: Write the failing test**

Create `tests/parsers/docxParser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseDOCX } from '@/lib/parsers/docxParser'

describe('parseDOCX', () => {
  it('extracts non-empty text and word count', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/sample.docx'))
    const result = await parseDOCX(buf)
    expect(result.full_text.length).toBeGreaterThan(0)
    expect(result.word_count).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm test -- docxParser
```
Expected: FAIL — module missing.

- [ ] **Step 4: Implement the parser**

Create `lib/parsers/docxParser.ts`:
```typescript
import mammoth from 'mammoth'

export async function parseDOCX(buffer: Buffer): Promise<{
  full_text: string
  word_count: number
  sections: Record<string, string>
  title?: string
  abstract?: string
}> {
  const result = await mammoth.extractRawText({ buffer })
  const full_text = result.value
  const word_count = full_text.split(/\s+/).filter(Boolean).length

  return {
    full_text,
    word_count,
    sections: { full: full_text },
    abstract: extractAbstract(full_text),
  }
}

function extractAbstract(text: string): string | undefined {
  const match = text.match(/abstract[\s\S]{0,50}?([\s\S]{100,2000})introduction/i)
  return match?.[1]?.trim()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm test -- docxParser
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: docx parser"
```

---

## Task 8: Anthropic client + safe JSON helper

**Files:**
- Create: `lib/ai/anthropic.ts`, `lib/ai/json.ts`, `tests/ai/json.test.ts`

- [ ] **Step 1: Anthropic client**

Create `lib/ai/anthropic.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-20250514'
export const MAX_TOKENS = 4096
```

- [ ] **Step 2: Write the failing test for the JSON helper**

Create `tests/ai/json.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { extractJson } from '@/lib/ai/json'

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  })
  it('throws on unparseable text', () => {
    expect(() => extractJson('not json')).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm test -- json
```
Expected: FAIL — `extractJson` not found.

- [ ] **Step 4: Implement the helper**

Create `lib/ai/json.ts`:
```typescript
// Parse a model text response into JSON, tolerating markdown fences and
// leading/trailing prose. Throws if no JSON object can be recovered.
export function extractJson<T = unknown>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T
    }
    throw new Error('No parseable JSON found in model response')
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm test -- json
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: anthropic client + safe JSON extraction helper"
```

---

## Task 9: Discipline router prompt

**Files:**
- Create: `lib/ai/prompts/disciplineRouter.ts`

- [ ] **Step 1: Implement the router**

Create `lib/ai/prompts/disciplineRouter.ts` (uses `extractJson` with one retry):
```typescript
import { anthropic, MODEL } from '../anthropic'
import { extractJson } from '../json'
import type { DisciplineRouterResult } from '@/lib/types'

const SYSTEM = `You are an expert academic librarian and meta-reviewer. Your only job is to analyse a manuscript and return a JSON object identifying its discipline, sub-field, document type, and the most appropriate reviewer persona to apply.

Reviewer personas available:
- "biomedical_rct" — randomised controlled trials, clinical medicine
- "social_science_quant" — quantitative social science, survey research
- "social_science_qual" — qualitative, ethnographic, grounded theory
- "cs_systems" — systems papers, benchmarks, implementation
- "cs_ml_theory" — ML/AI, theoretical contributions
- "economics_theory" — formal models, proofs, working papers
- "humanities_interpretive" — history, literary studies, philosophy
- "environmental_science" — ecology, climate, field studies
- "engineering_applied" — applied engineering, design papers
- "education_research" — pedagogy, curriculum, mixed-methods

Return ONLY valid JSON, no preamble, no markdown fences:
{
  "field": string,
  "subfield": string,
  "doc_type": "journal_article" | "thesis_chapter" | "conference_paper" | "grant_proposal" | "systematic_review",
  "persona": string,
  "confidence": number between 0 and 1,
  "reasoning": string max 40 words
}`

export async function runDisciplineRouter(
  title: string,
  abstract: string
): Promise<DisciplineRouterResult> {
  const call = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Title: ${title}\n\nAbstract: ${abstract}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return extractJson<DisciplineRouterResult>(text)
  }
  try {
    return await call()
  } catch {
    return await call() // one retry on malformed JSON
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: discipline router prompt"
```

---

## Task 10: Deep reviewer prompt

**Files:**
- Create: `lib/ai/prompts/deepReviewer.ts`

- [ ] **Step 1: Implement the deep reviewer**

Create `lib/ai/prompts/deepReviewer.ts`:
```typescript
import { anthropic, MODEL, MAX_TOKENS } from '../anthropic'
import { extractJson } from '../json'
import type { DeepReviewerResult, ReviewerPersona } from '@/lib/types'

const SYSTEM = (persona: ReviewerPersona, target: string) =>
  `You are a senior peer reviewer for ${target} acting as a ${persona.replace(/_/g, ' ')} specialist. You have reviewed over 200 manuscripts in this field. You are rigorous, fair, and specific — you cite exact passages, not vague impressions.

Evaluate the manuscript across these 8 dimensions (score each 1–10):
1. originality — is the contribution genuinely new?
2. significance — does it matter to the field?
3. methodology — is the approach sound and appropriate?
4. evidence_quality — are claims supported by data?
5. literature_engagement — is prior work fairly represented?
6. internal_logic — is the argument coherent end-to-end?
7. presentation_clarity — is it readable and well-structured?
8. ethical_compliance — funding disclosure, conflicts, data availability

Return ONLY valid JSON with this exact shape:
{
  "scores": [
    { "dimension": string, "score": number 1-10, "rationale": string 2-3 sentences, "improvements": array of 1-3 specific actionable strings }
  ],
  "verdict": "accept" | "minor_revision" | "major_revision" | "reject",
  "overall_score": number sum of all 8 scores,
  "strength_summary": string max 30 words,
  "weakness_summary": string max 30 words,
  "annotations": [
    { "section": string, "severity": "critical" | "major" | "minor", "comment": string, "suggestion": string }
  ]
}`

export async function runDeepReviewer(
  manuscriptText: string,
  persona: ReviewerPersona,
  field: string,
  journalTarget?: string
): Promise<DeepReviewerResult> {
  const target = journalTarget || 'a leading peer-reviewed journal in this field'
  const call = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM(persona, target),
      messages: [{
        role: 'user',
        content: `Field: ${field}\nPersona: ${persona}\n\nManuscript:\n${manuscriptText.slice(0, 80000)}`,
      }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return extractJson<DeepReviewerResult>(text)
  }
  try {
    return await call()
  } catch {
    return await call()
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: deep reviewer prompt"
```

---

## Task 11: Review pipeline (router + deep review)

**Files:**
- Create: `lib/ai/pipeline.ts`

- [ ] **Step 1: Implement the pipeline**

Create `lib/ai/pipeline.ts`. Uses the **service-role admin client** (runs detached from the request). Slice covers routing → reviewing → complete.
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { runDisciplineRouter } from './prompts/disciplineRouter'
import { runDeepReviewer } from './prompts/deepReviewer'
import type { ReviewStatus } from '@/lib/types'

export async function runReviewPipeline(sessionId: string) {
  const supabase = createAdminClient()

  const updateStatus = async (status: ReviewStatus) => {
    await supabase.from('review_sessions').update({ status }).eq('id', sessionId)
  }

  try {
    const { data: session, error } = await supabase
      .from('review_sessions')
      .select('*, drafts(*, manuscripts(*))')
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')

    const draft = session.drafts as any
    const manuscript = draft.manuscripts

    const manuscriptText = draft.parsed_text || ''
    const title = manuscript.title || ''
    const abstract = manuscript.abstract || ''

    // Stage 1: discipline routing
    await updateStatus('routing')
    const routing = await runDisciplineRouter(title, abstract)

    await supabase.from('manuscripts').update({
      field: routing.field,
      subfield: routing.subfield,
      doc_type: routing.doc_type,
    }).eq('id', manuscript.id)

    await supabase.from('review_sessions').update({
      reviewer_persona: routing.persona,
    }).eq('id', sessionId)

    // Stage 2: deep review
    await updateStatus('reviewing')
    const review = await runDeepReviewer(
      manuscriptText,
      routing.persona,
      routing.field,
      manuscript.submission_target
    )

    const scoreRows = review.scores.map(s => ({
      session_id: sessionId,
      dimension: s.dimension,
      score: s.score,
      max_score: 10,
      rationale: s.rationale,
      improvements: s.improvements,
    }))
    await supabase.from('scores').insert(scoreRows)

    const annotationRows = review.annotations.map(a => ({
      session_id: sessionId,
      section: a.section,
      severity: a.severity,
      comment: a.comment,
      suggestion: a.suggestion,
    }))
    if (annotationRows.length > 0) {
      await supabase.from('annotations').insert(annotationRows)
    }

    await supabase.from('review_sessions').update({
      overall_score: review.overall_score,
      verdict: review.verdict,
      strength_summary: review.strength_summary,
      weakness_summary: review.weakness_summary,
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId)

  } catch (err: any) {
    await supabase.from('review_sessions').update({
      status: 'failed',
      error_message: err?.message ?? 'Unknown error',
    }).eq('id', sessionId)
    throw err
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: review pipeline (routing + deep review) via service role"
```

---

## Task 12: Manuscripts API routes

**Files:**
- Create: `app/api/manuscripts/route.ts`, `app/api/manuscripts/[id]/route.ts`

- [ ] **Step 1: Create list + create route**

Create `app/api/manuscripts/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('manuscripts')
    .select('*, drafts(*)')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ manuscripts: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, submission_target } = body
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('manuscripts')
    .insert({ user_id: user.id, title, submission_target })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ manuscript: data })
}
```

- [ ] **Step 2: Create detail + delete route**

Create `app/api/manuscripts/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('manuscripts')
    .select('*, drafts(*, review_sessions(*))')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ manuscript: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('manuscripts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: manuscripts API routes"
```

---

## Task 13: Upload API route

**Files:**
- Create: `app/api/upload/route.ts`

- [ ] **Step 1: Implement upload (store + parse + insert draft)**

Create `app/api/upload/route.ts` with 10 MB cap and type validation:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePDF } from '@/lib/parsers/pdfParser'
import { parseDOCX } from '@/lib/parsers/docxParser'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const manuscriptId = formData.get('manuscriptId') as string | null

  if (!file || !manuscriptId) {
    return NextResponse.json({ error: 'Missing file or manuscriptId' }, { status: 400 })
  }
  const isPdf = file.name.toLowerCase().endsWith('.pdf')
  const isDocx = file.name.toLowerCase().endsWith('.docx')
  if (!isPdf && !isDocx) {
    return NextResponse.json({ error: 'Only .pdf and .docx are supported' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileType: 'pdf' | 'docx' = isPdf ? 'pdf' : 'docx'

  const { data: drafts } = await supabase
    .from('drafts')
    .select('version_number')
    .eq('manuscript_id', manuscriptId)
    .order('version_number', { ascending: false })
    .limit(1)

  const versionNumber = drafts?.[0]?.version_number ? drafts[0].version_number + 1 : 1
  const storagePath = `${user.id}/${manuscriptId}/v${versionNumber}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('manuscripts')
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const parsed = fileType === 'pdf' ? await parsePDF(buffer) : await parseDOCX(buffer)

  const { data: draft, error: draftError } = await supabase
    .from('drafts')
    .insert({
      manuscript_id: manuscriptId,
      version_number: versionNumber,
      storage_path: storagePath,
      file_name: file.name,
      file_type: fileType,
      parsed_text: parsed.full_text,
      parsed_sections: parsed.sections,
    })
    .select()
    .single()

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 })
  }

  await supabase.from('manuscripts').update({
    word_count: parsed.word_count,
    abstract: parsed.abstract || undefined,
  }).eq('id', manuscriptId)

  return NextResponse.json({ draft })
}
```

- [ ] **Step 2: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: upload route with parse + validation"
```

---

## Task 14: Review start + status API routes

**Files:**
- Create: `app/api/review/start/route.ts`, `app/api/review/status/[sessionId]/route.ts`

- [ ] **Step 1: Implement start route (waitUntil pipeline)**

Create `app/api/review/start/route.ts`. The pipeline runs detached via `waitUntil` — no second fetch:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { runReviewPipeline } from '@/lib/ai/pipeline'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { draftId, mode = 'standard' } = await request.json()
  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

  const { data: session, error } = await supabase
    .from('review_sessions')
    .insert({ draft_id: draftId, mode, status: 'queued' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Run the pipeline detached from the response lifecycle.
  waitUntil(runReviewPipeline(session.id))

  return NextResponse.json({ sessionId: session.id })
}
```

- [ ] **Step 2: Implement status route**

Create `app/api/review/status/[sessionId]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session, error } = await supabase
    .from('review_sessions')
    .select(`
      *,
      scores(*),
      annotations(*),
      journal_matches(*),
      adversarial_critiques(*)
    `)
    .eq('id', params.sessionId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ session })
}
```

- [ ] **Step 3: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: review start (waitUntil) + status routes"
```

---

## Task 15: Auth pages

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Login page**

Create `app/(auth)/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold">Log in to PeerReady</h1>
        <form onSubmit={handleLogin} className="space-y-3">
          <input className="w-full rounded border p-2" type="email" placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full rounded border p-2" type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          No account? <Link href="/signup" className="underline">Sign up</Link>
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Signup page**

Create `app/(auth)/signup/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold">Create your PeerReady account</h1>
        <form onSubmit={handleSignup} className="space-y-3">
          <input className="w-full rounded border p-2" placeholder="Full name"
            value={fullName} onChange={e => setFullName(e.target.value)} />
          <input className="w-full rounded border p-2" type="email" placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full rounded border p-2" type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Sign up'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Have an account? <Link href="/login" className="underline">Log in</Link>
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: email/password login + signup pages"
```

---

## Task 16: Dashboard shell (layout + sidebar + topbar)

**Files:**
- Create: `components/layout/Sidebar.tsx`, `components/layout/TopBar.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Sidebar**

Create `components/layout/Sidebar.tsx`:
```tsx
import Link from 'next/link'
import { FileText, LayoutDashboard } from 'lucide-react'

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r bg-muted/30 p-4">
      <div className="mb-6 text-lg font-bold">PeerReady</div>
      <nav className="space-y-1 text-sm">
        <Link href="/dashboard" className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted">
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>
        <Link href="/manuscripts" className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted">
          <FileText className="h-4 w-4" /> Manuscripts
        </Link>
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: TopBar (with sign out)**

Create `components/layout/TopBar.tsx`:
```tsx
'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function TopBar({ email }: { email?: string }) {
  const router = useRouter()
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="text-sm text-muted-foreground">{email}</div>
      <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
    </header>
  )
}
```

- [ ] **Step 3: Dashboard layout (auth guard)**

Create `app/(dashboard)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar email={user.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Dashboard landing page**

Create `app/(dashboard)/dashboard/page.tsx`:
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Welcome to PeerReady</h1>
      <p className="mb-4 text-muted-foreground">Upload a manuscript to get an AI peer review.</p>
      <Link href="/manuscripts/new"><Button>New review</Button></Link>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: dashboard shell (layout, sidebar, topbar)"
```

---

## Task 17: Manuscript list + detail pages

**Files:**
- Create: `components/manuscripts/ManuscriptCard.tsx`, `components/manuscripts/ManuscriptList.tsx`, `app/(dashboard)/manuscripts/page.tsx`, `app/(dashboard)/manuscripts/[id]/page.tsx`

- [ ] **Step 1: ManuscriptCard**

Create `components/manuscripts/ManuscriptCard.tsx`:
```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Manuscript } from '@/lib/types'

export function ManuscriptCard({ m }: { m: Manuscript }) {
  const draftCount = m.drafts?.length ?? 0
  return (
    <Link href={`/manuscripts/${m.id}`}>
      <Card className="p-4 transition hover:shadow">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{m.title}</h3>
          {m.field && <Badge variant="secondary">{m.field}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {draftCount} draft{draftCount === 1 ? '' : 's'}
          {m.word_count ? ` · ${m.word_count.toLocaleString()} words` : ''}
        </p>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: ManuscriptList**

Create `components/manuscripts/ManuscriptList.tsx`:
```tsx
import { ManuscriptCard } from './ManuscriptCard'
import type { Manuscript } from '@/lib/types'

export function ManuscriptList({ manuscripts }: { manuscripts: Manuscript[] }) {
  if (manuscripts.length === 0) {
    return <p className="text-muted-foreground">No manuscripts yet.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {manuscripts.map(m => <ManuscriptCard key={m.id} m={m} />)}
    </div>
  )
}
```

- [ ] **Step 3: Manuscripts list page**

Create `app/(dashboard)/manuscripts/page.tsx`:
```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ManuscriptList } from '@/components/manuscripts/ManuscriptList'
import type { Manuscript } from '@/lib/types'

export default async function ManuscriptsPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('manuscripts')
    .select('*, drafts(*)')
    .order('updated_at', { ascending: false })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manuscripts</h1>
        <Link href="/manuscripts/new"><Button>New review</Button></Link>
      </div>
      <ManuscriptList manuscripts={(data as Manuscript[]) ?? []} />
    </div>
  )
}
```

- [ ] **Step 4: Manuscript detail page (drafts + sessions)**

Create `app/(dashboard)/manuscripts/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'

export default async function ManuscriptDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: m } = await supabase
    .from('manuscripts')
    .select('*, drafts(*, review_sessions(*))')
    .eq('id', params.id)
    .single()

  if (!m) return <p>Manuscript not found.</p>

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{m.title}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{m.field ?? 'Field pending'} · {m.word_count ?? 0} words</p>
      <div className="space-y-3">
        {(m.drafts ?? []).map((d: any) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">v{d.version_number} · {d.file_name}</p>
                <p className="text-sm text-muted-foreground">
                  {(d.review_sessions ?? []).length} review session(s)
                </p>
              </div>
              {(d.review_sessions ?? []).map((s: any) => (
                <Link key={s.id} href={`/manuscripts/${m.id}/review/${s.id}`}
                  className="text-sm underline">
                  View review ({s.status})
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: manuscript list + detail pages"
```

---

## Task 18: New manuscript + upload flow

**Files:**
- Create: `components/manuscripts/UploadDropzone.tsx`, `app/(dashboard)/manuscripts/new/page.tsx`

- [ ] **Step 1: UploadDropzone**

Create `components/manuscripts/UploadDropzone.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function UploadDropzone({ manuscriptId, onError }: {
  manuscriptId: string
  onError?: (msg: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  function pick(f: File | null) {
    if (!f) return
    const ok = /\.(pdf|docx)$/i.test(f.name)
    if (!ok) { onError?.('Only .pdf and .docx files are supported'); return }
    setFile(f)
  }

  async function submit() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('manuscriptId', manuscriptId)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upJson = await up.json()
      if (!up.ok) throw new Error(upJson.error || 'Upload failed')

      const start = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: upJson.draft.id }),
      })
      const startJson = await start.json()
      if (!start.ok) throw new Error(startJson.error || 'Could not start review')

      window.location.href = `/manuscripts/${manuscriptId}/review/${startJson.sessionId}`
    } catch (e: any) {
      onError?.(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
        className="flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground"
      >
        {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'Drag a .pdf or .docx here, or click to choose'}
        <input type="file" accept=".pdf,.docx" className="hidden"
          onChange={e => pick(e.target.files?.[0] ?? null)} />
      </label>
      <Button onClick={submit} disabled={!file || busy}>
        {busy ? 'Uploading & starting review…' : 'Upload & review'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: New manuscript page (create then upload)**

Create `app/(dashboard)/manuscripts/new/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UploadDropzone } from '@/components/manuscripts/UploadDropzone'

export default function NewManuscriptPage() {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [manuscriptId, setManuscriptId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function createManuscript(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setError(null)
    const res = await fetch('/api/manuscripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, submission_target: target }),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) { setError(json.error || 'Failed to create'); return }
    setManuscriptId(json.manuscript.id)
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold">New review</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!manuscriptId ? (
        <Card className="p-6">
          <form onSubmit={createManuscript} className="space-y-3">
            <input className="w-full rounded border p-2" placeholder="Manuscript title"
              value={title} onChange={e => setTitle(e.target.value)} required />
            <input className="w-full rounded border p-2" placeholder="Target journal (optional)"
              value={target} onChange={e => setTarget(e.target.value)} />
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Continue to upload'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="mb-3 text-sm text-muted-foreground">Upload your draft to start the review.</p>
          <UploadDropzone manuscriptId={manuscriptId} onError={setError} />
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

Run:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat: new manuscript creation + upload flow"
```

---

## Task 19: Review dashboard (polling + Overview tab)

**Files:**
- Create: `components/review/ScoreList.tsx`, `components/review/AnnotationPanel.tsx`, `components/review/ReviewDashboard.tsx`, `app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx`

- [ ] **Step 1: ScoreList**

Create `components/review/ScoreList.tsx`:
```tsx
import { Card } from '@/components/ui/card'
import type { Score } from '@/lib/types'

export function ScoreList({ scores }: { scores: Score[] }) {
  return (
    <div className="space-y-2">
      {scores.map(s => (
        <Card key={s.id} className="p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize">{s.dimension.replace(/_/g, ' ')}</span>
            <span className="text-sm">{s.score}/{s.max_score}</span>
          </div>
          {s.rationale && <p className="mt-1 text-sm text-muted-foreground">{s.rationale}</p>}
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: AnnotationPanel (grouped by severity)**

Create `components/review/AnnotationPanel.tsx`:
```tsx
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Annotation, Severity } from '@/lib/types'

const ORDER: Severity[] = ['critical', 'major', 'minor']
const COLOR: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-amber-100 text-amber-800',
  minor: 'bg-gray-100 text-gray-800',
}

export function AnnotationPanel({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return <p className="text-muted-foreground">No annotations.</p>
  return (
    <div className="space-y-4">
      {ORDER.map(sev => {
        const items = annotations.filter(a => a.severity === sev)
        if (items.length === 0) return null
        return (
          <div key={sev}>
            <h4 className="mb-2 font-medium capitalize">{sev} ({items.length})</h4>
            <div className="space-y-2">
              {items.map(a => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge className={COLOR[a.severity]}>{a.severity}</Badge>
                    {a.section && <span className="text-xs text-muted-foreground">{a.section}</span>}
                  </div>
                  <p className="mt-1 text-sm">{a.comment}</p>
                  {a.suggestion && <p className="mt-1 text-sm text-green-700">Fix: {a.suggestion}</p>}
                </Card>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: ReviewDashboard (polling + tabs)**

Create `components/review/ReviewDashboard.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScoreList } from './ScoreList'
import { AnnotationPanel } from './AnnotationPanel'
import type { ReviewSession } from '@/lib/types'

const STEPS = ['routing', 'reviewing', 'complete'] as const
const VERDICT_LABEL: Record<string, string> = {
  accept: 'Accept', minor_revision: 'Minor revision',
  major_revision: 'Major revision', reject: 'Reject',
}

export function ReviewDashboard({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ReviewSession | null>(null)

  useEffect(() => {
    let active = true
    async function poll() {
      const res = await fetch(`/api/review/status/${sessionId}`)
      const json = await res.json()
      if (!active) return
      setSession(json.session)
      if (json.session && json.session.status !== 'complete' && json.session.status !== 'failed') {
        setTimeout(poll, 3000)
      }
    }
    poll()
    return () => { active = false }
  }, [sessionId])

  if (!session) return <p>Loading review…</p>

  if (session.status === 'failed') {
    return <p className="text-red-600">Review failed: {session.error_message}</p>
  }

  if (session.status !== 'complete') {
    const idx = STEPS.indexOf(session.status as any)
    const pct = Math.max(5, Math.round(((idx + 1) / STEPS.length) * 100))
    return (
      <div className="max-w-md">
        <p className="mb-2 capitalize">Status: {session.status}…</p>
        <Progress value={pct} />
        <p className="mt-2 text-sm text-muted-foreground">Routing → Reviewing → Done</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Badge>{VERDICT_LABEL[session.verdict ?? ''] ?? session.verdict}</Badge>
        <span className="text-lg font-semibold">{session.overall_score ?? 0} / 80</span>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
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
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Review page**

Create `app/(dashboard)/manuscripts/[id]/review/[sessionId]/page.tsx`:
```tsx
import { ReviewDashboard } from '@/components/review/ReviewDashboard'

export default function ReviewPage({ params }: { params: { id: string; sessionId: string } }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Review</h1>
      <ReviewDashboard sessionId={params.sessionId} />
    </div>
  )
}
```

- [ ] **Step 5: Typecheck, build, commit**

Run:
```bash
npx tsc --noEmit
npm run build
git add -A
git commit -m "feat: review dashboard with polling + overview tab"
```

---

## Task 20: End-to-end verification

**Files:** none (manual verification against live services)

- [ ] **Step 1: Wire up `.env.local`**

Copy `.env.local.example` to `.env.local` and fill in the real Supabase URL, anon key, service-role key, and Anthropic API key.

- [ ] **Step 2: Confirm the migration is applied**

In Supabase dashboard, verify all 8 tables and the `manuscripts` storage bucket exist (from Task 3). If not, run the migration now.

- [ ] **Step 3: Run the app**

Run:
```bash
npm run dev
```
Expected: server on http://localhost:3000.

- [ ] **Step 4: Walk the full path**

1. Visit `/signup`, create an account → lands on `/dashboard`.
2. In Supabase, confirm a `profiles` row was auto-created for the new user.
3. Click "New review", enter a title → "Continue to upload".
4. Upload a real `.pdf` or `.docx` manuscript → it redirects to the review page.
5. Watch status advance: `queued → routing → reviewing → complete` (45–90s).
6. Confirm the Overview tab shows: a verdict badge, overall score / 80, 8 dimension cards with rationale, and annotations grouped by severity.

Expected: all of the above render with real Claude-generated content.

- [ ] **Step 5: RLS sanity check**

Create a second account in a different browser/incognito. Confirm it cannot load the first user's review (the status route returns 404/empty because RLS blocks the row).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: vertical slice complete and verified end-to-end" --allow-empty
```

---

## Self-Review Notes

- **Spec §2 (slice goal):** Tasks 15 (auth), 18 (create+upload), 13 (parse/store), 11 (pipeline routing+review), 19 (dashboard Overview), 20 (verify) — covered.
- **Spec §4.1 (component boundaries):** browser/server/admin clients = Task 5; parsers = 6–7; prompt modules = 9–10; pipeline = 11; routes = 12–14; UI = 16–19 — covered.
- **Spec §5 corrections:** `waitUntil` (Task 14), service-role pipeline client (Tasks 5 + 11), `pdf-parse/lib/pdf-parse.js` import (Task 6), `run` route omitted (no task creates it) — covered.
- **Spec §6 (error handling):** JSON retry = `extractJson` + retry in Tasks 9–10; pipeline failure state = Task 11; upload validation = Task 13; 80k truncation = Task 10 — covered.
- **Spec §8 (testing):** parser unit tests = Tasks 6–7; manual E2E = Task 20; RLS check = Task 20 Step 5 — covered.
- **Type consistency:** `runReviewPipeline(sessionId)` (def Task 11, called Task 14); `parsePDF`/`parseDOCX` (def 6/7, used 13); `extractJson` (def 8, used 9/10); `runDisciplineRouter`/`runDeepReviewer` (def 9/10, used 11); `ReviewDashboard({sessionId})` (def 19, used 19 page) — consistent.
- **Deferred features (spec §7):** no tasks create adversarial/journal/progress/export — intentional.
