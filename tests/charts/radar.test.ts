import { describe, it, expect } from 'vitest'
import { polarToXY, spokeAngle, radarPolygon } from '@/lib/charts/radar'

describe('radar geometry', () => {
  it('places -90° at the top (above center)', () => {
    const p = polarToXY(100, 100, 50, -90)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })

  it('places 0° to the east (right of center)', () => {
    const p = polarToXY(100, 100, 50, 0)
    expect(p.x).toBeCloseTo(150)
    expect(p.y).toBeCloseTo(100)
  })

  it('spreads spokes evenly starting at the top', () => {
    expect(spokeAngle(0, 4)).toBe(-90)
    expect(spokeAngle(1, 4)).toBe(0)
    expect(spokeAngle(2, 4)).toBe(90)
  })

  it('scales each vertex by value/max along its spoke', () => {
    const pts = radarPolygon([5, 5, 5, 5], 10, 100, 100, 80)
    expect(pts).toHaveLength(4)
    // first spoke is at the top, at half radius (40px up)
    expect(pts[0].x).toBeCloseTo(100)
    expect(pts[0].y).toBeCloseTo(60)
  })

  it('collapses to the center when max is 0', () => {
    const pts = radarPolygon([0, 0, 0], 0, 50, 50, 40)
    pts.forEach(p => {
      expect(p.x).toBeCloseTo(50)
      expect(p.y).toBeCloseTo(50)
    })
  })
})
