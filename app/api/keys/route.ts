import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/apiKeys/generator'
import type { ApiKeyScope } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET: list the current user's non-revoked keys (never returns key_hash).
export async function GET() {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select(
        'id, name, key_prefix, key_suffix, scopes, environment, expires_at, last_used_at, revoked, created_at'
      )
      .eq('user_id', user.id)
      .eq('revoked', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ keys: keys ?? [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load keys'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: create a new API key (plan-gated).
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      name,
      scopes,
      environment = 'live',
      expiresAt,
    } = body as {
      name?: string
      scopes?: ApiKeyScope[]
      environment?: 'live' | 'test'
      expiresAt?: string | null
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 })
    }
    if (!scopes || scopes.length === 0) {
      return NextResponse.json({ error: 'At least one scope is required' }, { status: 400 })
    }

    // ── Plan gate ───────────────────────────────────────────────────────────
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan_id, plans(api_access, max_api_keys, allowed_scopes)')
      .eq('user_id', user.id)
      .single()

    const plan = sub?.plans as unknown as
      | { api_access: boolean; max_api_keys: number; allowed_scopes: string[] | null }
      | null

    if (!plan?.api_access) {
      return NextResponse.json(
        { error: 'API keys require a Starter plan or above', upgradeUrl: '/billing' },
        { status: 403 }
      )
    }

    if (plan.max_api_keys !== -1) {
      const { count } = await supabase
        .from('api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('revoked', false)

      if ((count ?? 0) >= plan.max_api_keys) {
        return NextResponse.json(
          {
            error: `Your plan allows a maximum of ${plan.max_api_keys} API keys. Delete an existing key or upgrade your plan.`,
            upgradeUrl: '/billing',
          },
          { status: 429 }
        )
      }
    }

    const allowedScopes: string[] = plan.allowed_scopes ?? []
    const forbiddenScopes = scopes.filter((s) => !allowedScopes.includes(s))
    if (forbiddenScopes.length > 0) {
      return NextResponse.json(
        {
          error: `Your plan does not allow these scopes: ${forbiddenScopes.join(', ')}. Upgrade to access them.`,
          upgradeUrl: '/billing',
          forbiddenScopes,
        },
        { status: 403 }
      )
    }

    // ── Generate and store ──────────────────────────────────────────────────
    const { plainKey, keyHash, keyPrefix, keySuffix } = await generateApiKey(environment)

    const { data: newKey, error: insertError } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        key_suffix: keySuffix,
        scopes,
        environment,
        expires_at: expiresAt ?? null,
      })
      .select('id, name, key_prefix, key_suffix, scopes, environment, expires_at, created_at')
      .single()

    if (insertError) throw insertError

    // The plaintext is returned exactly once and never retrievable again.
    return NextResponse.json({
      key: { ...newKey, plain_key: plainKey },
      warning: 'Save this key now. It will not be shown again.',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create key'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
