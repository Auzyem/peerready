#!/usr/bin/env node
/**
 * Seeds public.plan_prices from the six STRIPE_PRICE_* env vars, fetching each
 * price's unit_amount from Stripe. Run ONCE per environment:
 *   - locally:   node scripts/backfill-plan-prices.mjs   (uses .env.local)
 *   - prod:      run with the LIVE Stripe key + the service-role key in the env.
 *
 * Idempotent: a (plan, interval) that already has an active row is skipped, so
 * re-running is safe. Migration 013 must be applied first.
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local (KEY=VALUE) without a dependency; existing process.env wins.
try {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k] === undefined) process.env[k] = raw.replace(/^["']|["']$/g, '')
  }
} catch {
  // no .env.local — fall back to the ambient environment
}

const key = process.env.STRIPE_SECRET_KEY
if (!key || key.includes('placeholder')) {
  console.error('✗ STRIPE_SECRET_KEY is missing or a placeholder')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svc) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
  process.exit(1)
}

const stripe = new Stripe(key)
const db = createClient(url, svc, { auth: { persistSession: false } })

// (plan, interval) → env var. Mirrors lib/stripe/client.ts STRIPE_PRICES.
const ROWS = [
  { plan: 'starter', interval: 'monthly', env: 'STRIPE_PRICE_STARTER_MONTHLY' },
  { plan: 'starter', interval: 'annual',  env: 'STRIPE_PRICE_STARTER_ANNUAL' },
  { plan: 'pro',     interval: 'monthly', env: 'STRIPE_PRICE_PRO_MONTHLY' },
  { plan: 'pro',     interval: 'annual',  env: 'STRIPE_PRICE_PRO_ANNUAL' },
  { plan: 'team',    interval: 'monthly', env: 'STRIPE_PRICE_TEAM_MONTHLY' },
  { plan: 'team',    interval: 'annual',  env: 'STRIPE_PRICE_TEAM_ANNUAL' },
]

let inserted = 0
let skipped = 0
let failed = 0

for (const r of ROWS) {
  const priceId = process.env[r.env]
  if (!priceId || !priceId.startsWith('price_')) {
    console.log(`• ${r.plan} ${r.interval}: ${r.env} unset/invalid — skipping`)
    failed++
    continue
  }

  // Idempotency: already have an active row for this (plan, interval)?
  const { data: existing } = await db
    .from('plan_prices')
    .select('id')
    .eq('plan_id', r.plan)
    .eq('interval', r.interval)
    .eq('active', true)
    .maybeSingle()
  if (existing) {
    console.log(`• ${r.plan} ${r.interval}: active row exists — skipping`)
    skipped++
    continue
  }

  let unitAmount
  try {
    const price = await stripe.prices.retrieve(priceId)
    unitAmount = price.unit_amount
  } catch (e) {
    console.log(`✗ ${r.plan} ${r.interval}: retrieve ${priceId} failed — ${e.message}`)
    failed++
    continue
  }

  const { error } = await db.from('plan_prices').insert({
    plan_id: r.plan,
    interval: r.interval,
    stripe_price_id: priceId,
    unit_amount: unitAmount,
    active: true,
  })
  if (error) {
    console.log(`✗ ${r.plan} ${r.interval}: insert failed — ${error.message}`)
    failed++
    continue
  }
  console.log(`✓ ${r.plan} ${r.interval}: ${priceId} (${unitAmount}¢)`)
  inserted++
}

console.log(`\nInserted ${inserted}, skipped ${skipped}, failed ${failed}.`)
process.exit(failed > 0 ? 1 : 0)
