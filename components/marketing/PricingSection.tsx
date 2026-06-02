'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'

type Interval = 'monthly' | 'annual'

interface DbPlan {
  id: string
  name: string
  price_monthly_usd: number | null
  price_annual_monthly_usd: number | null
  annual_discount_pct: number | null
}

const FEATURES: Record<string, string[]> = {
  free: ['3 manuscripts', '2 reviews / month', 'Score breakdown', 'Inline annotations'],
  starter: ['20 manuscripts', '10 reviews / month', 'Journal matching', 'PDF reports'],
  pro: ['100 manuscripts', '30 reviews / month', 'Adversarial review', '7-day free trial'],
  team: ['Unlimited manuscripts', 'Unlimited reviews', 'Team members', 'API access'],
}
const HIGHLIGHT = 'pro'

export function PricingSection() {
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [interval, setInterval] = useState<Interval>('monthly')

  useEffect(() => {
    fetch('/api/billing/plans')
      .then(r => r.json())
      .then(({ plans: p }) => setPlans(p ?? []))
      .catch(() => setPlans([]))
  }, [])

  return (
    <section id="pricing" className="border-t bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Pricing</div>
          <h2 className="mt-2 text-3xl font-bold">Simple, transparent pricing</h2>
          <p className="mx-auto mt-2 max-w-2xl text-slate-600">
            Start free. Upgrade when you need more reviews, adversarial analysis, or team access.
          </p>

          {/* Interval toggle */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border bg-white px-4 py-1.5">
            <span className={`text-sm ${interval === 'monthly' ? 'font-medium text-slate-900' : 'text-slate-500'}`}>Monthly</span>
            <button
              onClick={() => setInterval(i => (i === 'monthly' ? 'annual' : 'monthly'))}
              className={`relative h-6 w-11 rounded-full transition-colors ${interval === 'annual' ? 'bg-indigo-600' : 'bg-slate-300'}`}
              aria-label="Toggle billing interval"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${interval === 'annual' ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className={`text-sm ${interval === 'annual' ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
              Annual <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">Save up to 35%</span>
            </span>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map(plan => {
            const monthly = plan.price_monthly_usd ?? 0
            const annualMonthly = plan.price_annual_monthly_usd ?? 0
            const annualTotal = annualMonthly * 12
            const discount = plan.annual_discount_pct ?? 0
            const highlight = plan.id === HIGHLIGHT
            return (
              <div key={plan.id} className={`relative flex flex-col rounded-xl border bg-white p-6 ${highlight ? 'border-2 border-indigo-600 shadow-md' : ''}`}>
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-medium text-white">
                    Most popular
                  </div>
                )}
                <div className="text-base font-semibold">{plan.name}</div>
                <div className="mt-3">
                  {interval === 'monthly' ? (
                    <>
                      <span className="text-3xl font-bold">${monthly}</span>
                      {monthly > 0 && <span className="text-sm text-slate-500">/mo</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">${annualMonthly}</span>
                      <span className="text-sm text-slate-500">/mo</span>
                      {annualTotal > 0 && (
                        <div className="mt-1 text-[17px] font-bold tracking-tight text-slate-900">
                          ${annualTotal.toFixed(2)}
                          <span className="text-xs font-normal text-slate-500"> billed annually</span>
                        </div>
                      )}
                      {discount > 0 && (
                        <div className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          Save {discount}% vs monthly
                        </div>
                      )}
                    </>
                  )}
                </div>
                <ul className="mt-4 mb-6 flex-1 space-y-2">
                  {(FEATURES[plan.id] ?? []).map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`w-full rounded-md px-4 py-2 text-center text-sm font-medium ${highlight ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border text-slate-700 hover:bg-slate-50'}`}
                >
                  {plan.id === 'free' ? 'Get started free' : `Choose ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          All plans include core AI review and XLSX export. Prices in USD. Cancel anytime.
        </p>
      </div>
    </section>
  )
}
