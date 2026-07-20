import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { verifyApiKey } from './generator'
import type { ApiKeyScope } from '@/lib/types'

export interface ApiKeyContext {
  userId: string
  keyId: string
  scopes: ApiKeyScope[]
  environment: string
}

/** Best-effort client IP from proxy headers (NextRequest.ip is unavailable here). */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('cf-connecting-ip')
}

/**
 * Validates the `Authorization: Bearer pr_...` token against the api_keys table.
 *
 * Lookup is pre-filtered by key_prefix + key_suffix among non-revoked keys, so
 * bcrypt.compare only runs against a tiny candidate set (collisions on a 4-char
 * suffix are rare and plan-limited). Returns an ApiKeyContext on success, or a
 * NextResponse error the caller should return immediately.
 */
export async function validateApiKey(
  request: NextRequest,
  requiredScopes: ApiKeyScope[]
): Promise<ApiKeyContext | NextResponse> {
  const authHeader = request.headers.get('authorization') ?? ''
  const plainKey = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!plainKey || !plainKey.startsWith('pr_')) {
    return NextResponse.json(
      { error: 'Missing or malformed API key. Send as: Authorization: Bearer sl_live_...' },
      { status: 401 }
    )
  }

  const keyPrefix = plainKey.startsWith('sl_test_') ? 'sl_test_' : 'sl_live_'
  const keySuffix = plainKey.slice(-4)

  const admin = createAdminClient()
  const { data: candidates, error } = await admin
    .from('api_keys')
    .select('id, user_id, key_hash, scopes, environment, expires_at')
    .eq('key_prefix', keyPrefix)
    .eq('key_suffix', keySuffix)
    .eq('revoked', false)

  if (error || !candidates || candidates.length === 0) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  let matched: (typeof candidates)[number] | null = null
  for (const candidate of candidates) {
    if (await verifyApiKey(plainKey, candidate.key_hash)) {
      matched = candidate
      break
    }
  }
  if (!matched) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  if (matched.expires_at && new Date(matched.expires_at) < new Date()) {
    return NextResponse.json({ error: 'API key has expired' }, { status: 401 })
  }

  const keyScopes = (matched.scopes ?? []) as ApiKeyScope[]
  const missingScopes = requiredScopes.filter((s) => !keyScopes.includes(s))
  if (missingScopes.length > 0) {
    return NextResponse.json(
      { error: `API key missing required scopes: ${missingScopes.join(', ')}` },
      { status: 403 }
    )
  }

  // Fire-and-forget last-used update; never block the request on it.
  void admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString(), last_used_ip: clientIp(request) })
    .eq('id', matched.id)
    .then(() => {})

  return {
    userId: matched.user_id,
    keyId: matched.id,
    scopes: keyScopes,
    environment: matched.environment,
  }
}

export interface ResolvedAuth {
  userId: string
  viaApiKey: boolean
}

/**
 * Resolves the caller from either an API key (`Authorization: Bearer pr_...`)
 * or the session cookie. On the API-key path the caller has no cookie session,
 * so route handlers must use the service-role client and apply explicit
 * ownership scoping (RLS will not auto-scope). Returns a NextResponse on error.
 */
export async function resolveAuth(
  request: NextRequest,
  requiredScopes: ApiKeyScope[]
): Promise<ResolvedAuth | NextResponse> {
  const authHeader = request.headers.get('authorization') ?? ''
  if (/^Bearer\s+pr_/i.test(authHeader)) {
    const result = await validateApiKey(request, requiredScopes)
    if (result instanceof NextResponse) return result
    return { userId: result.userId, viaApiKey: true }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { userId: user.id, viaApiKey: false }
}
