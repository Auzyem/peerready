'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, CreditCard, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Interval = 'monthly' | 'annual'

const PLANS = [
  { id: 'free', name: 'Free', price: { monthly: 0, annual: 0 }, description: 'Try the core review engine',
    features: ['3 manuscripts', '2 reviews per month', 'Score breakdown', 'Inline annotations'], cta: 'Current plan', highlight: false },
  { id: 'starter', name: 'Starter', price: { monthly: 12, annual: 8 }, description: 'For active PhD students',
    features: ['20 manuscripts', '10 reviews per month', 'Journal matching', 'PDF reports', 'Send to author'], cta: 'Upgrade to Starter', highlight: false },
  { id: 'pro', name: 'Pro', price: { monthly: 29, annual: 19 }, description: 'For serious researchers',
    features: ['100 manuscripts', '30 reviews per month', 'Adversarial review', 'Journal matching', 'PDF reports', '7-day free trial'], cta: 'Start Pro trial', highlight: true },
  { id: 'team', name: 'Team', price: { monthly: 79, annual: 59 }, description: 'For labs and departments',
    features: ['Unlimited manuscripts', 'Unlimited reviews', 'All Pro features', 'Team members', 'Admin dashboard', 'API access'], cta: 'Upgrade to Team', highlight: false },
] as const

export default function BillingPage() {
  const searchParams = useSearchParams()
  const [interval, setBillingInterval] = useState<Interval>('monthly')
  const [currentPlan, setCurrentPlan] = useState('free')
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [cancelAtEnd, setCancelAtEnd] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  useEffect(() => {
    async function fetchCurrent() {
      const res = await fetch('/api/billing/current')
      const d = await res.json()
      setCurrentPlan(d.plan ?? 'free')
      setPeriodEnd(d.periodEnd ?? null)
      setCancelAtEnd(d.cancelAtEnd ?? false)
    }
    fetchCurrent()
    if (success) setToast({ type: 'success', message: 'Subscription activated — welcome!' })
    if (canceled) setToast({ type: 'error', message: 'Checkout canceled — no charge made.' })
  }, [success, canceled])

  async function handleUpgrade(planId: string) {
    if (planId === 'free' || planId === currentPlan) return
    setLoading(planId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Checkout failed' })
      setLoading(null)
    }
  }

  async function handleManage() {
    setManaging(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not open portal' })
      setManaging(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {toast && (
        <div
          className={`mb-6 flex items-center justify-between rounded-md border px-4 py-2 text-sm ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {toast.message}
          <button onClick={() => setToast(null)} className="text-base leading-none">×</button>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Billing &amp; plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {currentPlan !== 'free'
            ? `You are on the ${currentPlan[0].toUpperCase() + currentPlan.slice(1)} plan${cancelAtEnd ? ' · Cancels at period end' : ''}${periodEnd ? ` · Renews ${new Date(periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
            : 'You are on the Free plan.'}
        </p>
      </div>

      {currentPlan !== 'free' && (
        <Card className="mb-8 flex items-center gap-4 p-4">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Manage your subscription</div>
            <div className="text-sm text-muted-foreground">Update payment method, download invoices, or cancel</div>
          </div>
          <Button onClick={handleManage} disabled={managing}>
            {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {managing ? 'Opening…' : 'Manage billing'}
          </Button>
        </Card>
      )}

      <div className="mb-6 flex items-center gap-3">
        <span className={`text-sm ${interval === 'monthly' ? 'font-medium' : 'text-muted-foreground'}`}>Monthly</span>
        <button
          onClick={() => setBillingInterval((i) => (i === 'monthly' ? 'annual' : 'monthly'))}
          className={`relative h-6 w-11 rounded-full transition-colors ${interval === 'annual' ? 'bg-primary' : 'bg-muted'}`}
          aria-label="Toggle billing interval"
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${interval === 'annual' ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
        <span className={`text-sm ${interval === 'annual' ? 'font-medium' : 'text-muted-foreground'}`}>
          Annual <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs">Up to 35% off</span>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <Card key={plan.id} className={`relative flex flex-col p-5 ${plan.highlight ? 'border-2 border-primary' : ''}`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Most popular
                </div>
              )}
              <div className="mb-3">
                <div className="text-base font-medium">{plan.name}</div>
                <div className="text-sm text-muted-foreground">{plan.description}</div>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-semibold">${plan.price[interval]}</span>
                {plan.price.monthly > 0 && <span className="text-sm text-muted-foreground">/mo</span>}
                {interval === 'annual' && plan.price.annual > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">${plan.price.annual * 12}/yr billed annually</div>
                )}
              </div>
              <ul className="mb-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || loading === plan.id || plan.id === 'free'}
                variant={plan.highlight ? 'default' : 'outline'}
                className="w-full"
              >
                {loading === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent ? 'Current plan' : plan.cta}
              </Button>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        All plans include core AI review, inline annotations, and XLSX export. Prices in USD. Cancel anytime from the billing portal.
      </p>
    </div>
  )
}
