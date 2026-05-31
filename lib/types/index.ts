export type CareerStage = 'phd_student' | 'postdoc' | 'junior_faculty' | 'senior_faculty' | 'independent'
export type DocType = 'journal_article' | 'thesis_chapter' | 'conference_paper' | 'grant_proposal' | 'systematic_review'
export type ReviewStatus = 'queued' | 'routing' | 'awaiting_confirmation' | 'reviewing' | 'adversarial' | 'matching' | 'comparing' | 'complete' | 'failed'
export type Verdict = 'accept' | 'minor_revision' | 'major_revision' | 'reject'
export type Severity = 'critical' | 'major' | 'minor'
export type AcceptanceBand = 'high' | 'medium' | 'low'
export type ScoreDimension =
  | 'originality' | 'significance' | 'methodology' | 'evidence_quality'
  | 'literature_engagement' | 'internal_logic' | 'presentation_clarity' | 'ethical_compliance'

export type ReviewerPersona =
  | 'biomedical_rct' | 'social_science_quant' | 'social_science_qual'
  | 'cs_systems' | 'cs_ml_theory' | 'economics_theory' | 'humanities_interpretive'
  | 'environmental_science' | 'engineering_applied' | 'education_research'

export interface Profile {
  id: string
  email: string
  full_name?: string
  institution?: string
  discipline?: string
  career_stage?: CareerStage
  native_language?: string
  created_at: string
}

export interface Manuscript {
  id: string
  user_id: string
  title: string
  abstract?: string
  field?: string
  subfield?: string
  doc_type?: DocType
  submission_target?: string
  word_count?: number
  created_at: string
  updated_at: string
  drafts?: Draft[]
}

export interface Draft {
  id: string
  manuscript_id: string
  version_number: number
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'docx'
  parsed_text?: string
  parsed_sections?: Record<string, string>
  created_at: string
  review_sessions?: ReviewSession[]
}

export interface ReviewSession {
  id: string
  draft_id: string
  status: ReviewStatus
  reviewer_persona?: ReviewerPersona
  mode: 'standard' | 'adversarial' | 'journal_focused'
  routing_confidence?: number
  overall_score?: number
  verdict?: Verdict
  strength_summary?: string
  weakness_summary?: string
  score_delta?: ProgressComparatorResult
  error_message?: string
  adversarial_status?: 'not_started' | 'running' | 'complete' | 'failed'
  adversarial_summary?: string
  journal_match_status?: 'not_started' | 'running' | 'complete' | 'failed'
  created_at: string
  completed_at?: string
  scores?: Score[]
  annotations?: Annotation[]
  journal_matches?: JournalMatch[]
  adversarial_critiques?: AdversarialCritique[]
}

export interface Score {
  id: string
  session_id: string
  dimension: ScoreDimension
  score: number
  max_score: number
  rationale?: string
  improvements?: string[]
}

export interface Annotation {
  id: string
  session_id: string
  section?: string
  char_start?: number
  char_end?: number
  severity: Severity
  comment: string
  suggestion?: string
  resolved: boolean
}

export interface JournalMatch {
  id: string
  session_id: string
  rank: number
  journal_name: string
  publisher?: string
  fit_score: number
  acceptance_band: AcceptanceBand
  impact_factor_range?: string
  avg_decision_days?: number
  key_change_required?: string
  open_access_options?: string
  apc_cost?: string
  rationale?: string
}

export interface AdversarialCritique {
  id: string
  session_id: string
  critique_number: number
  severity: Severity
  title: string
  quoted_passage?: string
  objection: string
  required_fix: string
  section_reference?: string
  resolved: boolean
}

export interface AdversarialReviewerResult {
  summary: string
  critiques: Array<{
    severity: Severity
    title: string
    quoted_passage: string
    objection: string
    required_fix: string
    section_reference: string
  }>
}

export interface JournalMatchResult {
  journals: Array<{
    rank: number
    journal_name: string
    publisher: string
    fit_score: number
    acceptance_band: AcceptanceBand
    impact_factor_range: string
    avg_decision_days: number
    key_change_required: string
    open_access_options: string
    apc_cost: string
    rationale: string
  }>
}

export interface ProgressComparatorResult {
  dimension_changes: Array<{
    dimension: ScoreDimension
    v1_score: number
    v2_score: number
    delta: number
    direction: 'improved' | 'regressed' | 'unchanged'
    cause?: string
    comment_addressed: 'fully' | 'partially' | 'not_addressed'
  }>
  overall_summary: string
  top_improvements: string[]
  remaining_issues: string[]
  readiness: 'not_ready' | 'minor_fixes' | 'submission_ready'
  recommended_action: string
  new_problems_introduced: string[]
}

export interface DisciplineRouterResult {
  field: string
  subfield: string
  doc_type: DocType
  persona: ReviewerPersona
  confidence: number
  reasoning: string
}

export interface DeepReviewerResult {
  scores: Array<{ dimension: ScoreDimension; score: number; rationale: string; improvements: string[] }>
  verdict: Verdict
  overall_score: number
  strength_summary: string
  weakness_summary: string
  annotations: Array<{
    section: string
    severity: Severity
    comment: string
    suggestion: string
  }>
}
