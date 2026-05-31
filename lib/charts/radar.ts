export interface Point {
  x: number
  y: number
}

/**
 * Convert a polar coordinate to cartesian. Angle in degrees, 0° = east; we use
 * -90° for "north" (top of the chart). Pure — unit tested.
 */
export function polarToXY(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

/** Angle (deg) for spoke `i` of `n`, starting at the top and going clockwise. */
export function spokeAngle(i: number, n: number): number {
  return -90 + (i * 360) / n
}

/**
 * Vertices of the data polygon: one point per value, scaled by value/max and
 * placed on its spoke. `values` order defines spoke order (top, then clockwise).
 */
export function radarPolygon(
  values: number[],
  max: number,
  cx: number,
  cy: number,
  r: number
): Point[] {
  const n = values.length
  return values.map((v, i) => {
    const clamped = Math.max(0, Math.min(v, max))
    const radius = max === 0 ? 0 : r * (clamped / max)
    return polarToXY(cx, cy, radius, spokeAngle(i, n))
  })
}

/** Serialise points to an SVG polygon `points` attribute. */
export function toPointsAttr(points: Point[]): string {
  return points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}
