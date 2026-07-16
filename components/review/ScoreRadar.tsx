import { polarToXY, spokeAngle, radarPolygon, toPointsAttr } from '@/lib/charts/radar'
import type { Score, ScoreDimension } from '@/lib/types'

const DIMENSION_ORDER: ScoreDimension[] = [
  'originality', 'significance', 'methodology', 'evidence_quality',
  'literature_engagement', 'internal_logic', 'presentation_clarity', 'ethical_compliance',
]
const SHORT_LABEL: Record<ScoreDimension, string> = {
  originality: 'Originality',
  significance: 'Significance',
  methodology: 'Method',
  evidence_quality: 'Evidence',
  literature_engagement: 'Literature',
  internal_logic: 'Logic',
  presentation_clarity: 'Clarity',
  ethical_compliance: 'Ethics',
}

const SIZE = 340
const CENTER = SIZE / 2
const R = 95 // chart radius; leaves room for labels
const MAX = 10
const RINGS = [0.25, 0.5, 0.75, 1]

export function ScoreRadar({ scores }: { scores: Score[] }) {
  const byDim = new Map(scores.map(s => [s.dimension, s.score]))
  const dims = DIMENSION_ORDER.filter(d => byDim.has(d))
  if (dims.length < 3) return null // a radar needs at least a triangle

  const values = dims.map(d => byDim.get(d) ?? 0)
  const n = dims.length
  const dataPoints = radarPolygon(values, MAX, CENTER, CENTER, R)

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Score radar across review dimensions"
      className="mx-auto h-72 w-72"
    >
      {/* grid rings */}
      {RINGS.map(ring => (
        <circle
          key={ring}
          cx={CENTER}
          cy={CENTER}
          r={R * ring}
          fill="none"
          stroke="currentColor"
          className="text-slate-200"
          strokeWidth={1}
        />
      ))}

      {/* spokes + labels */}
      {dims.map((d, i) => {
        const angle = spokeAngle(i, n)
        const end = polarToXY(CENTER, CENTER, R, angle)
        const label = polarToXY(CENTER, CENTER, R + 20, angle)
        const anchor = Math.abs(label.x - CENTER) < 1 ? 'middle' : label.x > CENTER ? 'start' : 'end'
        return (
          <g key={d}>
            <line
              x1={CENTER} y1={CENTER} x2={end.x} y2={end.y}
              stroke="currentColor" className="text-slate-200" strokeWidth={1}
            />
            <text
              x={label.x} y={label.y}
              textAnchor={anchor} dominantBaseline="middle"
              className="fill-pr-body text-[11px] font-medium"
            >
              {SHORT_LABEL[d]}
            </text>
          </g>
        )
      })}

      {/* data polygon */}
      <polygon
        points={toPointsAttr(dataPoints)}
        className="fill-pr-teal/20 stroke-pr-teal"
        strokeWidth={2}
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-pr-teal" />
      ))}
    </svg>
  )
}
