import { Space_Grotesk } from 'next/font/google'
import { cn } from '@/lib/utils'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['600'] })

interface LogoProps {
  /** `light` = navy mark on light backgrounds. `dark` = teal mark on dark surfaces (e.g. the navy sidebar). */
  variant?: 'light' | 'dark'
  size?: number
  showWordmark?: boolean
  className?: string
}

export function Logo({ variant = 'light', size = 32, showWordmark = true, className }: LogoProps) {
  const isDark = variant === 'dark'
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="49" height="49" rx="14" className={isDark ? 'fill-pr-teal' : 'fill-pr-navy'} />
        <circle
          cx="22"
          cy="22"
          r="9"
          strokeWidth="5"
          className={isDark ? 'stroke-pr-navy' : 'stroke-white'}
        />
        <circle cx="22" cy="22" r="4" className={isDark ? 'fill-pr-navy' : 'fill-pr-teal'} />
        <path
          d="M28.5 28.5L38 38"
          strokeWidth="5"
          strokeLinecap="round"
          className={isDark ? 'stroke-pr-navy' : 'stroke-white'}
        />
      </svg>
      {showWordmark && (
        <span
          className={cn(spaceGrotesk.className, 'font-semibold tracking-tight')}
          style={{ fontSize: size * 0.65 }}
        >
          <span className={isDark ? 'text-white' : 'text-pr-navy'}>Scholar</span>
          <span className={isDark ? 'text-[#7FD3DF]' : 'text-pr-teal'}>Lens</span>
        </span>
      )}
    </span>
  )
}
