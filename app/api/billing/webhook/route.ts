import { NextRequest, NextResponse } from 'next/server'
import { stripe, planIdFromPriceId, intervalFromPriceId } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'

// Stripe SDK type drift: these fields exist at runtime but may not be on the
// pinned Subscription type. Intersect to read them build-safely.
type SubWithPeriod = Stripe.Subscription & {
  current_period_end: number
  cancel_at_period_end: boolean
  trial_end: number | null
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id
  if (!userId) {
    // Subscriptions created outside our checkout flow (e.g. the Stripe dashboard)
    // won't carry our metadata — surface it rather than dropping silently.
    console.warn(`[stripe webhook] subscription ${subscription.id} has no supabase_user_id metadata; skipping sync`)
    return
  }

  const s = subscription as SubWithPeriod
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  const planId = planIdFromPriceId(priceId)
  const interval = intervalFromPriceId(priceId)

  const status =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'canceled'
      ? 'canceled'
      : 'past_due'

  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      plan_id: planId,
      status,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      billing_interval: interval,
      current_period_end: new Date(s.current_period_end * 1000).toISOString(),
      cancel_at_period_end: s.cancel_at_period_end,
      trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id
  if (!userId) return
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin
    .from('subscriptions')
    .update({
      plan_id: 'free',
      status: 'free',
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  // Idempotency — insert first and let the unique constraint on stripe_event_id
  // arbitrate. This closes the concurrent-retry window a select-then-insert leaves
  // open (Stripe retries are common). A unique violation (23505) means we've already
  // processed this event, so we skip the handlers.
  const { error: insertError } = await supabaseAdmin.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    user_id: (event.data.object as { metadata?: { supabase_user_id?: string } })?.metadata?.supabase_user_id ?? null,
  })
  if (insertError) {
    if (insertError.code === '23505') return NextResponse.json({ ok: true, skipped: true })
    // Any other insert failure is unexpected — log and stop before double-processing.
    console.error('[stripe webhook] failed to record event:', insertError.message)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const sessionObj = event.data.object as Stripe.Checkout.Session
      if (sessionObj.mode === 'subscription' && sessionObj.subscription) {
        const sub = await stripe.subscriptions.retrieve(sessionObj.subscription as string)
        await syncSubscription(sub)
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await syncSubscription(event.data.object as Stripe.Subscription)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        await syncSubscription(sub)
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ ok: true })
}
