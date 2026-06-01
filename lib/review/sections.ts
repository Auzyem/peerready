export type SectionId = 'overview' | 'adversarial' | 'journals' | 'reporting' | 'progress'

export const SECTION_LABELS: Record<SectionId, string> = {
  overview: 'Overview',
  adversarial: 'Adversarial',
  journals: 'Journals',
  reporting: 'Reporting',
  progress: 'Progress',
}

export function reviewSectionIds(hasProgress: boolean): SectionId[] {
  const base: SectionId[] = ['overview', 'adversarial', 'journals', 'reporting']
  return hasProgress ? [...base, 'progress'] : base
}
