// The "Pro" upsell badge shows for plans below Pro; pro/team hide it.
export function shouldShowProBadge(plan: string | undefined | null): boolean {
  return plan !== 'pro' && plan !== 'team'
}
