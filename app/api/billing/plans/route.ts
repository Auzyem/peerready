import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Reads cookies via the Supabase client, so it cannot be statically prerendered.
export const dynamic = 'force-dynamic'

// Public: read by the billing page and the landing-page pricing section.
export async function GET() {
  try {
    const supabase = createClient()
    const { data: plans, error } = await supabase
      .from('plans')
      .select('id, name, price_monthly_usd, price_annual_monthly_usd, annual_discount_pct, max_manuscripts, max_reviews_per_month, adversarial_access, journal_matching, pdf_reports, team_members, api_access, max_api_keys, allowed_scopes')
      .order('price_monthly_usd', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ plans })
  } catch (error: unknown) {
    console.error('[api/billing/plans] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load plans'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
