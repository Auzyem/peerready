import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, billing_interval, trial_end')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    plan: sub?.plan_id ?? 'free',
    status: sub?.status ?? 'free',
    periodEnd: sub?.current_period_end ?? null,
    cancelAtEnd: sub?.cancel_at_period_end ?? false,
    interval: sub?.billing_interval ?? 'monthly',
    trialEnd: sub?.trial_end ?? null,
  })
}
