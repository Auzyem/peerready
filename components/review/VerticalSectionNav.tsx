'use client'
import { reviewSectionIds, SECTION_LABELS, type SectionId } from '@/lib/review/sections'

export function VerticalSectionNav({
  active, onSelect, hasProgress,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
  hasProgress: boolean
}) {
  const ids = reviewSectionIds(hasProgress)
  return (
    <nav className="overflow-hidden rounded-lg border bg-card">
      {ids.map((id, i) => {
        const isActive = id === active
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex w-full items-center px-3.5 py-2.5 text-left text-sm transition-colors ${
              i > 0 ? 'border-t' : ''
            } ${
              isActive
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted-foreground hover:bg-accent/5 hover:text-foreground'
            }`}
          >
            {isActive && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent" />}
            {SECTION_LABELS[id]}
          </button>
        )
      })}
    </nav>
  )
}
