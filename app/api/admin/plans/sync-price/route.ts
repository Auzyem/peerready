import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe/client'
import { monthlyCents, annualCents } from '@/lib/stripe/prices'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

type Interval = 'monthly' | 'annual'

export async function POST(request: NextRequest) {
  try {
    await requirePermission('billing.edit_plans')

    const { planId, interval, unitAmountUsd } = (await request.json()) as {
      planId: string
      interval: Interval
      unitAmountUsd: number
    }

    if (!planId || planId === 'free') {
      return NextResponse.json({ error: 'A paid plan id is required' }, { status: 400 })
    }
    if (interval !== 'monthly' && interval !== 'annual') {
      return NextResponse.json({ error: 'interval must be "monthly" or "annual"' }, { status: 400 })
    }
    if (typeof unitAmountUsd !== 'number' || !Number.isFinite(unitAmountUsd) || unitAmountUsd <= 0) {
      return NextResponse.json({ error: 'unitAmountUsd must be a positive number' }, { status: 400 })
    }

    const newCents = interval === 'monthly' ? monthlyCents(unitAmountUsd) : annualCents(unitAmountUsd)
    const admin = createAdminClient()

    // Find the current active row (gives us the old price id + amount + product).
    const { data: activeRow } = await admin
      .from('plan_prices')
      .select('stripe_price_id, unit_amount')
      .eq('plan_id', planId)
      .eq('interval', interval)
      .eq('active', true)
      .maybeSingle()

    const oldPriceId: string | null = activeRow?.stripe_price_id ?? null
    const currentCents: number | null = activeRow?.unit_amount ?? null

    // Resolve the Stripe product: from the active price, else by product metadata.
    let productId: string | null = null
    if (oldPriceId) {
      const oldPrice = await stripe.prices.retrieve(oldPriceId)
      productId = typeof oldPrice.product === 'string' ? oldPrice.product : oldPrice.product?.id ?? null
    } else {
      // Pre-backfill: locate the product by metadata.peerready_plan (matches scripts/stripe-setup.mjs).
      for await (const product of stripe.products.list({ limit: 100 })) {
        if (product.active && product.metadata?.peerready_plan === planId) {
          productId = product.id
          break
        }
      }
    }
    if (!productId) {
      return NextResponse.json(
        { error: `Could not find a Stripe product for plan "${planId}"` },
        { status: 422 },
      )
    }

    const displayCol = interval === 'monthly' ? 'price_monthly_usd' : 'price_annual_monthly_usd'

    // Amount unchanged → no Stripe write. Keep the display column in sync and return.
    if (currentCents === newCents) {
      await admin.from('plans').update({ [displayCol]: unitAmountUsd }).eq('id', planId)
      return NextResponse.json({ ok: true, unchanged: true })
    }

    // 1) Create the new Stripe price FIRST. If this throws, the catch returns 500
    //    and nothing else has been written — no DB change, no display change.
    const newPrice = await stripe.prices.create({
      product: productId,
      currency: 'usd',
      unit_amount: newCents,
      recurring: { interval: interval === 'annual' ? 'year' : 'month' },
      lookup_key: `pr_${planId}_${interval}`,
      transfer_lookup_key: true, // move the stable lookup key off the old price
      metadata: { peerready_plan: planId, peerready_interval: interval },
    } as Stripe.PriceCreateParams) // Stripe SDK type drift: transfer_lookup_key exists at runtime but may not be on the pinned PriceCreateParams type

    // 2) Atomic DB swap: old active row → inactive, new active row inserted.
    const { error: swapError } = await admin.rpc('swap_plan_price', {
      p_plan_id: planId,
      p_interval: interval,
      p_stripe_price_id: newPrice.id,
      p_unit_amount: newCents,
    })
    if (swapError) throw swapError

    // 3) Update the display column so the page and Stripe never drift.
    await admin.from('plans').update({ [displayCol]: unitAmountUsd }).eq('id', planId)

    // 4) Archive the old Stripe price — best-effort. Checkout reads from the DB
    //    regardless of Stripe's active flag, so a failure here is harmless.
    if (oldPriceId) {
      try {
        await stripe.prices.update(oldPriceId, { active: false })
      } catch (e) {
        console.warn(`[sync-price] failed to archive old price ${oldPriceId}:`, e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({ ok: true, priceId: newPrice.id, unitAmount: newCents })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
