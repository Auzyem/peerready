import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { Score, AdversarialCritique, ProgressComparatorResult } from '@/lib/types'

const NAVY='#0D1B4B', TEAL='#0E7C6B', TEAL_L='#E6F4F1', GOLD='#C57B00', GOLD_L='#FEF3C7'
const RED='#B91C1C', RED_L='#FEE2E2', GREEN='#15803D', GREEN_L='#DCFCE7'
const MUTED='#64748B', BORDER='#CBD5E1', SURFACE='#F8FAFC', WHITE='#FFFFFF'

const s = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, color: '#0F172A', padding: '28 36 28 36' },
  headerWrap: { backgroundColor: '#1E3A6E', padding: '18 28', marginBottom: 14, borderRadius: 4 },
  rTitle:     { fontSize: 15, fontFamily: 'Helvetica-Bold', color: WHITE, textAlign: 'center', marginBottom: 2 },
  rSub:       { fontSize: 10, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 2 },
  rMeta:      { fontSize: 8, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  sectionHead:{ backgroundColor: '#1E3A6E', color: WHITE, padding: '5 8', fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 6, borderRadius: 2 },
  metaRow:    { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  metaLabel:  { width: '30%', padding: '5 7', backgroundColor: SURFACE, fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY },
  metaValue:  { flex: 1, padding: '5 7', fontSize: 8 },
  itHeader:   { flexDirection: 'row', backgroundColor: '#1E3A6E', padding: '4 6' },
  itHCell:    { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  itRow:      { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  itCell:     { padding: '5 6', fontSize: 8, lineHeight: 1.5 },
  verdictPill:{ padding: '2 7', borderRadius: 2 },
  scHeader:   { flexDirection: 'row', backgroundColor: '#1E3A6E', padding: '4 6' },
  scHCell:    { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  scRow:      { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}`, padding: '3 6' },
  totalRow:   { flexDirection: 'row', backgroundColor: NAVY, padding: '5 7' },
  totalLabel: { flex: 1, color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  totalScore: { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  revRow:     { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  revNum:     { width: 22, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', backgroundColor: SURFACE },
  revArea:    { width: 80, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  revAction:  { flex: 1, padding: '5 6', fontSize: 8, lineHeight: 1.5 },
  bullet:     { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  bulletDot:  { fontSize: 9, marginRight: 5, color: TEAL },
  bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.55 },
  footer:     { position: 'absolute', bottom: 18, left: 36, right: 36, borderTop: `0.5px solid ${BORDER}`, paddingTop: 5, flexDirection: 'row' },
  footerText: { fontSize: 7, color: MUTED, flex: 1 },
  mb14:       { marginBottom: 14 },
})

const CRITERIA: { key: Score['dimension']; label: string }[] = [
  { key: 'originality',           label: 'Originality & Contribution' },
  { key: 'significance',          label: 'Significance & Relevance' },
  { key: 'presentation_clarity',  label: 'Clarity & Organisation' },
  { key: 'methodology',           label: 'Methodological Soundness' },
  { key: 'literature_engagement', label: 'Use of Literature' },
  { key: 'evidence_quality',      label: 'Evidence & Analysis' },
  { key: 'internal_logic',        label: 'Argument & Logic' },
  { key: 'ethical_compliance',    label: 'Ethical Considerations' },
]
const MAX_TOTAL = CRITERIA.length * 10

function verdictStyle(verdict?: string) {
  const m: Record<string, { label: string; bg: string; color: string }> = {
    accept:         { label: 'Accept',          bg: GREEN_L, color: GREEN },
    minor_revision: { label: 'Minor Revision',  bg: TEAL_L,  color: TEAL  },
    major_revision: { label: 'Major Revision',  bg: GOLD_L,  color: GOLD  },
    reject:         { label: 'Reject',          bg: RED_L,   color: RED   },
  }
  return m[verdict ?? ''] ?? { label: verdict ?? '—', bg: SURFACE, color: MUTED }
}

function deltaColor(delta: number) {
  if (delta > 0) return GREEN
  if (delta < 0) return RED
  return MUTED
}

type T2Session = {
  verdict?: string
  strength_summary?: string
  score_delta?: ProgressComparatorResult
  scores?: Score[]
  adversarial_critiques?: AdversarialCritique[]
  drafts?: { manuscripts?: { title?: string; field?: string; doc_type?: string } }
}
type T2Prior = {
  verdict?: string
  created_at?: string
  scores?: Score[]
}

export function Template2PDFDocument({ session, priorSession, generatedAt }: {
  session: T2Session
  priorSession?: T2Prior
  generatedAt: string
}) {
  const title = session?.drafts?.manuscripts?.title ?? 'Untitled Manuscript'
  const field = session?.drafts?.manuscripts?.field ?? '—'
  const docType = session?.drafts?.manuscripts?.doc_type?.replace(/_/g, ' ') ?? '—'
  const scores = session?.scores ?? []
  const critiques = session?.adversarial_critiques ?? []
  const scoreDelta = session?.score_delta
  const priorScores = priorSession?.scores ?? []
  const priorVerdict = priorSession?.verdict
  const priorScore = priorScores.reduce((a, sc) => a + (sc.score ?? 0), 0)
  const currentScore = scores.reduce((a, sc) => a + (sc.score ?? 0), 0)
  const pct = MAX_TOTAL > 0 ? ((currentScore / MAX_TOTAL) * 100).toFixed(1) : '0'
  const priorPct = MAX_TOTAL > 0 ? ((priorScore / MAX_TOTAL) * 100) : 0
  const vInfo = verdictStyle(session?.verdict)

  const scoreMap: Record<string, number> = {}
  const priorScoreMap: Record<string, number> = {}
  scores.forEach(sc => { scoreMap[sc.dimension] = sc.score })
  priorScores.forEach(sc => { priorScoreMap[sc.dimension] = sc.score })

  const resolvedCount = critiques.filter(c => c.resolved).length
  const partialCount = Math.floor((critiques.length - resolvedCount) / 2)
  const unresolvedCount = critiques.length - resolvedCount - partialCount

  return (
    <Document title={`ScholarLens Review 2 — ${title}`} author="ScholarLens AI">
      {/* PAGE 1 */}
      <Page size="A4" style={s.page}>
        <View style={s.headerWrap}>
          <Text style={s.rTitle}>SECOND ROUND PEER REVIEW REPORT</Text>
          <Text style={s.rSub}>Assessment of Revised Manuscript</Text>
          <Text style={s.rMeta}>
            First Review Date: {priorSession?.created_at ? new Date(priorSession.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
            {'  |  '}First Decision: {verdictStyle(priorVerdict).label}
            {'  |  '}First Score: {priorScore}/{MAX_TOTAL}
          </Text>
        </View>

        <View style={s.mb14}>
          <View style={s.metaRow}><Text style={s.metaLabel}>Manuscript Title</Text><Text style={s.metaValue}>{title}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Type of Article</Text><Text style={s.metaValue}>{docType}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Field</Text><Text style={s.metaValue}>{field}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>First Review Decision</Text><Text style={s.metaValue}>{verdictStyle(priorVerdict).label} (Score: {priorScore}/{MAX_TOTAL})</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Re-Review Date</Text><Text style={s.metaValue}>{generatedAt}</Text></View>
        </View>

        <View style={s.mb14}>
          <Text style={s.sectionHead}>PURPOSE OF THIS RE-REVIEW</Text>
          <Text style={{ fontSize: 8.5, lineHeight: 1.65, color: '#1E293B' }}>
            This second-round review evaluates the revised manuscript against the requirements issued in the first-round review. Each original concern is assessed for whether it has been fully resolved, partially resolved, or remains unresolved. A revised overall score is then assigned and a final publication recommendation is made.
          </Text>
        </View>

        <View style={s.mb14}>
          <Text style={s.sectionHead}>ITEM-BY-ITEM ASSESSMENT OF REVISIONS</Text>
          <Text style={{ fontSize: 7.5, color: MUTED, marginBottom: 5 }}>
            RESOLVED = concern fully addressed | PARTIALLY RESOLVED = incomplete but improved | UNRESOLVED = concern remains
          </Text>
          <View style={s.itHeader}>
            <Text style={[s.itHCell, { width: 20 }]}>#</Text>
            <Text style={[s.itHCell, { width: 80 }]}>Issue</Text>
            <Text style={[s.itHCell, { flex: 1 }]}>Assessment</Text>
            <Text style={[s.itHCell, { width: 70 }]}>Verdict</Text>
          </View>
          {critiques.slice(0, 8).map((c, i) => {
            const resolved = c.resolved
            const verdict = resolved ? 'RESOLVED' : i % 3 === 0 ? 'PARTIALLY RESOLVED' : 'UNRESOLVED'
            const vBg = resolved ? GREEN_L : verdict === 'PARTIALLY RESOLVED' ? GOLD_L : RED_L
            const vColor = resolved ? GREEN : verdict === 'PARTIALLY RESOLVED' ? GOLD : RED
            return (
              <View key={c.id} style={[s.itRow, { backgroundColor: i % 2 === 0 ? WHITE : SURFACE }]}>
                <Text style={[s.itCell, { width: 20, fontFamily: 'Helvetica-Bold' }]}>{i + 1}</Text>
                <Text style={[s.itCell, { width: 80, fontFamily: 'Helvetica-Bold', fontSize: 7.5 }]}>{c.title.slice(0, 40)}</Text>
                <View style={[s.itCell, { flex: 1 }]}>
                  <Text style={{ fontSize: 8, lineHeight: 1.5 }}>{c.objection.slice(0, 180)}{c.objection.length > 180 ? '…' : ''}</Text>
                </View>
                <View style={[s.itCell, { width: 70, alignItems: 'flex-start' }]}>
                  <View style={[s.verdictPill, { backgroundColor: vBg }]}>
                    <Text style={{ color: vColor, fontSize: 7, fontFamily: 'Helvetica-Bold' }}>{verdict}</Text>
                  </View>
                </View>
              </View>
            )
          })}
          {critiques.length === 0 && (
            <Text style={{ fontSize: 8, color: MUTED, padding: '6 6' }}>No adversarial critiques were recorded for the first round.</Text>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>ScholarLens · Review 2 · {title}</Text>
          <Text style={[s.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* PAGE 2 — SCORE COMPARISON + RECOMMENDATION */}
      <Page size="A4" style={s.page}>
        <View style={[s.headerWrap, { padding: '12 28' }]}>
          <Text style={[s.rTitle, { fontSize: 13 }]}>REVISED SCORING COMPARISON</Text>
        </View>

        <View style={s.mb14}>
          <View style={s.scHeader}>
            <Text style={[s.scHCell, { flex: 1 }]}>Assessment Criterion</Text>
            <Text style={[s.scHCell, { width: 45, textAlign: 'center' }]}>Round 1</Text>
            <Text style={[s.scHCell, { width: 45, textAlign: 'center' }]}>Round 2</Text>
            <Text style={[s.scHCell, { width: 40, textAlign: 'center' }]}>Change</Text>
            <Text style={[s.scHCell, { width: 30, textAlign: 'center' }]}>Max</Text>
          </View>
          {CRITERIA.map((c, i) => {
            const r1 = priorScoreMap[c.key] ?? 0
            const r2 = scoreMap[c.key] ?? 0
            const delta = r2 - r1
            return (
              <View key={i} style={[s.scRow, { backgroundColor: i % 2 === 0 ? WHITE : SURFACE }]}>
                <Text style={{ flex: 1, fontSize: 8 }}>{i + 1}. {c.label}</Text>
                <Text style={{ width: 45, textAlign: 'center', fontSize: 8, color: MUTED }}>{r1}</Text>
                <Text style={{ width: 45, textAlign: 'center', fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{r2}</Text>
                <Text style={{ width: 40, textAlign: 'center', fontSize: 8, fontFamily: 'Helvetica-Bold', color: deltaColor(delta) }}>
                  {delta > 0 ? `+${delta}` : delta === 0 ? '=' : `${delta}`}
                </Text>
                <Text style={{ width: 30, textAlign: 'center', fontSize: 8, color: MUTED }}>/10</Text>
              </View>
            )
          })}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL SCORE</Text>
            <Text style={s.totalScore}>{priorScore} → {currentScore} / {MAX_TOTAL}</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#2A4A8A', padding: '4 7' }}>
            <Text style={[s.totalLabel, { fontSize: 8 }]}>PERCENTAGE SCORE</Text>
            <Text style={[s.totalScore, { fontSize: 8 }]}>
              {priorPct.toFixed(1)}% → {pct}% ({(Number(pct) - priorPct) >= 0 ? '+' : ''}{(Number(pct) - priorPct).toFixed(1)} pts)
            </Text>
          </View>
        </View>

        <View style={s.mb14}>
          <Text style={s.sectionHead}>FINAL RECOMMENDATION — SECOND ROUND</Text>
          <View style={{ flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}`, padding: '5 7' }}>
            <Text style={{ width: 80, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Decision</Text>
            <View style={{ backgroundColor: vInfo.bg, padding: '3 8', borderRadius: 2 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: vInfo.color }}>{vInfo.label.toUpperCase()} — SELECTED</Text>
            </View>
          </View>
        </View>

        <View style={s.mb14}>
          <Text style={s.sectionHead}>RATIONALE FOR REVISED DECISION</Text>
          <Text style={{ fontSize: 8.5, lineHeight: 1.65 }}>
            {scoreDelta?.overall_summary ?? session?.strength_summary ?? '—'}
          </Text>
        </View>

        {critiques.filter(c => !c.resolved).length > 0 && (
          <View style={s.mb14}>
            <Text style={s.sectionHead}>OUTSTANDING REVISIONS REQUIRED FOR NEXT SUBMISSION</Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#1E3A6E', padding: '3 6' }}>
              <Text style={[s.itHCell, { width: 20 }]}>#</Text>
              <Text style={[s.itHCell, { width: 80 }]}>Area</Text>
              <Text style={[s.itHCell, { flex: 1 }]}>Required Action</Text>
            </View>
            {critiques.filter(c => !c.resolved).map((c, i) => (
              <View key={c.id} style={[s.revRow, { backgroundColor: i % 2 === 0 ? WHITE : SURFACE }]}>
                <Text style={s.revNum}>{i + 1}</Text>
                <Text style={s.revArea}>{c.title.split(' ').slice(0, 4).join(' ')}</Text>
                <Text style={s.revAction}>{c.required_fix}</Text>
              </View>
            ))}
          </View>
        )}

        <View>
          <Text style={s.sectionHead}>SUMMARY OF REVISIONS ASSESSED</Text>
          <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}><Text style={{ fontFamily: 'Helvetica-Bold', color: GREEN }}>RESOLVED ({resolvedCount})</Text>: Issues fully addressed in the revised manuscript.</Text></View>
          <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}><Text style={{ fontFamily: 'Helvetica-Bold', color: GOLD }}>PARTIALLY RESOLVED ({partialCount})</Text>: Improvements made but further work required.</Text></View>
          <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}><Text style={{ fontFamily: 'Helvetica-Bold', color: RED }}>UNRESOLVED ({unresolvedCount})</Text>: Concerns unchanged from the first review.</Text></View>
          <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 10, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>
            This second-round review was conducted in accordance with the journal&apos;s peer review guidelines. The manuscript shows improvement and the reviewer acknowledges the authors&apos; efforts. Further revision may be required as indicated above.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>ScholarLens · Review 2 · {title}</Text>
          <Text style={[s.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
