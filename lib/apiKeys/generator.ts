import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export type KeyEnvironment = 'live' | 'test'

/**
 * Generates a new API key. Returns both the plaintext (shown to the user once)
 * and the bcrypt hash (stored in the DB). Format: pr_live_[32 url-safe chars].
 * The key is well under bcrypt's 72-byte input limit.
 */
export async function generateApiKey(environment: KeyEnvironment = 'live'): Promise<{
  plainKey: string
  keyHash: string
  keyPrefix: string
  keySuffix: string
}> {
  const keyPrefix = `pr_${environment}_`
  const random    = crypto.randomBytes(24).toString('base64url') // 32 url-safe chars
  const plainKey  = keyPrefix + random
  const keyHash   = await bcrypt.hash(plainKey, 12)
  const keySuffix = plainKey.slice(-4)

  return { plainKey, keyHash, keyPrefix, keySuffix }
}

/** Verifies a plaintext key against a stored bcrypt hash. */
export async function verifyApiKey(plainKey: string, storedHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainKey, storedHash)
  } catch {
    return false
  }
}
