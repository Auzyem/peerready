import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  feature: string
  requiredPlan: string
  description?: string
}

export function UpgradePrompt({ feature, requiredPlan, description }: Props) {
  const planDisplay = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
      <Zap className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-medium">{feature} requires the {planDisplay} plan</div>
        <p className="mb-3 text-sm opacity-80">
          {description ?? `Upgrade to ${planDisplay} to unlock this feature.`}
        </p>
        <Button asChild size="sm">
          <Link href="/billing"><Zap className="h-3.5 w-3.5" /> Upgrade now</Link>
        </Button>
      </div>
    </div>
  )
}
