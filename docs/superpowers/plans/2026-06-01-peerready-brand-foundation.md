# Brand Foundation + Sidebar (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the app to the navy/teal palette via a central token remap, add a dark-default light/dark toggle, and ship the navy sidebar (treatment A) — without restructuring any working surface.

**Architecture:** Rewrite the shadcn semantic CSS variables in `app/globals.css` for both themes (component code is untouched and rebrands automatically). Wire the already-loaded Inter font through Tailwind's `fontFamily.sans`. Add `next-themes` (dark default) with a TopBar toggle. Rebuild the Sidebar as a navy client component fed identity + plan from the dashboard layout.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind + shadcn, `next-themes`, Vitest (node).

**Source spec:** `docs/superpowers/specs/2026-06-01-scholarlens-brand-foundation-design.md`.

**House rules:** gate every commit on `npm run build` (`npm test` is lenient). Branch `feat/design-foundation` (already checked out; spec already committed there).

**Key codebase facts (verified):**
- Tokens live in `app/globals.css` (`:root` + `.dark`), mapped to Tailwind colors in `tailwind.config.ts` via `hsl(var(--x))`. `darkMode: ["class"]`.
- Inter is already loaded in `app/layout.tsx` via `next/font/google` exposing `--font-sans`, but nothing currently applies it as the font-family.
- The dashboard layout (`app/(dashboard)/layout.tsx`) already loads the user and renders `<Sidebar/>` + `<TopBar email=…/>`.
- `next-themes` is NOT yet installed.

---

## File Structure

**Create:**
- `components/theme-provider.tsx` — client wrapper around `next-themes` `ThemeProvider`
- `components/layout/ThemeToggle.tsx` — sun/moon toggle (client)
- `lib/plan/badge.ts` — pure `shouldShowProBadge(plan)`
- `tests/proBadge.test.ts` — unit test

**Modify:**
- `package.json` — add `next-themes` (via npm)
- `app/globals.css` — rewrite `:root` + `.dark` token values to the brand palette
- `tailwind.config.ts` — add `fontFamily.sans` + `pr-*` brand color utilities
- `app/layout.tsx` — wrap in `ThemeProvider`, `suppressHydrationWarning` on `<html>`
- `components/layout/Sidebar.tsx` — navy client sidebar (treatment A)
- `components/layout/TopBar.tsx` — add `<ThemeToggle/>`
- `app/(dashboard)/layout.tsx` — fetch profile + plan, pass to `<Sidebar/>`

---

## Task 1: Install next-themes + Tailwind theme (font + brand colors)

**Files:** `package.json`, `tailwind.config.ts`

- [ ] **Step 1: Install next-themes**

Run: `npm install next-themes`
Expected: package added cleanly.

- [ ] **Step 2: Add `fontFamily.sans` and brand colors to `tailwind.config.ts`**

In `tailwind.config.ts`, inside `theme.extend`, the current `extend` opens with `colors: { … }`. Add a `fontFamily` key and extend `colors` with the `pr-*` brand utilities. Concretely, change the start of `extend` from:
```ts
    extend: {
      colors: {
        background: "hsl(var(--background))",
```
to:
```ts
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        "pr-navy": "#0D1B4B",
        "pr-navy-hover": "#16277A",
        "pr-teal": "#0E7C6B",
        "pr-teal-hover": "#0A6358",
        "pr-teal-light": "#E6F4F1",
        "pr-gold": "#C57B00",
        "pr-gold-light": "#FEF3C7",
        "pr-green": "#15803D",
        "pr-green-light": "#DCFCE7",
        "pr-red": "#B91C1C",
        "pr-red-light": "#FEE2E2",
        background: "hsl(var(--background))",
```
(Leave the rest of `colors`, `borderRadius`, `keyframes`, `animation`, and `plugins` unchanged.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (Tailwind picks up the new font + colors; nothing references them yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tailwind.config.ts
git commit -m "chore: add next-themes + brand colors and Inter font-family to Tailwind"
```

---

## Task 2: Brand token palette (light + dark)

**Files:** `app/globals.css`

**Note:** Keep the variable *names* identical so every shadcn component rebrands automatically. Values are HSL triples (no `hsl()` wrapper — the Tailwind mapping adds it). The navy sidebar uses `pr-*` utilities, not these tokens, so it stays navy in both themes. No Inter `@import` — Inter is already loaded via `next/font` and now applied through `fontFamily.sans` (Task 1).

- [ ] **Step 1: Replace the `@layer base` `:root` and `.dark` blocks**

In `app/globals.css`, replace the entire `@layer base { :root { … } .dark { … } }` block (the first `@layer base`) with:
```css
@layer base {
  :root {
    --background: 210 40% 98%;        /* #F8FAFC slate-50 */
    --foreground: 222 47% 11%;        /* #0F172A slate-900 */
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary: 230 70% 17%;           /* #0D1B4B navy */
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96%;         /* slate-100 */
    --secondary-foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;  /* #64748B slate-500 */
    --accent: 168 80% 27%;            /* #0E7C6B teal */
    --accent-foreground: 0 0% 100%;
    --destructive: 0 74% 42%;         /* #B91C1C */
    --destructive-foreground: 0 0% 100%;
    --border: 214 32% 91%;            /* #E2E8F0 slate-200 */
    --input: 214 32% 91%;
    --ring: 168 80% 27%;              /* teal */
    --chart-1: 168 80% 27%;
    --chart-2: 230 70% 17%;
    --chart-3: 38 100% 39%;
    --chart-4: 142 72% 29%;
    --chart-5: 217 91% 60%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222 47% 8%;          /* deep navy-slate ~#0B1220 */
    --foreground: 210 40% 96%;
    --card: 222 44% 12%;               /* ~#111A2E lifted */
    --card-foreground: 210 40% 96%;
    --popover: 222 44% 12%;
    --popover-foreground: 210 40% 96%;
    --primary: 217 60% 70%;            /* lightened navy/blue for contrast on dark */
    --primary-foreground: 222 47% 11%;
    --secondary: 217 33% 18%;
    --secondary-foreground: 210 40% 96%;
    --muted: 217 33% 18%;
    --muted-foreground: 215 20% 65%;
    --accent: 168 64% 42%;             /* brighter teal on dark */
    --accent-foreground: 222 47% 11%;
    --destructive: 0 63% 50%;
    --destructive-foreground: 210 40% 98%;
    --border: 217 33% 22%;
    --input: 217 33% 22%;
    --ring: 168 64% 42%;
    --chart-1: 168 64% 42%;
    --chart-2: 217 60% 70%;
    --chart-3: 38 92% 55%;
    --chart-4: 142 60% 45%;
    --chart-5: 217 91% 60%;
  }
}
```
Leave the second `@layer base { * { @apply border-border } body { … } }` block as-is.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: brand-tuned token palette for light + dark"
```

---

## Task 3: Theme provider + dark default

**Files:** Create `components/theme-provider.tsx`; modify `app/layout.tsx`

- [ ] **Step 1: Create the provider wrapper**

Create `components/theme-provider.tsx`:
```tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 2: Wrap the root layout**

Replace the body of `app/layout.tsx`'s returned JSX. The current return is:
```tsx
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
```
Replace it with:
```tsx
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
```
And add this import near the top of `app/layout.tsx` (after the existing imports):
```tsx
import { ThemeProvider } from "@/components/theme-provider";
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/theme-provider.tsx app/layout.tsx
git commit -m "feat: next-themes provider with dark default"
```

---

## Task 4: Theme toggle in the TopBar

**Files:** Create `components/layout/ThemeToggle.tsx`; modify `components/layout/TopBar.tsx`

- [ ] **Step 1: Create the toggle**

Create `components/layout/ThemeToggle.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Avoid a hydration mismatch: render a stable placeholder until mounted.
  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled />
  }

  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
```

- [ ] **Step 2: Add it to the TopBar**

In `components/layout/TopBar.tsx`, add the import after the existing `Button` import:
```tsx
import { ThemeToggle } from './ThemeToggle'
```
Then change the right-hand side of the header. The current markup is:
```tsx
      <div className="text-sm text-muted-foreground">{email}</div>
      <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
```
Replace with:
```tsx
      <div className="text-sm text-muted-foreground">{email}</div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
      </div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/layout/ThemeToggle.tsx components/layout/TopBar.tsx
git commit -m "feat: light/dark theme toggle in TopBar"
```

---

## Task 5: Pro-badge visibility helper

**Files:** Create `lib/plan/badge.ts`; Test `tests/proBadge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/proBadge.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shouldShowProBadge } from '@/lib/plan/badge'

describe('shouldShowProBadge', () => {
  it('shows for plans below pro (upsell)', () => {
    expect(shouldShowProBadge('free')).toBe(true)
    expect(shouldShowProBadge('starter')).toBe(true)
  })
  it('hides for pro and team', () => {
    expect(shouldShowProBadge('pro')).toBe(false)
    expect(shouldShowProBadge('team')).toBe(false)
  })
  it('shows for unknown/missing plan (treat as free)', () => {
    expect(shouldShowProBadge(undefined)).toBe(true)
    expect(shouldShowProBadge('')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proBadge.test.ts`
Expected: FAIL — `Cannot find module '@/lib/plan/badge'`.

- [ ] **Step 3: Write the implementation**

Create `lib/plan/badge.ts`:
```ts
// The "Pro" upsell badge shows for plans below Pro; pro/team hide it.
export function shouldShowProBadge(plan: string | undefined | null): boolean {
  return plan !== 'pro' && plan !== 'team'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proBadge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/plan/badge.ts tests/proBadge.test.ts
git commit -m "feat: Pro-badge visibility helper"
```

---

## Task 6: Navy sidebar (treatment A)

**Files:** `components/layout/Sidebar.tsx` (full rewrite)

**Note:** Uses `pr-*` brand utilities (navy/teal) so it stays navy in both themes. Client component for active-state via `usePathname`. Identity + plan arrive as props (Task 7 supplies them).

- [ ] **Step 1: Rewrite the Sidebar**

Replace the entire contents of `components/layout/Sidebar.tsx` with:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Settings, CreditCard, type LucideIcon } from 'lucide-react'
import { shouldShowProBadge } from '@/lib/plan/badge'

interface NavItem { label: string; href: string; icon: LucideIcon; badge?: boolean }

const WORKSPACE: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Manuscripts', href: '/manuscripts', icon: FileText },
]
const ACCOUNT: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Billing', href: '/billing', icon: CreditCard, badge: true },
]

interface SidebarProps {
  name?: string
  careerStage?: string
  plan?: string
}

function initials(name?: string): string {
  if (!name) return 'PR'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'PR'
}

const STAGE_LABEL: Record<string, string> = {
  phd_student: 'PhD candidate',
  postdoc: 'Postdoc',
  junior_faculty: 'Junior faculty',
  senior_faculty: 'Senior faculty',
  independent: 'Independent researcher',
}

export function Sidebar({ name, careerStage, plan }: SidebarProps) {
  const pathname = usePathname()
  const showPro = shouldShowProBadge(plan)

  const renderItem = (item: NavItem) => {
    const active = pathname.startsWith(item.href)
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`relative flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
          active ? 'bg-white/10 font-medium text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90'
        }`}
      >
        {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r bg-pr-teal" />}
        <Icon className="h-[15px] w-[15px]" />
        <span className="flex-1">{item.label}</span>
        {item.badge && showPro && (
          <span className="rounded bg-pr-teal px-1.5 py-0.5 text-[10px] font-medium text-white">Pro</span>
        )}
      </Link>
    )
  }

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-pr-navy">
      <div className="border-b border-white/[0.08] px-4 pb-4 pt-5">
        <div className="text-[17px] font-semibold tracking-tight text-white">ScholarLens</div>
        <div className="mt-0.5 text-[11px] text-white/40">AI peer review platform</div>
      </div>

      <nav className="py-3">
        <div className="px-4 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-white/30">Workspace</div>
        {WORKSPACE.map(renderItem)}
      </nav>

      <nav className="border-t border-white/[0.06] py-3">
        <div className="px-4 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-white/30">Account</div>
        {ACCOUNT.map(renderItem)}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/[0.06] px-4 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pr-teal text-[11px] font-medium text-white">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-white">{name ?? 'Your account'}</div>
          <div className="text-[10px] text-white/40">{careerStage ? (STAGE_LABEL[careerStage] ?? careerStage) : 'Researcher'}</div>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. All `SidebarProps` are optional, so the dashboard layout's existing `<Sidebar />` call (no props yet — Task 7 adds them) still compiles.

- [ ] **Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: navy branded sidebar (treatment A)"
```

---

## Task 7: Feed identity + plan to the Sidebar

**Files:** `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Fetch profile + plan and pass props**

Replace the entire body of `app/(dashboard)/layout.tsx` with:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

// Authenticated pages depend on per-request cookies; never statically prerender.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from('profiles').select('full_name, career_stage').eq('id', user.id).single(),
    supabase.from('subscriptions').select('plan_id').eq('user_id', user.id).single(),
  ])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        name={profile?.full_name ?? undefined}
        careerStage={profile?.career_stage ?? undefined}
        plan={sub?.plan_id ?? 'free'}
      />
      <div className="flex flex-1 flex-col">
        <TopBar email={user.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: feed profile + plan to sidebar"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: All suites pass, including `tests/proBadge.test.ts` (3 tests). Total should be the prior 62 + 3 = 65.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles with no type errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, then verify:
- First visit (clear localStorage) renders in **dark** mode by default; no light-mode flash on reload.
- The TopBar sun/moon toggle flips light↔dark and the choice persists across a reload.
- The sidebar is navy in both themes; the active route shows the teal left-bar + lifted background; clicking nav items navigates.
- The user footer shows initials + name + career stage.
- The "Pro" badge on Billing shows for a free/starter user and is hidden for a pro/team user.
- Spot-check dashboard, manuscripts, a review page, billing, and login: buttons are navy, accents/rings teal, no unreadable contrast in either theme.

- [ ] **Step 4: Final commit (if any stray changes)**

```bash
git add -A
git commit -m "chore: brand foundation verification pass"
```

---

## Deferred (not in this plan)
- Review-page vertical-nav layout + stage-tracker chrome (UPGRADE 3/5) — next cycle.
- Folding sign-out into the sidebar footer (kept in TopBar for now).
- System-preference theme detection (dark is the deliberate default).
