'use client'
import { useCallback, useState } from 'react'

/**
 * Optimistic resolve/unresolve toggle for annotations or adversarial critiques.
 * Keeps local overrides merged over the server-provided `resolved` flag, so a
 * background poll reflecting server truth doesn't clobber an in-flight change.
 *
 * @param basePath e.g. '/api/annotations' — the row id is appended.
 */
export function useResolve(basePath: string) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const toggle = useCallback(
    async (id: string, current: boolean) => {
      const next = !current
      setOverrides(o => ({ ...o, [id]: next }))
      setPending(p => ({ ...p, [id]: true }))
      try {
        const res = await fetch(`${basePath}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolved: next }),
        })
        if (!res.ok) throw new Error('request failed')
      } catch {
        setOverrides(o => ({ ...o, [id]: current })) // revert on failure
      } finally {
        setPending(p => ({ ...p, [id]: false }))
      }
    },
    [basePath]
  )

  const isResolved = (id: string, fallback: boolean) => overrides[id] ?? fallback
  const isPending = (id: string) => !!pending[id]
  return { toggle, isResolved, isPending }
}
