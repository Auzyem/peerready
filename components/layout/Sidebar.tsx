import Link from 'next/link'
import { FileText, LayoutDashboard, Settings } from 'lucide-react'

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
        <Link href="/settings" className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted">
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </nav>
    </aside>
  )
}
