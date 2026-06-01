'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ReportingChecklist } from '../ReportingChecklist'
import { detectGuideline } from '@/lib/reporting/detect'
import { GUIDELINES, GUIDELINE_IDS, type ReportingGuidelineId } from '@/lib/reporting/guidelines'
import type { ReviewSession } from '@/lib/types'

type Status = 'not_started' | 'running' | 'complete' | 'failed'

export function ReportingSection({
  session, status, starting, onStart,
}: {
  session: ReviewSession
  status: Status
  starting: boolean
  onStart: (guidelineId: ReportingGuidelineId) => void
}) {
  const [selected, setSelected] = useState<ReportingGuidelineId | null>(null)
  const manuscript = (session as unknown as {
    drafts?: { manuscripts?: { doc_type?: string; title?: string; abstract?: string } }
  }).drafts?.manuscripts
  const detected = detectGuideline({
    docType: manuscript?.doc_type,
    persona: session.reviewer_persona,
    title: manuscript?.title,
    abstract: manuscript?.abstract,
  })
  const activeGuideline: ReportingGuidelineId =
    selected ?? (session.reporting_guideline_id as ReportingGuidelineId) ?? detected.id

  return (
    <div className="space-y-4">
      {status === 'not_started' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Check this manuscript against a reporting-guideline checklist. Detected: {detected.rationale}
          </p>
          <select
            aria-label="Reporting guideline"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={activeGuideline}
            onChange={(e) => setSelected(e.target.value as ReportingGuidelineId)}
          >
            {GUIDELINE_IDS.map((id) => (
              <option key={id} value={id}>{GUIDELINES[id].name}</option>
            ))}
          </select>
          <div>
            <Button onClick={() => onStart(activeGuideline)} disabled={starting}>
              {starting ? 'Starting…' : 'Run compliance check'}
            </Button>
          </div>
        </div>
      )}
      {status === 'running' && (
        <div className="max-w-md">
          <p className="mb-2">Running compliance check…</p>
          <Progress value={50} />
        </div>
      )}
      {status === 'complete' && (
        <div className="space-y-4">
          {session.reporting_summary && (
            <p className="text-sm"><strong>Summary:</strong> {session.reporting_summary}</p>
          )}
          <ReportingChecklist
            items={session.reporting_checklist_items ?? []}
            guidelineName={
              session.reporting_guideline_id
                ? GUIDELINES[session.reporting_guideline_id as ReportingGuidelineId]?.name
                : undefined
            }
          />
        </div>
      )}
      {status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Compliance check failed.</p>
          <Button onClick={() => onStart(activeGuideline)} disabled={starting}>
            {starting ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}
    </div>
  )
}
