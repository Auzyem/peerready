import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { ReviewSession } from '@/lib/types'

const NAVY = '#0D1B4B'
const TEAL = '#0E7C6B'
const TEAL_LIGHT = '#E6F4F1'
const GOLD = '#C57B00'
const GOLD_LIGHT = '#FEF3C7'
const RED = '#B91C1C'
const RED_LIGHT = '#FEE2E2'
const GREEN = '#15803D'
const GREEN_LIGHT = '#DCFCE7'
const MUTED = '#64748B'
const BORDER = '#E2E8F0'
const SURFACE = '#F8FAFC'

const styles = StyleSheet.create({
  page: { fontSize: 10, color: '#0F172A', backgroundColor: '#fff', padding: 0 },
  header: { backgroundColor: NAVY, padding: '24 32', flexDirection: 'row', alignItems: 'center' },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  body: { padding: '20 32' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` },
  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 6, padding: 12, border: `0.5px solid ${BORDER}` },
  summaryLabel: { fontSize: 9, color: MUTED, marginBottom: 3 },
  summaryValue: { fontSize: 18, fontWeight: 700, color: NAVY },
  summarySmall: { fontSize: 9, color: MUTED, marginTop: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', padding: '5 0', borderBottom: `0.5px solid ${BORDER}` },
  scoreLabel: { flex: 1, fontSize: 10, color: '#0F172A', textTransform: 'capitalize' },
  scoreBar: { width: 80, height: 4, backgroundColor: BORDER, borderRadius: 2, marginRight: 8 },
  scoreBarFill: { height: 4, borderRadius: 2, backgroundColor: TEAL },
  scoreValue: { fontSize: 10, fontWeight: 700, color: '#0F172A', width: 32, textAlign: 'right' },
  verdictBadge: { padding: '4 12', borderRadius: 4, fontSize: 10, fontWeight: 700, alignSelf: 'flex-start', marginTop: 4 },
  annoCard: { backgroundColor: SURFACE, borderRadius: 4, padding: '8 10', marginBottom: 6, borderLeft: `3px solid ${BORDER}` },
  annoTitle: { fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 2 },
  annoBody: { fontSize: 9, color: MUTED, textTransform: 'capitalize' },
  critiqueCard: { border: `0.5px solid ${BORDER}`, borderRadius: 6, padding: 10, marginBottom: 8 },
  critiqueTitle: { fontSize: 10, fontWeight: 700, color: '#0F172A' },
  quoteBox: { backgroundColor: SURFACE, padding: '6 8', borderLeft: `2px solid ${BORDER}`, marginBottom: 6 },
  quoteText: { fontSize: 9, color: MUTED, fontStyle: 'italic' },
  fixBox: { backgroundColor: GREEN_LIGHT, padding: '6 8', borderRadius: 4, marginTop: 6 },
  fixText: { fontSize: 9, color: GREEN },
  journalCard: { flexDirection: 'row', alignItems: 'center', padding: '8 10', border: `0.5px solid ${BORDER}`, borderRadius: 6, marginBottom: 6 },
  journalRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EBF5FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  journalName: { fontSize: 11, fontWeight: 700, color: '#0F172A' },
  journalMeta: { fontSize: 9, color: MUTED },
  fitBadge: { fontSize: 9, padding: '2 6', borderRadius: 99 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', padding: '5 0', borderBottom: `0.5px solid ${BORDER}` },
  deltaLabel: { flex: 1, fontSize: 10, color: MUTED, textTransform: 'capitalize' },
  deltaPill: { fontSize: 9, padding: '2 6', borderRadius: 99 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, flexDirection: 'row', borderTop: `0.5px solid ${BORDER}`, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED, flex: 1 },
})

function verdictStyle(verdict: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    accept: { bg: GREEN_LIGHT, color: GREEN, label: 'Accept' },
    minor_revision: { bg: '#EBF5FF', color: '#1A56DB', label: 'Minor revision' },
    major_revision: { bg: GOLD_LIGHT, color: GOLD, label: 'Major revision' },
    reject: { bg: RED_LIGHT, color: RED, label: 'Reject' },
  }
  return map[verdict] ?? { bg: SURFACE, color: MUTED, label: verdict || '—' }
}

function severityColor(severity: string) {
  if (severity === 'critical') return RED
  if (severity === 'major') return GOLD
  return '#94A3B8'
}

export interface ReviewPdfProps {
  session: ReviewSession & {
    drafts?: { version_number?: number; manuscripts?: { title?: string; abstract?: string } }
  }
  generatedAt: string
}

export function ReviewPDFDocument({ session, generatedAt }: ReviewPdfProps) {
  const v = verdictStyle(session.verdict ?? '')
  const title = session.drafts?.manuscripts?.title ?? 'Untitled manuscript'
  const reviewNumber = session.drafts?.version_number
  const headerTitle = reviewNumber ? `ScholarLens — Review ${reviewNumber}` : 'ScholarLens — Review report'
  const scores = session.scores ?? []
  const annotations = session.annotations ?? []
  const critiques = session.adversarial_critiques ?? []
  const journals = session.journal_matches ?? []
  const totalScore = scores.reduce((s, x) => s + (x.score ?? 0), 0)
  const delta = session.score_delta

  return (
    <Document title={`ScholarLens Review — ${title}`} author="ScholarLens AI">
      {/* PAGE 1: OVERVIEW */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <Text style={styles.headerSub}>{title}</Text>
            <Text style={[styles.headerSub, { marginTop: 4 }]}>Generated {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Overall score</Text>
              <Text style={styles.summaryValue}>{totalScore}<Text style={{ fontSize: 12, color: MUTED }}>/80</Text></Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Verdict</Text>
              <View style={[styles.verdictBadge, { backgroundColor: v.bg }]}>
                <Text style={{ color: v.color }}>{v.label}</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Annotations</Text>
              <Text style={styles.summaryValue}>{annotations.length}</Text>
              <Text style={styles.summarySmall}>{annotations.filter((a) => a.severity === 'critical').length} critical</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Adversarial issues</Text>
              <Text style={styles.summaryValue}>{critiques.length}</Text>
              <Text style={styles.summarySmall}>{critiques.filter((c) => c.severity === 'critical').length} critical</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: GREEN_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Greatest strength</Text>
                <Text style={{ fontSize: 10, color: '#0F172A' }}>{session.strength_summary ?? '—'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: RED_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: RED, marginBottom: 4 }}>Critical weakness</Text>
                <Text style={{ fontSize: 10, color: '#0F172A' }}>{session.weakness_summary ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score breakdown</Text>
            {scores.map((score) => (
              <View key={score.dimension} style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>{score.dimension.replace(/_/g, ' ')}</Text>
                <View style={styles.scoreBar}>
                  <View style={[styles.scoreBarFill, { width: `${(score.score / 10) * 100}%`, backgroundColor: score.score >= 7 ? TEAL : score.score >= 5 ? GOLD : RED }]} />
                </View>
                <Text style={styles.scoreValue}>{score.score}/10</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inline annotations</Text>
            {annotations.map((anno) => (
              <View key={anno.id} style={[styles.annoCard, { borderLeftColor: severityColor(anno.severity) }]}>
                <Text style={styles.annoTitle}>{anno.comment}</Text>
                <Text style={styles.annoBody}>{[anno.section, anno.severity, anno.suggestion].filter(Boolean).join(' · ')}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>ScholarLens · Review report · {title}</Text>
          <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* PAGE 2: ADVERSARIAL (only if critiques exist) */}
      {critiques.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: '#1e293b' }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Adversarial review</Text>
              <Text style={styles.headerSub}>Stress-test critique — {critiques.length} issues identified</Text>
            </View>
          </View>
          <View style={styles.body}>
            {critiques.map((critique) => (
              <View key={critique.id} style={styles.critiqueCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: severityColor(critique.severity) }} />
                  <Text style={styles.critiqueTitle}>{critique.title}</Text>
                  <View style={{ marginLeft: 'auto' }}>
                    <Text style={{ fontSize: 8, color: MUTED }}>{critique.section_reference}</Text>
                  </View>
                </View>
                {critique.quoted_passage ? (
                  <View style={styles.quoteBox}><Text style={styles.quoteText}>&quot;{critique.quoted_passage}&quot;</Text></View>
                ) : null}
                <Text style={{ fontSize: 9, color: '#0F172A', marginBottom: 6, lineHeight: 1.5 }}>{critique.objection}</Text>
                <View style={styles.fixBox}>
                  <Text style={{ fontSize: 8, fontWeight: 700, color: GREEN, marginBottom: 2 }}>To satisfy this objection:</Text>
                  <Text style={styles.fixText}>{critique.required_fix}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Adversarial review · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* PAGE 3: JOURNALS (only if matches exist) */}
      {journals.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: '#0C447C' }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Journal targets</Text>
              <Text style={styles.headerSub}>{journals.length} recommended submission targets ranked by fit</Text>
            </View>
          </View>
          <View style={styles.body}>
            {journals.map((journal) => {
              const fitColor = journal.acceptance_band === 'high' ? GREEN : journal.acceptance_band === 'medium' ? GOLD : RED
              const fitBg = journal.acceptance_band === 'high' ? GREEN_LIGHT : journal.acceptance_band === 'medium' ? GOLD_LIGHT : RED_LIGHT
              return (
                <View key={journal.id} style={styles.journalCard}>
                  <View style={styles.journalRank}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#1A56DB' }}>{journal.rank}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.journalName}>{journal.journal_name}</Text>
                    <Text style={styles.journalMeta}>{[journal.publisher, journal.impact_factor_range ? `IF ${journal.impact_factor_range}` : null, journal.avg_decision_days ? `~${journal.avg_decision_days} days` : null].filter(Boolean).join(' · ')}</Text>
                    {journal.key_change_required ? (
                      <Text style={[styles.journalMeta, { marginTop: 3, color: '#0F172A' }]}>{journal.key_change_required}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.fitBadge, { backgroundColor: fitBg }]}>
                    <Text style={{ color: fitColor }}>{Math.round((journal.fit_score ?? 0) * 100)}%</Text>
                  </View>
                </View>
              )
            })}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Journal targets · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* PAGE 4: PROGRESS (only if score_delta exists) */}
      {delta && (
        <Page size="A4" style={styles.page}>
          <View style={[styles.header, { backgroundColor: TEAL }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Progress</Text>
              <Text style={styles.headerSub}>Score delta vs. the previous draft</Text>
            </View>
          </View>
          <View style={styles.body}>
            <View style={{ backgroundColor: TEAL_LIGHT, padding: 10, borderRadius: 6, marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: '#085041' }}>{delta.overall_summary}</Text>
            </View>
            <Text style={styles.sectionTitle}>Dimension changes</Text>
            {delta.dimension_changes?.map((d) => (
              <View key={d.dimension} style={styles.deltaRow}>
                <Text style={styles.deltaLabel}>{d.dimension.replace(/_/g, ' ')}</Text>
                <Text style={{ fontSize: 9, color: MUTED, marginRight: 8 }}>{d.v1_score} → {d.v2_score}</Text>
                <View style={[styles.deltaPill, { backgroundColor: d.direction === 'improved' ? GREEN_LIGHT : d.direction === 'regressed' ? RED_LIGHT : SURFACE }]}>
                  <Text style={{ color: d.direction === 'improved' ? GREEN : d.direction === 'regressed' ? RED : MUTED }}>
                    {d.delta > 0 ? '+' : ''}{d.delta}
                  </Text>
                </View>
              </View>
            ))}
            {delta.new_problems_introduced?.length ? (
              <View style={{ marginTop: 14, backgroundColor: RED_LIGHT, padding: 10, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 6 }}>New issues introduced in this revision</Text>
                {delta.new_problems_introduced.map((p, i) => (
                  <Text key={i} style={{ fontSize: 9, color: '#0F172A', marginBottom: 3 }}>• {p}</Text>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>ScholarLens · Progress report · {title}</Text>
            <Text style={[styles.footerText, { textAlign: 'right' }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
