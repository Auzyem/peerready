import type { ReportingGuidelineId } from './guidelines'

export interface DetectInput {
  docType?: string
  persona?: string
  title?: string
  abstract?: string
}

export interface DetectResult {
  id: ReportingGuidelineId
  rationale: string
}

const RCT_RE = /randomi[sz]ed\s+controlled\s+trials?|\bRCTs?\b/i
const ANIMAL_RE = /\b(mice|mouse|rats?|in vivo|animal model|murine|zebrafish)\b/i
const OBSERVATIONAL_RE = /\b(cohort|case[-\s]control|cross[-\s]sectional|observational)\b/i

// First match wins. Pure and deterministic — no model call.
export function detectGuideline(input: DetectInput): DetectResult {
  const text = `${input.title ?? ''} ${input.abstract ?? ''}`

  if (input.docType === 'systematic_review') {
    return { id: 'prisma_2020', rationale: 'Document type is a systematic review.' }
  }
  if (input.persona === 'biomedical_rct' || RCT_RE.test(text)) {
    return { id: 'consort_2010', rationale: 'The manuscript appears to report a randomized controlled trial.' }
  }
  if (ANIMAL_RE.test(text)) {
    return { id: 'arrive_2', rationale: 'The manuscript appears to describe in vivo animal research.' }
  }
  if (OBSERVATIONAL_RE.test(text)) {
    return { id: 'strobe', rationale: 'The manuscript appears to report an observational study.' }
  }
  return { id: 'generic', rationale: 'No study-type-specific guideline matched; using general reporting essentials.' }
}
