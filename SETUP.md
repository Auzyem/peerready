# PeerReady — Local Setup & Verification

This is the **vertical slice**: signup/login → create manuscript → upload (PDF/DOCX) →
parse & store → AI pipeline (discipline routing → deep review) → review dashboard with
verdict, 8 scored dimensions, and annotations. Built per
`docs/superpowers/plans/2026-05-30-peerready-vertical-slice.md`.

## What's built (and verified at build time)
- Next.js 14 app, Tailwind + shadcn/ui, full Supabase schema migration, typed domain model
- Auth (email/password), manuscript CRUD, upload + parse routes, review start/status routes
- Service-role review pipeline (routing + deep review) triggered via `waitUntil`
- Review dashboard polling + Overview tab
- Unit tests for PDF/DOCX parsers and the JSON helper (`npm test`, 5/5 pass)
- `npm run build` passes; `npx tsc --noEmit` clean

## What's deferred (later passes — schema/types already exist)
Adversarial critique, journal matching, progress comparison across drafts, XLSX export,
Google OAuth, settings page, low-confidence "confirm field" step, rate limiting.

## Live setup (your steps — needs real credentials)

### 1. Apply the database migration
In your Supabase project → SQL Editor, paste and run the full contents of
`supabase/migrations/001_initial_schema.sql`. Confirm all 8 tables exist and the
`manuscripts` storage bucket was created.

### 2. Environment variables
```bash
cp .env.local.example .env.local
```
Fill in: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API), and `ANTHROPIC_API_KEY`
(console.anthropic.com). Leave `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

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

### 5. RLS sanity check
Sign up a second account in an incognito window; confirm it cannot open the first
account's review (status route returns 404 — RLS blocks the row).

## Notes / deviations from the original build prompt
- **`pdf-parse` pinned to 1.1.1** — v2 is an ESM rewrite with no `lib/pdf-parse.js`.
- **Pipeline trigger** uses `waitUntil` (not a fire-and-forget fetch); `/api/review/run`
  was intentionally not created. The pipeline uses the **service-role** client because it
  runs detached from the request (no user cookie); all user-facing routes use the
  cookie/RLS client.
- **Dashboard pages are `force-dynamic`** — they depend on per-request auth cookies.
- On the Vercel **Hobby** plan (60s function limit), a full pipeline may exceed the limit;
  use Vercel Pro (`maxDuration: 300` is already set on `/api/review/start`).
