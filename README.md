# PeerReady

AI-powered peer review for academic manuscripts. Upload a paper (PDF or DOCX) and PeerReady
routes it to a discipline-appropriate reviewer persona, runs a rigorous Claude-based review,
and returns a structured verdict, eight scored quality dimensions, inline annotations — and,
on demand, a harsher adversarial "Reviewer 2" critique that escalates the weaknesses a polite
reviewer would soften.

> Status: working vertical slice, verified end-to-end against live Supabase + Anthropic.

<!-- Deploy: production is Vercel (prod = `main`). If a merge to `main` does not auto-deploy,
     deploy manually from a synced checkout: `npx vercel deploy --prod --yes`. -->

## What it does

1. **Upload** a manuscript (`.pdf` / `.docx`). It's stored, parsed, and section-extracted.
2. **Discipline routing** — Claude identifies the field, sub-field, document type, and the most
   appropriate reviewer persona (e.g. biomedical RCT, CS/ML theory, social-science qualitative).
3. **Deep review** — a senior-reviewer pass scores the manuscript 1–10 across eight dimensions
   (originality, significance, methodology, evidence quality, literature engagement, internal
   logic, presentation clarity, ethical compliance), with a verdict, strength/weakness summaries,
   and severity-tagged annotations.
4. **Adversarial critique** (on demand) — a second, hostile pass grounded in the standard
   review's findings. Briefed to *escalate, not repeat*, it returns numbered objections, each
   with a quoted passage and a concrete required fix, plus the single biggest rejection risk.
5. **Dashboard** — polls progress (`routing → reviewing → complete`) and presents the result in
   an Overview tab and an Adversarial tab.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** — Postgres, Auth (email/password), Storage, row-level security
- **Anthropic Claude** (`claude-sonnet-4-6`) via the Anthropic SDK
- **`@vercel/functions`** `waitUntil` for detached pipeline execution
- **Vitest** for unit tests; `pdf-parse` / `mammoth` for document parsing

## Architecture

- **User-facing API routes** use a cookie-bound Supabase server client, so **RLS** applies and
  users only ever see their own data.
- **The review pipeline runs detached** from the request via `waitUntil`, using a server-only
  **service-role** client to persist results (it has no user cookie). The standard pipeline and
  the adversarial pipeline follow the same pattern.
- **Parsers and AI prompt modules are pure, independently testable units** (`lib/parsers`,
  `lib/ai/prompts`). The shared Claude model is a single constant in `lib/ai/anthropic.ts`.
- **Progress is tracked in the database**: `review_sessions.status` for the main pipeline and a
  dedicated `adversarial_status` lifecycle (`not_started → running → complete | failed`) for the
  on-demand pass, so state survives page reloads.

```
app/
  (auth)/                 login + signup
  (dashboard)/            sidebar shell, manuscripts list/detail, new-review flow, review page
  api/
    manuscripts/          create / list / get / delete
    upload/               store + parse + insert draft
    review/start/         create session + waitUntil(standard pipeline)
    review/status/        poll status + nested results
    review/adversarial/   on-demand adversarial pipeline trigger
components/               layout, manuscripts, review (Overview + Adversarial panels)
lib/
  supabase/               browser / server (RLS) / admin (service-role) clients
  ai/                     anthropic client, JSON helper, prompts, pipelines
  parsers/                pdf + docx
  types/                  domain model
supabase/migrations/      001 initial schema, 002 adversarial status columns
docs/superpowers/         design specs + implementation plans
```

## Getting started

You need a Supabase project and an Anthropic API key. Full step-by-step setup and a live
verification walkthrough (including common gotchas) are in **[SETUP.md](./SETUP.md)**.

Quick version:

```bash
npm install

# Apply both SQL migrations to your Supabase project (SQL editor):
#   supabase/migrations/001_initial_schema.sql
#   supabase/migrations/002_adversarial_status.sql
# Then ensure Settings → API → Data API → Exposed schemas includes `public`.

cp .env.local.example .env.local   # fill in Supabase + Anthropic keys
npm run dev                        # http://localhost:3000
```

> Note: if `ANTHROPIC_API_KEY` (or the Supabase vars) is also set as an OS-level environment
> variable, Next.js will not override it with `.env.local`. See SETUP.md → Troubleshooting.

## Testing

```bash
npm test            # Vitest unit tests (parsers, JSON helper, adversarial context builder)
npx tsc --noEmit    # type check
npm run build       # production build (runs lint)
```

## Roadmap (deferred — schema/types already exist)

Journal matching, draft-to-draft progress comparison, XLSX export, Google OAuth, a settings
page, a low-confidence "confirm field" step, rate limiting, and resolving critiques in the UI.

## License

Private project — all rights reserved.
