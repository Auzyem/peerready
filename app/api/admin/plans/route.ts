import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, permissionErrorResponse } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Price columns (price_monthly_usd / price_annual_monthly_usd) are deliberately
// NOT here: they are owned exclusively by POST /api/admin/plans/sync-price, which
// keeps the displayed price in lockstep with the Stripe-charged price. Allowing
// them on this plain PATCH would let a caller set a display price with no matching
// Stripe price — the exact display-vs-charge drift the sync flow exists to prevent.
const ALLOWED_FIELDS = [
  'name', 'annual_discount_pct',
  'max_manuscripts', 'max_reviews_per_month', 'adversarial_access',
  'journal_matching', 'pdf_reports', 'team_members', 'api_access',
  'max_api_keys', 'allowed_scopes',
]

export async function GET() {
  try {
    await requirePermission('billing.view')
    const admin = createAdminClient()
    const { data, error } = await admin.from('plans').select('*').order('price_monthly_usd', { ascending: true })
    if (error) throw error
    return NextResponse.json({ plans: data })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission('billing.edit_plans')
    const { planId, updates } = (await request.json()) as { planId: string; updates: Record<string, unknown> }
    if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 })

    const safeUpdates: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (updates?.[key] !== undefined) safeUpdates[key] = updates[key]
    }
    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.from('plans').update(safeUpdates).eq('id', planId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return permissionErrorResponse(error)
  }
}
