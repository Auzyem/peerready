'use client'
import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Plan {
  id: string
  name: string
  price_monthly_usd?: number
  price_annual_monthly_usd?: number
  annual_discount_pct?: number
  max_manuscripts?: number
  max_reviews_per_month?: number
  adversarial_access?: boolean
  journal_matching?: boolean
  pdf_reports?: boolean
  api_access?: boolean
  [key: string]: unknown
}

export function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Plan>>({})
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/plans')
      .then(r => r.json())
      .then(({ plans: p }) => {
        const list: Plan[] = p ?? []
        setPlans(list)
        const init: Record<string, Plan> = {}
        list.forEach(pl => { init[pl.id] = { ...pl } })
        setEdits(init)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const change = (planId: string, field: string, value: unknown) => {
    setEdits(prev => ({ ...prev, [planId]: { ...prev[planId], [field]: value } }))
  }

  const save = async (planId: string) => {
    setSaving(planId)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, updates: edits[planId] }),
      })
      const text = await res.text()
      let data: { error?: string } = {}
      try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setToast(`${edits[planId]?.name ?? planId} plan updated`)
    } catch (e) {
      setToast(`Error: ${e instanceof Error ? e.message : 'Update failed'}`)
    }
    setSaving(null)
  }

  const numField = (planId: string, field: keyof Plan, label: string, suffix = '') => (
    <div className="mb-2.5">
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={(edits[planId]?.[field] as number | undefined) ?? ''}
          onChange={e => change(planId, field as string, e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        {suffix && <span className="whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )

  const textField = (planId: string, field: keyof Plan, label: string) => (
    <div className="mb-2.5">
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <input
        type="text"
        value={(edits[planId]?.[field] as string | undefined) ?? ''}
        onChange={e => change(planId, field as string, e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      />
    </div>
  )

  const boolField = (planId: string, field: keyof Plan, label: string) => (
    <label className="mb-2 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={!!edits[planId]?.[field]}
        onChange={e => change(planId, field as string, e.target.checked)}
        className="h-3.5 w-3.5"
      />
      {label}
    </label>
  )

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading plans…</div>

  return (
    <div>
      {toast && (
        <div className="mb-4 rounded-md bg-pr-teal/10 px-4 py-2.5 text-sm text-pr-teal">
          {toast}
          <button onClick={() => setToast(null)} className="ml-2">×</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map(plan => (
          <Card key={plan.id} className="p-4">
            <div className="mb-3 text-sm font-medium text-pr-navy">{plan.name} plan</div>
            {textField(plan.id, 'name', 'Plan name')}
            {numField(plan.id, 'price_monthly_usd', 'Monthly price (USD)', '$/mo')}
            {numField(plan.id, 'price_annual_monthly_usd', 'Annual price per month (USD)', '$/mo')}
            {numField(plan.id, 'annual_discount_pct', 'Annual discount (%)', '%')}
            {numField(plan.id, 'max_manuscripts', 'Max manuscripts')}
            {numField(plan.id, 'max_reviews_per_month', 'Max reviews/month')}
            <div className="mb-3 mt-3 border-t pt-3">
              {boolField(plan.id, 'adversarial_access', 'Adversarial review')}
              {boolField(plan.id, 'journal_matching', 'Journal matching')}
              {boolField(plan.id, 'pdf_reports', 'PDF reports')}
              {boolField(plan.id, 'api_access', 'API access')}
            </div>
            <Button onClick={() => save(plan.id)} disabled={saving === plan.id} className="w-full" size="sm">
              {saving === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
