'use client'
import { useEffect, useState, useCallback } from 'react'
import { X, Download, Printer, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  sessionId: string
  manuscriptTitle: string
  onClose: () => void
}

export function PdfReportModal({ sessionId, manuscriptTitle, onClose }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPdf = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pdf/${sessionId}`)
      if (!res.ok) throw new Error(`Failed to generate PDF (${res.status})`)
      const blob = await res.blob()
      setPdfUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadPdf()
    return () => { setPdfUrl((u) => { if (u) URL.revokeObjectURL(u); return null }) }
  }, [loadPdf])

  function handleDownload() {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `scholarlens-review-${sessionId}.pdf`
    a.click()
  }

  function handlePrint() {
    if (!pdfUrl) return
    const w = window.open(pdfUrl)
    w?.addEventListener('load', () => w.print())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">PDF report — {manuscriptTitle}</span>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-muted/30 p-4">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="mb-2 h-6 w-6 animate-spin" />
              <span className="text-sm">Generating PDF…</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadPdf}>Retry</Button>
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title="PDF preview" className="h-full w-full rounded-md border bg-white" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button size="sm" onClick={handleDownload} disabled={!pdfUrl}>
            <Download className="h-4 w-4" /> Save PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!pdfUrl}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
