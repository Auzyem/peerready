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
        <path
          d="M16 27.5L22.5 34L37 19"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isDark ? 'stroke-pr-navy' : 'stroke-pr-teal'}
        />
      </svg>
      {showWordmark && (
        <span
          className={cn(spaceGrotesk.className, 'font-semibold tracking-tight')}
          style={{ fontSize: size * 0.65 }}
        >
          <span className={isDark ? 'text-white' : 'text-pr-navy'}>Peer</span>
          <span className={isDark ? 'text-[#7FD3DF]' : 'text-pr-teal'}>Ready</span>
        </span>
      )}
    </span>
  )
}
