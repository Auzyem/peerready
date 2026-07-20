
# ScholarLens — Brand Foundation + Sidebar (Phase 3) Design

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan
**Source:** `scholarlens-v2-upgrade-prompt.md` UPGRADE 1 (design system) + UPGRADE 2 (sidebar), adapted to the codebase's Tailwind/shadcn idiom (the spec shipped inline styles + raw CSS variables). First slice of the deferred design-system cycle.

## Context

The app styles everything through **shadcn semantic tokens** — HSL CSS va

riables in
`app/globals.css` (`--primary`, `--muted`, `--border`, `--destructive`, …) mapped to Tailwind
colors in `tailwind.config.ts`. Every component (Button, Card, Badge, inputs, the current
sidebar) consumes those tokens. Remapping the variable *values* rebrands the whole app from one
file, with almost no per-component edits. Today the palette is the default greyscale shadcn set;
there is no theme toggle and the app renders light.

This cycle is the **first slice** of the design-system work: brand tokens (both themes) + a
light/dark toggle + the navy sidebar. The review-page vertical-nav layout (UPGRADE 3/5) is a
**separate, later cycle**.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Token strategy | **Remap the shadcn semantic tokens** to the navy/teal palette (central rebrand), plus additive `pr-*` brand utilities for theme-independent spots |
| Sidebar | **Treatment A** — navy rail in both themes, teal active accent, Workspace/Account sections, user footer |
| Dark mode | **Keep it, brand-tuned**, and add a **light/dark toggle with dark as the default** |
| Toggle mechanism | **`next-themes`** (`attribute="class"`, `defaultTheme="dark"`, SSR no-flash) |
| Pro badge | Shown **only when plan ∈ {free, starter}** (upsell); hidden for pro/team |
| Sign-out | Stays in **TopBar**; sidebar footer is identity-only (no duplicate) |
| Theme toggle location | **TopBar** (sun/moon) |
| Dot-menus (spec U2) | **Dropped** — they were no-op placeholders (YAGNI) |

## Architecture

A single token layer drives the rebrand; the sidebar is the one surface intentionally fixed to
navy across themes; `next-themes` owns theme state.

### 1. Theming foundation
- **`app/globals.css`** — rewrite both token blocks (keep the existing variable *names* so all
  components keep working):
  - `:root` (light): `--primary` = navy `#0D1B4B`; `--accent`/`--ring` = teal `#0E7C6B`;
    `--background` `#F8FAFC`, `--card` `#FFFFFF`, `--border` `#E2E8F0`, `--muted` slate-100,
    `--muted-foreground` `#64748B`, `--foreground` `#0F172A`; `--destructive` = brand red `#B91C1C`.
    Values stored as HSL triples (the `hsl(var(--x))` mapping in `tailwind.config.ts` is unchanged).
  - `.dark`: deep navy-slate `--background` (~`#0B1220`), lifted `--card` (~`#111A2E`),
    `--border` ~slate-800, light `--foreground`; `--primary` stays navy-family but lightened for
    contrast on dark surfaces, teal `--accent`/`--ring` preserved.
  - Import **Inter** (`@import url(...Inter...)`) and set `font-family` on `body`.
- **`tailwind.config.ts`** — extend `theme.colors` with additive brand utilities:
  `pr-navy`, `pr-navy-hover`, `pr-teal`, `pr-teal-light`, `pr-gold`, `pr-gold-light`,
  `pr-green`, `pr-green-light`, `pr-red`, `pr-red-light` (literal hex, theme-independent). Used by
  the always-navy sidebar and semantic status chips. Existing semantic-token mappings untouched.
- **`app/layout.tsx`** — wrap children in a `next-themes` `ThemeProvider`
  (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`); add
  `suppressHydrationWarning` to `<html>`. Add `next-themes` dependency.
- **`components/layout/ThemeToggle.tsx`** (new, client) — sun/moon button using
  `useTheme()`; rendered in the TopBar. Guards against hydration mismatch (render after mount).

### 2. Sidebar (navy, treatment A)
- **`components/layout/Sidebar.tsx`** → **client component** (`'use client'`, `usePathname`).
  - Navy (`pr-navy`) rail, Inter, logo block ("ScholarLens" / "AI peer review platform").
  - Sections: **Workspace** → Dashboard (`/dashboard`), Manuscripts (`/manuscripts`);
    **Account** → Settings (`/settings`), Billing (`/billing`).
  - Active item (matched via `pathname.startsWith(href)`): teal left-bar + lifted translucent
    background + white text.
  - User footer: avatar initials, name, career stage.
  - Pro badge on Billing only when `shouldShowProBadge(plan)`.
  - Props: `{ name?: string; careerStage?: string; plan: string }`.
- **`lib/plan/badge.ts`** (new, pure, unit-tested) — `shouldShowProBadge(plan: string): boolean`
  → `plan === 'free' || plan === 'starter'`.
- **`app/(dashboard)/layout.tsx`** — already loads `user`; additionally read the `profiles`
  row (`full_name`, `career_stage`) and the `subscriptions` row (`plan_id`), and pass
  `name`/`careerStage`/`plan` to `<Sidebar>`.
- **`components/layout/TopBar.tsx`** — keep email + sign-out; add `<ThemeToggle>`.

## Data flow
`next-themes` sets/reads the `dark` class on `<html>` (persisted to localStorage, default dark,
no SSR flash). Tailwind's `darkMode: ["class"]` makes every `dark:`-less component restyle purely
from the swapped CSS-variable values. The dashboard layout fetches identity + plan server-side and
passes them to the client Sidebar; the Pro badge derives from `shouldShowProBadge(plan)`.

## Error handling
Missing profile/subscription → Sidebar falls back to no name / `plan = 'free'` (badge shows).
`ThemeToggle` renders nothing until mounted to avoid a hydration mismatch. Token rewrite is
purely presentational — no data paths change.

## Testing
- Unit (`tests/proBadge.test.ts`): `shouldShowProBadge` for free/starter (true) and pro/team (false).
- `npm run build` gates every commit (house rule; `npm test` is lenient).
- Manual: first visit defaults to **dark**; toggle flips theme and persists across reload; sidebar
  active state tracks the route; Pro badge shows for a free user, hides for pro; spot-check
  dashboard / manuscripts / review / billing / login in both themes for contrast regressions.

## Out of scope (deferred)
- Review-page vertical-nav layout + stage-tracker chrome (UPGRADE 3/5) — next cycle.
- Per-component visual polish beyond what the token remap delivers.
- System-preference theme detection (`enableSystem` off; dark is the deliberate default).

## Notes
- Add `.superpowers/` to `.gitignore` (visual-companion mockups) before committing.
