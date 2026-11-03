import { Badge } from '@/components/ui/badge'
import { READINESS_LABEL, readinessVariant } from '@/lib/subcontractor-requirements'
import type { SubcontractorReadinessStatus } from '@/types/database'

export function ReadinessBadge({
  status,
  management = false,
  className,
}: {
  status: SubcontractorReadinessStatus
  /** Management screens shout NOT READY TO WORK for anything that is not ready. */
  management?: boolean
  className?: string
}) {
  const label = management && status !== 'ready' ? 'NOT READY TO WORK' : READINESS_LABEL[status]
  return (
    <Badge variant={readinessVariant(status)} className={className}>
      {management && status === 'ready' ? 'READY TO WORK' : label}
    </Badge>
  )
}

export function RequirementProgress({ completed, total }: { completed: number; total: number }) {
  const percent = total === 0 ? 100 : Math.round((completed / total) * 100)
  return (
    <div className="space-y-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label="Requirements completed"
      >
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {completed} of {total} requirements completed
      </p>
    </div>
  )
}
