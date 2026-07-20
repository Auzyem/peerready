import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { Score, Annotation, AdversarialCritique, JournalMatch } from '@/lib/types'

// Brand palette (literal hex — @react-pdf has no CSS-variable support).
const NAVY    = '#0D1B4B'
const TEAL    = '#0E7C6B'
const TEAL_L  = '#E6F4F1'
const GOLD    = '#C57B00'
const GOLD_L  = '#FEF3C7'
const RED      = '#B91C1C'
const RED_L    = '#FEE2E2'
const GREEN    = '#15803D'
const GREEN_L  = '#DCFCE7'
const MUTED    = '#64748B'
const BORDER   = '#CBD5E1'
const SURFACE  = '#F8FAFC'
const WHITE    = '#FFFFFF'

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 9, color: '#0F172A', padding: '28 36 28 36' },
  reportTitle:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE, textAlign: 'center', marginBottom: 2 },
  reportSub:    { fontSize: 10, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 2 },
  reportDate:   { fontSize: 9, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  headerWrap:   { backgroundColor: NAVY, padding: '18 28', marginBottom: 14, borderRadius: 4 },
  metaTable:    { marginBottom: 14 },
  metaRow:      { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  metaLabel:    { width: '28%', padding: '5 7', backgroundColor: SURFACE, fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY },
  metaValue:    { flex: 1, padding: '5 7', fontSize: 8, color: '#0F172A' },
  sectionHead:  { backgroundColor: NAVY, color: WHITE, padding: '5 8', fontFamily: 'Helvetica-Bold', fontSize: 9, borderRadius: 2 },
  scoreHeader:  { flexDirection: 'row', backgroundColor: '#1E3A6E', padding: '4 6' },
  scoreHCell:   { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  scoreRow:     { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  scoreCell:    { padding: '4 6', fontSize: 8, color: '#0F172A' },
  commentRow:   { backgroundColor: '#F0F4FF', padding: '5 8', borderBottom: `0.5px solid ${BORDER}` },
  commentLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: NAVY, marginBottom: 2 },
  commentText:  { fontSize: 8, color: '#1E293B', lineHeight: 1.5 },
  verdictCell:  { padding: '4 8', borderRadius: 2 },
  totalRow:     { flexDirection: 'row', backgroundColor: NAVY, padding: '5 7' },
  totalLabel:   { flex: 1, color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  totalScore:   { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  revRow:       { flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}` },
  revNum:       { width: 22, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', backgroundColor: SURFACE },
  revArea:      { width: 80, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 8, backgroundColor: SURFACE },
  revAction:    { flex: 1, padding: '5 6', fontSize: 8, lineHeight: 1.5 },
  bullet:       { flexDirection: 'row', marginBottom: 5, paddingLeft: 4 },
  bulletDot:    { fontSize: 9, marginRight: 5, color: TEAL },
  bulletText:   { flex: 1, fontSize: 8.5, lineHeight: 1.55, color: '#1E293B' },
  footer:       { position: 'absolute', bottom: 18, left: 36, right: 36, borderTop: `0.5px solid ${BORDER}`, paddingTop: 5, flexDirection: 'row' },
  footerText:   { fontSize: 7, color: MUTED, flex: 1 },
  mb6:          { marginBottom: 6 },
  mb14:         { marginBottom: 14 },
})

// Map the 8 scored dimensions onto Template 1's labelled criteria rows.
const CRITERIA: { key: Score['dimension']; no: string; category: string; criteria: string }[] = [
  { key: 'originality',           no: '1', category: 'Originality & Contribution',  criteria: 'Is the topic novel or does it offer a fresh perspective?' },
  { key: 'significance',          no: '2', category: 'Significance & Relevance',     criteria: 'Does the work matter to the field and its intended audience?' },
  { key: 'presentation_clarity',  no: '3', category: 'Clarity & Organisation',       criteria: 'Are objectives, methods, and results clearly structured?' },
  { key: 'methodology',           no: '4', category: 'Methodological Soundness',      criteria: 'Is the research design appropriate and clearly described?' },
  { key: 'literature_engagement', no: '5', category: 'Use of Literature',            criteria: 'Is the work well-supported by current, relevant references?' },
  { key: 'evidence_quality',      no: '6', category: 'Evidence & Analysis',          criteria: 'Do the data and analysis adequately support the claims?' },
  { key: 'internal_logic',        no: '7', category: 'Argument & Logic',             criteria: 'Is the reasoning coherent and free of internal contradictions?' },
  { key: 'ethical_compliance',    no: '8', category: 'Ethical Considerations',       criteria: 'Are ethical standards maintained and clearances evident?' },
]

function scoreColor(score: number) {
  if (score >= 8) return GREEN
  if (score >= 6) return TEAL
  if (score >= 4) return GOLD
  return RED
}

function verdictInfo(verdict?: string) {
  const m: Record<string, { label: string; bg: string; color: string }> = {
    accept:         { label: 'Accept',          bg: GREEN_L, color: GREEN },
    minor_revision: { label: 'Minor Revision',  bg: TEAL_L,  color: TEAL  },
    major_revision: { label: 'Major Revision',  bg: GOLD_L,  color: GOLD  },
    reject:         { label: 'Reject',          bg: RED_L,   color: RED   },
  }
  return m[verdict ?? ''] ?? { label: verdict ?? '—', bg: SURFACE, color: MUTED }
}

function ScoreSection({ scores, annotations }: { scores: Score[]; annotations: Annotation[] }) {
  const scoreMap: Record<string, Score> = {}
  scores.forEach(sc => { scoreMap[sc.dimension] = sc })

  return (
    <View style={s.mb14}>
      <Text style={[s.sectionHead, s.mb6]}>SCORING SUMMARY</Text>
      <Text style={{ fontSize: 7.5, color: MUTED, marginBottom: 5 }}>
        Each dimension scored 1–10 · A score of 6 or above is considered a pass.
      </Text>
      <View style={s.scoreHeader}>
        <Text style={[s.scoreHCell, { width: 18 }]}>No.</Text>
        <Text style={[s.scoreHCell, { width: 90 }]}>Category</Text>
        <Text style={[s.scoreHCell, { flex: 1 }]}>Criteria</Text>
        <Text style={[s.scoreHCell, { width: 30, textAlign: 'center' }]}>Score</Text>
        <Text style={[s.scoreHCell, { width: 25, textAlign: 'center' }]}>Max</Text>
        <Text style={[s.scoreHCell, { width: 22, textAlign: 'center' }]}>✔/✘</Text>
      </View>

      {CRITERIA.map((c, i) => {
        const score = scoreMap[c.key]
        const value = score?.score ?? 0
        const max = score?.max_score ?? 10
        const isPass = value >= 6
        const rowBg = i % 2 === 0 ? WHITE : SURFACE
        const ann = annotations.find(a => a.section?.toLowerCase().includes(c.category.toLowerCase().split(' ')[0]))

        return (
          <View key={`${c.key}-${i}`}>
            <View style={[s.scoreRow, { backgroundColor: rowBg }]}>
              <Text style={[s.scoreCell, { width: 18, fontFamily: 'Helvetica-Bold' }]}>{c.no}</Text>
              <Text style={[s.scoreCell, { width: 90, fontFamily: 'Helvetica-Bold', fontSize: 7.5 }]}>{c.category}</Text>
              <Text style={[s.scoreCell, { flex: 1, fontSize: 7.5 }]}>{c.criteria}</Text>
              <Text style={[s.scoreCell, { width: 30, textAlign: 'center', fontFamily: 'Helvetica-Bold', color: scoreColor(value) }]}>{value}</Text>
              <Text style={[s.scoreCell, { width: 25, textAlign: 'center', color: MUTED }]}>{max}</Text>
              <Text style={[s.scoreCell, { width: 22, textAlign: 'center', color: isPass ? GREEN : RED, fontFamily: 'Helvetica-Bold' }]}>{isPass ? '✔' : '✘'}</Text>
            </View>
            <View style={s.commentRow}>
              <Text style={s.commentLabel}>Reviewer&apos;s Comments:</Text>
              <Text style={s.commentText}>
                {score?.rationale || '—'}
                {(score?.improvements?.length ?? 0) > 0 ? `\n\nSuggested improvements: ${score!.improvements!.join(' | ')}` : ''}
                {ann?.suggestion ? `\n\nSpecific note (${ann.section}): ${ann.suggestion}` : ''}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

interface T1Props {
  session: ReviewSessionWithRelations
  generatedAt: string
}

type ReviewSessionWithRelations = {
  verdict?: string
  strength_summary?: string
  weakness_summary?: string
  scores?: Score[]
  annotations?: Annotation[]
  adversarial_critiques?: AdversarialCritique[]
  journal_matches?: JournalMatch[]
  drafts?: { manuscripts?: { title?: string; field?: string; doc_type?: string } }
}

export function Template1PDFDocument({ session, generatedAt }: T1Props) {
  const title = session?.drafts?.manuscripts?.title ?? 'Untitled Manuscript'
  const field = session?.drafts?.manuscripts?.field ?? '—'
  const docType = session?.drafts?.manuscripts?.doc_type?.replace(/_/g, ' ') ?? '—'
  const scores: Score[] = session?.scores ?? []
  const annotations: Annotation[] = session?.annotations ?? []
  const critiques: AdversarialCritique[] = session?.adversarial_critiques ?? []
  const journals: JournalMatch[] = session?.journal_matches ?? []
  const totalScore = scores.reduce((a, sc) => a + sc.score, 0)
  const maxScore = scores.reduce((a, sc) => a + (sc.max_score ?? 10), 0)
  const pct = maxScore > 0 ? ((totalScore / maxScore) * 100).toFixed(1) : '0.0'
  const vInfo = verdictInfo(session?.verdict)
  const majorRevisions = critiques.filter(c => c.severity === 'critical' || c.severity === 'major')

  return (
    <Document title={`ScholarLens Review 1 — ${title}`} author="ScholarLens AI">
      {/* PAGE 1 — HEADER + METADATA + SCORING */}
      <Page size="A4" style={s.page}>
        <View style={s.headerWrap}>
          <Text style={s.reportTitle}>PEER REVIEW REPORT</Text>
          <Text style={s.reportSub}>Assessment of Manuscript</Text>
          <Text style={s.reportDate}>Date of Review: {generatedAt}</Text>
        </View>

        <View style={[s.metaTable, s.mb14]}>
          <View style={s.metaRow}><Text style={s.metaLabel}>Manuscript Title</Text><Text style={s.metaValue}>{title}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Type of Article</Text><Text style={s.metaValue}>{docType}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Field</Text><Text style={s.metaValue}>{field}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Review Date</Text><Text style={s.metaValue}>{generatedAt}</Text></View>
        </View>

        <ScoreSection scores={scores} annotations={annotations} />

        <View style={s.mb14}>
          <Text style={[s.sectionHead, s.mb6]}>OVERALL SCORE</Text>
          {CRITERIA.map((c, i) => {
            const scoreMap: Record<string, Score> = {}
            scores.forEach(sc => { scoreMap[sc.dimension] = sc })
            const sc = scoreMap[c.key]
            return (
              <View key={i} style={{ flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}`, padding: '3 7' }}>
                <Text style={{ flex: 1, fontSize: 8 }}>{c.no}. {c.category}</Text>
                <Text style={{ width: 40, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{sc?.score ?? 0}</Text>
                <Text style={{ width: 30, textAlign: 'right', fontSize: 8, color: MUTED }}>/ {sc?.max_score ?? 10}</Text>
              </View>
            )
          })}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL SCORE</Text>
            <Text style={s.totalScore}>{totalScore} / {maxScore}</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#2A4A8A', padding: '4 7' }}>
            <Text style={[s.totalLabel, { fontSize: 8 }]}>PERCENTAGE SCORE</Text>
            <Text style={[s.totalScore, { fontSize: 8 }]}>{pct}% — {vInfo.label.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>ScholarLens · Review 1 · {title}</Text>
          <Text style={[s.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* PAGE 2 — RECOMMENDATION + RATIONALE */}
      <Page size="A4" style={s.page}>
        <View style={[s.headerWrap, { padding: '12 28' }]}>
          <Text style={[s.reportTitle, { fontSize: 13 }]}>FINAL RECOMMENDATION</Text>
        </View>

        <View style={s.mb14}>
          <View style={{ flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}`, padding: '5 7' }}>
            <Text style={{ width: 80, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Decision</Text>
            <View style={[s.verdictCell, { backgroundColor: vInfo.bg }]}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: vInfo.color }}>{vInfo.label.toUpperCase()} — SELECTED</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', padding: '5 7', backgroundColor: SURFACE }}>
            <Text style={{ width: 80, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Options</Text>
            <Text style={{ flex: 1, fontSize: 8, color: MUTED }}>(i) Accept  (ii) Minor Revision  (iii) Major Revision  (iv) Reject</Text>
          </View>
        </View>

        <View style={s.mb14}>
          <Text style={[s.sectionHead, s.mb6]}>RATIONALE FOR DECISION</Text>
          <Text style={{ fontSize: 8.5, lineHeight: 1.65, color: '#1E293B' }}>
            {session?.strength_summary ? `Strengths: ${session.strength_summary}\n\n` : ''}
            {session?.weakness_summary ? `Primary concern: ${session.weakness_summary}` : ''}
            {!session?.strength_summary && !session?.weakness_summary ? '—' : ''}
          </Text>
        </View>

        {majorRevisions.length > 0 && (
          <View style={s.mb14}>
            <Text style={[s.sectionHead, s.mb6]}>MAJOR REVISIONS REQUIRED</Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#1E3A6E', padding: '3 6' }}>
              <Text style={[s.scoreHCell, { width: 20 }]}>#</Text>
              <Text style={[s.scoreHCell, { width: 70 }]}>Area</Text>
              <Text style={[s.scoreHCell, { flex: 1 }]}>Required Action</Text>
            </View>
            {majorRevisions.map((c, i) => (
              <View key={c.id} style={[s.revRow, { backgroundColor: i % 2 === 0 ? WHITE : SURFACE }]}>
                <Text style={s.revNum}>{i + 1}</Text>
                <Text style={s.revArea}>{c.title.split(' ').slice(0, 4).join(' ')}</Text>
                <View style={s.revAction}>
                  {c.quoted_passage ? <Text style={{ fontSize: 7.5, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 3 }}>&ldquo;{c.quoted_passage.slice(0, 120)}{c.quoted_passage.length > 120 ? '…' : ''}&rdquo;</Text> : null}
                  <Text style={{ fontSize: 8, lineHeight: 1.5 }}>{c.required_fix}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {journals.length > 0 && (
          <View style={s.mb14}>
            <Text style={[s.sectionHead, s.mb6]}>RECOMMENDED SUBMISSION TARGETS</Text>
            {journals.slice(0, 3).map((j, i) => (
              <View key={j.id} style={{ flexDirection: 'row', borderBottom: `0.5px solid ${BORDER}`, padding: '4 7' }}>
                <Text style={{ width: 20, fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontSize: 8 }}>{j.journal_name}{j.publisher ? ` · ${j.publisher}` : ''}</Text>
                <Text style={{ width: 50, fontSize: 7.5, color: j.acceptance_band === 'high' ? GREEN : j.acceptance_band === 'medium' ? GOLD : RED, textAlign: 'right' }}>
                  {Math.round((j.fit_score ?? 0) * 100)}% fit
                </Text>
              </View>
            ))}
          </View>
        )}

        <View>
          <Text style={[s.sectionHead, s.mb6]}>STRENGTHS OF THE MANUSCRIPT</Text>
          {annotations.filter(a => a.severity === 'minor').slice(0, 5).map((a, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{a.comment}</Text>
            </View>
          ))}
          {session?.strength_summary && (
            <View style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{session.strength_summary}</Text>
            </View>
          )}
          <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 10, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>
            This review was conducted in accordance with the journal&apos;s peer review guidelines. The manuscript may require revision before it can be considered for publication.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>ScholarLens · Review 1 · {title}</Text>
          <Text style={[s.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
