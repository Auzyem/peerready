'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Settings, CreditCard, ShieldCheck, Key, type LucideIcon } from 'lucide-react'
import { shouldShowProBadge } from '@/lib/plan/badge'

interface NavItem { label: string; href: string; icon: LucideIcon; badge?: boolean }

const WORKSPACE: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Manuscripts', href: '/manuscripts', icon: FileText },
]
const ACCOUNT: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'API keys', href: '/settings/api-keys', icon: Key },
  { label: 'Billing', href: '/billing', icon: CreditCard, badge: true },
]

interface SidebarProps {
  name?: string
  careerStage?: string
  plan?: string
  isAdmin?: boolean
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

export function Sidebar({ name, careerStage, plan, isAdmin }: SidebarProps) {
  const pathname = usePathname()
  const showPro = shouldShowProBadge(plan)

  const renderItem = (item: NavItem) => {
    // Exact match for /settings so it isn't also highlighted on /settings/api-keys.
    const active = item.href === '/settings' ? pathname === '/settings' : pathname.startsWith(item.href)
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
        <div className="text-[17px] font-semibold tracking-tight text-white">PeerReady</div>
        <div className="mt-0.5 text-[11px] text-white/40">AI peer review platform</div>
      </div>

      <nav className="py-3">
        <div className="px-4 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-white/30">Workspace</div>
        {WORKSPACE.map(renderItem)}
      </nav>

      <nav className="border-t border-white/[0.06] py-3">
        <div className="px-4 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-white/30">Account</div>
        {ACCOUNT.map(renderItem)}
        {isAdmin && (
          <Link
            href="/admin"
            className={`relative flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
              pathname.startsWith('/admin') ? 'bg-white/10 font-medium text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90'
            }`}
          >
            {pathname.startsWith('/admin') && <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r bg-pr-teal" />}
            <ShieldCheck className="h-[15px] w-[15px]" />
            <span className="flex-1">Admin panel</span>
            <span className="rounded bg-[#E24B4A] px-1.5 py-0.5 text-[9px] font-medium text-white">ADMIN</span>
          </Link>
        )}
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
