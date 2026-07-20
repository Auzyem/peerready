# ScholarLens — Local Setup & Verification

This is the **vertical slice**: signup/login → create manuscript → upload (PDF/DOCX) →
parse & store → AI pipeline (discipline routing → deep review) → review dashboard with
verdict, 8 scored dimensions, and annotations. Built per
`docs/superpowers/plans/2026-05-30-peerready-vertical-slice.md`.

## What's built (and verified at build time)
- Next.js 14 app, Tailwind + shadcn/ui, full Supabase schema migration, typed domain model
- Auth (email/password), manuscript CRUD, upload + parse routes, review start/status routes
- Service-role review pipeline (routing + deep review) triggered via `waitUntil`
- Review dashboard polling + Overview tab
- **On-demand adversarial critique** (a harsher "Reviewer 2" second pass grounded in the
  standard review) — Adversarial tab, `adversarial_status` lifecycle, service-role pipeline.
  Built per `docs/superpowers/plans/2026-05-30-adversarial-critique.md`; verified live E2E.
- Unit tests for PDF/DOCX parsers, the JSON helper, and the adversarial context helper
  (`npm test`, 8/8 pass)
- `npm run build` passes; `npx tsc --noEmit` clean
- Claude model: `claude-sonnet-4-6` (shared `MODEL` constant in `lib/ai/anthropic.ts`)

## What's deferred (later passes — schema/types already exist)
Journal matching, progress comparison across drafts, XLSX export, Google OAuth, settings
page, low-confidence "confirm field" step, rate limiting, marking critiques resolved in the UI.

## Live setup (your steps — needs real credentials)

### 1. Apply the database migrations
In your Supabase project → SQL Editor, paste and run the full contents of **both**, in order:
1. `supabase/migrations/001_initial_schema.sql` — 8 tables, RLS, `manuscripts` storage bucket, signup trigger.
2. `supabase/migrations/002_adversarial_status.sql` — adds `adversarial_status` + `adversarial_summary` to `review_sessions` (required for the Adversarial tab).

Confirm they landed (in the SQL editor, not just the table UI):
```sql
select table_name from information_schema.tables where table_schema='public' order by table_name;
-- expect 8 tables. Then:
select column_name from information_schema.columns
where table_name='review_sessions' and column_name like 'adversarial%';
```
**Apply them to the same project your `.env.local` points at** (check the project ref). Then
**Settings → API → Data API → Exposed schemas must include `public`** — otherwise every REST
call 404s (see Troubleshooting).

### 2. Environment variables
```bash
cp .env.local.example .env.local
```
Fill in: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API), and `ANTHROPIC_API_KEY`
(console.anthropic.com). Leave `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

> **Gotcha:** if `ANTHROPIC_API_KEY` (or the Supabase vars) is also set as an **OS-level
> environment variable**, Next.js will NOT override it with `.env.local` — the dev server
> uses the OS value and you may get `401 invalid x-api-key`. Either unset the OS var, or
> launch with the file value forced in:
> ```bash
> export ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2- | tr -d '\r\n') && npm run dev
> ```
> Always **restart the dev server after editing `.env.local`** — env is read once at startup.

### 3. Auth setting for quick testing
Supabase → Authentication → Providers → Email: for fast local testing, **disable
"Confirm email"** so signup logs you straight in. (Re-enable for production.)

### 4. Run
```bash
npm run dev
```
Then at http://localhost:3000:
1. `/signup` → create an account (lands on `/dashboard`)
2. Verify a `profiles` row was auto-created in Supabase
3. "New review" → enter a title → "Continue to upload"
4. Upload a real `.pdf` or `.docx` → redirects to the review page
5. Watch status advance `queued → routing → reviewing → complete` (~45–90s; one Claude
   review uses ~15k–25k tokens)
6. Overview tab shows verdict badge, score / 80, 8 dimension cards, annotations by severity
7. **Adversarial tab → "Run adversarial critique"** → status shows "Running…" for ~30–60s,
   then a "Biggest risk" summary plus critique cards (critical → major → minor) with quoted
   passages and required fixes. Reload mid-run to confirm it stays "Running" (state is
   persisted in `adversarial_status`, so it survives reloads).

### 5. RLS sanity check
Sign up a second account in an incognito window; confirm it cannot open the first
account's review (status route returns 404 — RLS blocks the row).

## Troubleshooting (gotchas hit during live verification)
- **`401 invalid x-api-key` on every review** — an OS-level `ANTHROPIC_API_KEY` is shadowing
  `.env.local`. See the env-vars gotcha above; restart the dev server with the file key forced in.
- **`404 PGRST205 "Could not find the table … in schema cache"` on all tables** — `public` is
  not in **Settings → API → Data API → Exposed schemas**. Re-check it and Save. (A `NOTIFY pgrst,
  'reload schema'` or project restart does *not* fix this — the exposure setting does.)
- **`relation "review_sessions" does not exist`** in the SQL editor — the migrations were never
  applied to *this* project (easy to apply them to the wrong one). Confirm the project ref matches
  `.env.local`, then run both migration files here.
- **Adversarial pass fails with no visible reason** — it intentionally stores no error message,
  only `adversarial_status='failed'`. Check the dev-server console for `[adversarial pipeline]
  failed:`; the most common causes are the two above. Hit **Retry** once the cause is fixed.

## Notes / deviations from the original build prompt
- **`pdf-parse` pinned to 1.1.1** — v2 is an ESM rewrite with no `lib/pdf-parse.js`.
- **Pipeline trigger** uses `waitUntil` (not a fire-and-forget fetch); `/api/review/run`
  was intentionally not created. The pipeline uses the **service-role** client because it
  runs detached from the request (no user cookie); all user-facing routes use the
  cookie/RLS client.
- **Dashboard pages are `force-dynamic`** — they depend on per-request auth cookies.
- On the Vercel **Hobby** plan (60s function limit), a full pipeline may exceed the limit;
  use Vercel Pro (`maxDuration: 300` is already set on `/api/review/start`).
