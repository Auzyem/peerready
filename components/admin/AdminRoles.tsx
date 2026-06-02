'use client'
import { useState, useEffect } from 'react'

interface PermissionDef { id: string; label: string; description?: string; category?: string }
interface Grant { role: string; permission_id: string }

export function AdminRoles() {
  const [roles, setRoles] = useState<string[]>([])
  const [permissions, setPermissions] = useState<PermissionDef[]>([])
  const [grantSet, setGrantSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const key = (role: string, pid: string) => `${role}::${pid}`

  useEffect(() => {
    fetch('/api/admin/roles/permissions')
      .then(r => r.json())
      .then(({ roles: rs, permissions: p, grants }: { roles: string[]; permissions: PermissionDef[]; grants: Grant[] }) => {
        setRoles(rs ?? [])
        setPermissions(p ?? [])
        setGrantSet(new Set((grants ?? []).map(g => key(g.role, g.permission_id))))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = async (role: string, pid: string) => {
    if (role === 'super_admin') return
    const k = key(role, pid)
    const granted = !grantSet.has(k)
    setPending(k)
    // optimistic
    setGrantSet(prev => {
      const next = new Set(prev)
      if (granted) next.add(k); else next.delete(k)
      return next
    })
    try {
      const res = await fetch('/api/admin/roles/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permissionId: pid, granted }),
      })
      const text = await res.text()
      let data: { error?: string } = {}
      try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
    } catch (e) {
      // revert
      setGrantSet(prev => {
        const next = new Set(prev)
        if (granted) next.delete(k); else next.add(k)
        return next
      })
      setToast(`Error: ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setPending(null)
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading permissions…</div>

  const categories = Array.from(new Set(permissions.map(p => p.category ?? 'other')))

  return (
    <div>
      {toast && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {toast}
          <button onClick={() => setToast(null)} className="ml-2">×</button>
        </div>
      )}
      <p className="mb-4 text-sm text-muted-foreground">
        Toggle which permissions each role grants. <span className="font-medium">super_admin</span> always
        holds every permission and cannot be edited.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Permission</th>
              {roles.map(r => <th key={r} className="p-3 text-center font-medium">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <FragmentRows
                key={cat}
                category={cat}
                roles={roles}
                permissions={permissions.filter(p => (p.category ?? 'other') === cat)}
                grantSet={grantSet}
                pending={pending}
                toggle={toggle}
                keyFn={key}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FragmentRows({ category, roles, permissions, grantSet, pending, toggle, keyFn }: {
  category: string
  roles: string[]
  permissions: PermissionDef[]
  grantSet: Set<string>
  pending: string | null
  toggle: (role: string, pid: string) => void
  keyFn: (role: string, pid: string) => string
}) {
  return (
    <>
      <tr className="border-t bg-muted/30">
        <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {category}
        </td>
      </tr>
      {permissions.map(p => (
        <tr key={p.id} className="border-t">
          <td className="p-3">
            <div className="font-medium">{p.label}</div>
            {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
          </td>
          {roles.map(role => {
            const k = keyFn(role, p.id)
            const checked = role === 'super_admin' || grantSet.has(k)
            return (
              <td key={role} className="p-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={role === 'super_admin' || pending === k}
                  onChange={() => toggle(role, p.id)}
                  className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
