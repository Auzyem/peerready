import { createClient } from '@/lib/supabase/server'

export type PlanFeature =
  | 'adversarial_access'
  | 'journal_matching'
  | 'pdf_reports'
  | 'api_access'

/** Pure predicate — unit-testable without Supabase. */
export function isFeatureAllowed(
  plan: Record<string, unknown> | null | undefined,
  feature: PlanFeature
): boolean {
  return plan?.[feature] === true
}

export async function checkPlanGate(
  userId: string,
  feature: PlanFeature
): Promise<{ allowed: boolean; plan: string; upgradeRequired?: string }> {
  const supabase = createClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, plans(*)')
    .eq('user_id', userId)
    .single()

  if (!data) return { allowed: false, plan: 'free', upgradeRequired: 'starter' }

  const plan = data.plans as unknown as Record<string, unknown> | null
  const allowed = isFeatureAllowed(plan, feature)

  return {
    allowed,
    plan: data.plan_id,
    upgradeRequired: allowed ? undefined : 'pro',
  }
}

export async function checkReviewLimit(
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const supabase = createClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, plans(max_reviews_per_month)')
    .eq('user_id', userId)
    .single()

  const plans = sub?.plans as unknown as { max_reviews_per_month: number | null } | null
  // No subscription row → treat as the free limit (2). null on a real plan → unlimited.
  const rawLimit = plans ? plans.max_reviews_per_month : 2
  if (rawLimit === null) {
    return { allowed: true, used: 0, limit: Number.POSITIVE_INFINITY }
  }
  const limit = rawLimit ?? 2

  // Two-step id resolution (supabase-js can't take a query builder in .in()).
  const { data: manuscripts } = await supabase
    .from('manuscripts')
    .select('id')
    .eq('user_id', userId)
  const manuscriptIds = (manuscripts ?? []).map((m) => m.id)
  if (manuscriptIds.length === 0) return { allowed: true, used: 0, limit }

  const { data: drafts } = await supabase
    .from('drafts')
    .select('id')
    .in('manuscript_id', manuscriptIds)
  const draftIds = (drafts ?? []).map((d) => d.id)
  if (draftIds.length === 0) return { allowed: true, used: 0, limit }

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('review_sessions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())
    .in('draft_id', draftIds)

  const used = count ?? 0
  return { allowed: used < limit, used, limit }
}
