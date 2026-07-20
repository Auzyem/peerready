# Deploying ScholarLens to Vercel

A step-by-step guide to deploy ScholarLens (Next.js 14 + Supabase + Anthropic) to
Vercel from scratch. Follow the sections in order.

---

## 0. Before you start — what you need

| Thing | Where to get it |
|-------|-----------------|
| A **Vercel account** | https://vercel.com (sign in with the GitHub account that owns this repo) |
| A **Supabase project** | https://supabase.com — Postgres, Auth, Storage |
| An **Anthropic API key** | https://console.anthropic.com → API Keys |
| This repo **pushed to GitHub** | already on `origin/main` |

> ⚠️ **Plan note — read this first.** A full review runs Claude twice (discipline
> routing + deep review) and takes **~45–90 s**. It executes via `waitUntil` inside
> `/api/review/start`, which sets `maxDuration: 300`. The Vercel **Hobby (free) plan
> caps serverless functions at 60 s**, so reviews will be **killed mid-run and end up
> stuck/failed**. **Use the Vercel Pro plan** for a working deployment. Everything
> else (signup, upload, dashboard) works fine on Hobby — only the AI pipeline needs
> the longer limit.

---

## 1. Set up the Supabase project (do this once)

If you already verified locally against a Supabase project, you can **reuse the same
project** — skip to step 1.4 to confirm settings. For a brand-new production project:

**1.1 — Apply the migrations.** Supabase → **SQL Editor** → paste and run the full
contents of each file, in order:
1. `supabase/migrations/001_initial_schema.sql` — 8 tables, RLS policies, the
   `manuscripts` storage bucket, and the signup trigger.
2. `supabase/migrations/002_adversarial_status.sql` — adds the `adversarial_status`
   and `adversarial_summary` columns (required for the Adversarial tab).

**1.2 — Verify the schema landed:**
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;          -- expect 8 tables

select column_name from information_schema.columns
where table_name = 'review_sessions' and column_name like 'adversarial%';
```

**1.3 — Expose the `public` schema.** Supabase → **Settings → API → Data API →
Exposed schemas** must include **`public`**. If it doesn't, every REST call returns
`404 PGRST205 "Could not find the table … in schema cache"`. (A schema reload or
project restart does **not** fix this — only the exposed-schemas setting does.)

**1.4 — Configure Auth URLs for production.** Supabase → **Authentication → URL
Configuration**:
- **Site URL** → your Vercel production domain (e.g. `https://scholarlens.vercel.app`).
  You can set a placeholder now and update it after step 3 once you know the domain.
- **Redirect URLs** → add `https://scholarlens.vercel.app/**` and, for preview
  deployments, `https://*.vercel.app/**`.
- For **email confirmation**: **Authentication → Providers → Email** — enable
  "Confirm email" for production (or leave it off for quick testing). If it's on,
  confirmation links use the **Site URL** above, so that must be correct.

**1.5 — Grab your keys** for step 3. Supabase → **Settings → API**:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Create the Vercel project

1. Go to **vercel.com → Add New… → Project**.
2. **Import** the ScholarLens Git repository (authorize GitHub if prompted).
3. Vercel auto-detects **Next.js**. Leave the defaults:
   - **Framework Preset:** Next.js
   - **Build Command:** `next build` (default)
   - **Install Command:** `npm install` (default)
   - **Output Directory:** (leave blank — Next.js handles it)
   - **Root Directory:** `./` (the repo root)
4. **Don't click Deploy yet** — add the environment variables first (next step), so
   the very first build already has them.

---

## 3. Add environment variables

ScholarLens reads exactly these. Required unless noted:

| Variable | Required | Secret? | Purpose |
|----------|:--------:|:-------:|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | no | Supabase project URL (client, server, admin, middleware) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | no | Public anon key; RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **yes** | Service-role key for the detached review pipeline (bypasses RLS) |
| `ANTHROPIC_API_KEY` | ✅ | **yes** | Claude API — routing, review, adversarial critique |
| `NEXT_PUBLIC_APP_URL` | optional | no | Not currently read by code; set to your prod URL for future use |

> 🔒 The two secrets must **not** have a `NEXT_PUBLIC_` prefix — that prefix ships a
> value to the browser. Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY`
> server-only (they already are).

**Fastest way — import the template file:**
1. In the repo: `cp .env.vercel.example .env.vercel`, then fill in the real values.
   (`.env.vercel` is gitignored, so your secrets won't be committed.)
2. In Vercel → your project → **Settings → Environment Variables → Import .env** →
   upload/paste `.env.vercel`.
3. Apply to **Production** (and **Preview** if you want PR previews to work).

**Or add them manually:** Settings → Environment Variables → add each key/value,
select the environments, **Save**.

> ♻️ Env-var changes only take effect on a **new deployment** — redeploy after any
> change (Deployments → ⋯ → Redeploy, or push a commit).

---

## 4. Deploy

- If you added env vars before the first deploy: click **Deploy** on the import
  screen (or trigger a deploy from the Deployments tab).
- Vercel builds (`next build`) and gives you a URL like
  `https://scholarlens-xxxx.vercel.app`.

**CLI alternative** (optional):
```bash
npm i -g vercel
vercel            # link/create the project, follow prompts
vercel --prod     # production deploy
```

---

## 5. Post-deploy checklist

1. **Update the Supabase Site URL / Redirect URLs** (step 1.4) to the real Vercel
   domain if you used a placeholder, then **redeploy** if you also changed
   `NEXT_PUBLIC_APP_URL`.
2. Open the production URL → **/signup** → create an account → you should land on
   `/dashboard`, and a `profiles` row should appear in Supabase.
3. **New review** → enter a title → **upload** a real `.pdf` or `.docx`.
4. Watch status advance `queued → routing → reviewing → complete` (~45–90 s on Pro).
5. **Overview tab**: verdict badge, score / 80, 8 dimension cards, annotations.
6. **Adversarial tab → Run adversarial critique** → "Running…" for ~30–60 s, then a
   "Biggest risk" summary plus critique cards. Reload mid-run to confirm state
   persists.
7. **RLS check**: sign up a second account in an incognito window; it must not be able
   to open the first account's review (status route 404s — RLS blocks the row).

---

## 6. Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| Review stuck at `routing`/`reviewing`, never completes | Function hit the **60 s Hobby limit**. Upgrade to **Vercel Pro** (`maxDuration: 300` is already set). |
| `401 invalid x-api-key` during a review | `ANTHROPIC_API_KEY` missing/typo'd in Vercel, or set in the wrong environment. Fix it and **redeploy**. |
| `404 PGRST205 "Could not find the table … in schema cache"` | `public` not in Supabase **Settings → API → Data API → Exposed schemas**. Add it and save. |
| `relation "review_sessions" does not exist` | Migrations weren't applied to the project your keys point at. Re-run both migration files in that project. |
| Upload works but review fails immediately | Usually the service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is wrong/missing — the detached pipeline can't write results. Check the function logs in Vercel → Deployments → Logs. |
| Adversarial pass fails with no message | By design it stores only `adversarial_status='failed'`. Check Vercel function logs for `[adversarial pipeline] failed:` — usually one of the two key/schema issues above. Hit **Retry** after fixing. |
| Email signup never logs in | "Confirm email" is on but **Site URL**/redirect URLs are wrong (step 1.4), so the confirmation link is broken. Fix the URLs or disable confirmation for testing. |

---

## Quick reference — the four required env vars

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret key>
ANTHROPIC_API_KEY=<sk-ant-...>
```
