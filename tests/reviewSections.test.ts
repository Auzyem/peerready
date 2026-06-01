import { describe, it, expect } from 'vitest'
import { reviewSectionIds } from '@/lib/review/sections'

describe('reviewSectionIds', () => {
  it('includes progress only when hasProgress is true', () => {
    expect(reviewSectionIds(true)).toEqual(['overview', 'adversarial', 'journals', 'reporting', 'progress'])
  })
  it('omits progress when hasProgress is false', () => {
    expect(reviewSectionIds(false)).toEqual(['overview', 'adversarial', 'journals', 'reporting'])
  })
})
