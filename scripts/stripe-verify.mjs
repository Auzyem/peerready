#!/usr/bin/env node
/**
 * Verifies PeerReady's Stripe wiring before you test a real checkout.
 *
 * Reads .env.local automatically and checks that:
 *   - the six STRIPE_PRICE_* IDs resolve in Stripe and match the expected amount + interval,
 *   - the secret/publishable keys are present and in the SAME mode (test vs live),
 *   - the webhook secret is set (for local `stripe listen`).
 *
 * Run:  node scripts/stripe-verify.mjs
 * (No secrets are printed — only the non-secret price IDs.)
 */
import Stripe from 'stripe'
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
  console.error('✗ STRIPE_SECRET_KEY is missing or still a placeholder in .env.local')
  process.exit(1)
}
const mode = key.startsWith('sk_live') ? 'live' : 'test'
console.log(`Stripe secret key mode: ${mode}\n`)

const stripe = new Stripe(key)

const EXPECT = [
  { env: 'STRIPE_PRICE_STARTER_MONTHLY', amount: 1200, interval: 'month' },
  { env: 'STRIPE_PRICE_STARTER_ANNUAL', amount: 9600, interval: 'year' },
  { env: 'STRIPE_PRICE_PRO_MONTHLY', amount: 2900, interval: 'month' },
  { env: 'STRIPE_PRICE_PRO_ANNUAL', amount: 22800, interval: 'year' },
  { env: 'STRIPE_PRICE_TEAM_MONTHLY', amount: 7900, interval: 'month' },
  { env: 'STRIPE_PRICE_TEAM_ANNUAL', amount: 70800, interval: 'year' },
]

let failures = 0

for (const e of EXPECT) {
  const id = process.env[e.env]
  const problems = []
  if (!id || id.includes('...') || !id.startsWith('price_')) {
    problems.push('not set to a real price ID')
  } else {
    try {
      const price = await stripe.prices.retrieve(id)
      if (!price.active) problems.push('price is archived/inactive')
      if (price.currency !== 'usd') problems.push(`currency ${price.currency}, expected usd`)
      if (price.unit_amount !== e.amount) problems.push(`amount ${price.unit_amount}¢, expected ${e.amount}¢`)
      if (price.recurring?.interval !== e.interval) {
        problems.push(`interval ${price.recurring?.interval ?? 'none'}, expected ${e.interval}`)
      }
    } catch (err) {
      problems.push(`retrieve failed in ${mode} mode — wrong mode or bad ID? (${err.message})`)
    }
  }
  if (problems.length === 0) {
    console.log(`✓ ${e.env} → ${id} ($${(e.amount / 100).toFixed(2)}/${e.interval})`)
  } else {
    failures += problems.length
    console.log(`✗ ${e.env} = ${id ?? '(unset)'}`)
    for (const p of problems) console.log(`    - ${p}`)
  }
}

console.log()

// Non-API sanity checks for the other env vars.
const pub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
if (!pub || pub.includes('...')) {
  failures++
  console.log('✗ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is unset/placeholder')
} else if (!pub.startsWith('pk_')) {
  failures++
  console.log('✗ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY does not look like a publishable key (pk_…)')
} else {
  const pubMode = pub.startsWith('pk_live') ? 'live' : 'test'
  if (pubMode !== mode) {
    failures++
    console.log(`✗ publishable key is ${pubMode} mode but secret key is ${mode} mode — they must match`)
  } else {
    console.log(`✓ publishable key present and in ${mode} mode`)
  }
}

const whsec = process.env.STRIPE_WEBHOOK_SECRET
if (!whsec || whsec.includes('...')) {
  console.log('• STRIPE_WEBHOOK_SECRET not set yet — set it to the whsec_… that `stripe listen` prints (needed for webhook delivery).')
} else if (!whsec.startsWith('whsec_')) {
  console.log('• STRIPE_WEBHOOK_SECRET does not look like a signing secret (whsec_…).')
} else {
  console.log('✓ webhook signing secret present')
}

console.log()
if (failures === 0) {
  console.log('✓ Wiring looks good — go run a test checkout.')
} else {
  console.log(`✗ ${failures} problem(s) found. Fix in .env.local and re-run.`)
  process.exit(1)
}
