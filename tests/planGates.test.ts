import { describe, it, expect } from 'vitest'
import { isFeatureAllowed } from '@/lib/plan/gates'

describe('isFeatureAllowed', () => {
  it('returns true only when the plan flag is exactly true', () => {
    expect(isFeatureAllowed({ pdf_reports: true }, 'pdf_reports')).toBe(true)
    expect(isFeatureAllowed({ pdf_reports: false }, 'pdf_reports')).toBe(false)
    expect(isFeatureAllowed({}, 'pdf_reports')).toBe(false)
    expect(isFeatureAllowed(null, 'adversarial_access')).toBe(false)
  })
})
