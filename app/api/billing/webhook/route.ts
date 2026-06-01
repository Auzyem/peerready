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
  if (!userId) return

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

  // Idempotency — skip events we've already processed.
  const { data: existing } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single()
  if (existing) return NextResponse.json({ ok: true, skipped: true })

  await supabaseAdmin.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    user_id: (event.data.object as { metadata?: { supabase_user_id?: string } })?.metadata?.supabase_user_id ?? null,
  })

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
