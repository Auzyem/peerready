/** Monthly price in cents: dollars × 100, rounded to the nearest cent. */
export function monthlyCents(perMonthUsd: number): number {
  return Math.round(perMonthUsd * 100)
}

/**
 * Annual price in cents — the full YEARLY total. The admin enters the annual
 * price as a per-month figure (the `$8/mo → $96/yr` convention), so the Stripe
 * yearly price is perMonthUsd × 12 × 100.
 */
export function annualCents(perMonthUsd: number): number {
  return Math.round(perMonthUsd * 12 * 100)
}
