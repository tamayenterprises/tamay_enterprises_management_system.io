import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/subcontractor-requirements'
import { formatRelative, fullName } from '@/lib/utils'
import {
  WORK_ORDER_STATUS_LABEL,
  formatMoney,
  formatWorkOrderNumber,
  workOrderStatusVariant,
} from '@/lib/work-orders'
import type { WorkOrderProjectSummary, WorkOrderRecord, WorkOrderUpdateRecord } from '@/types/database'

/** Compact, mobile-first work order card (subcontractor lists and management project view). */
export function WorkOrderCard({
  workOrder,
  project,
  latestUpdate,
  showSubcontractor = false,
  offerSummary,
}: {
  workOrder: WorkOrderRecord
  project?: Pick<WorkOrderProjectSummary, 'project_name' | 'job_address'> | null
  latestUpdate?: WorkOrderUpdateRecord | null
  /** Management view: show who has it (or who it was offered to). */
  showSubcontractor?: boolean
  offerSummary?: string | null
}) {
  const sub = workOrder.subcontractor
  const subName = sub ? sub.company_name || fullName(sub.first_name, sub.last_name) : offerSummary || 'Not sent yet'
  const awaitingAnswer = workOrder.status === 'offered' || workOrder.status === 'assigned'
  const statusLabel = !showSubcontractor && awaitingAnswer ? 'New Offer' : WORK_ORDER_STATUS_LABEL[workOrder.status]
  const latestText = latestUpdate
    ? latestUpdate.issue_question || latestUpdate.completed_today || latestUpdate.next_steps || 'Photos added'
    : null

  return (
    <article className="min-w-0 space-y-2 rounded-lg border border-border bg-card px-4 py-3 shadow-sm" data-testid="work-order-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {formatWorkOrderNumber(workOrder.work_order_number)}
            {workOrder.trade ? ` · ${workOrder.trade}` : ''}
          </p>
          <h3 className="line-clamp-2 font-semibold">{workOrder.title}</h3>
          {showSubcontractor ? <p className={sub ? 'truncate text-sm' : 'text-sm text-muted-foreground'}>{subName}</p> : null}
          {project ? (
            <p className="flex items-start gap-1 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {project.project_name}
                {project.job_address ? ` · ${project.job_address}` : ''}
              </span>
            </p>
          ) : null}
        </div>
        <Badge className="shrink-0 whitespace-nowrap" variant={workOrderStatusVariant(workOrder.status)}>
          {statusLabel}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          workOrder.agreed_price != null ? `Price ${formatMoney(workOrder.agreed_price)}` : null,
          workOrder.start_date ? `Starts ${formatDay(workOrder.start_date)}` : null,
          workOrder.target_completion_date ? `Target ${formatDay(workOrder.target_completion_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {latestText ? (
        <p className="truncate text-xs">
          <span className="text-muted-foreground">Latest update {formatRelative(latestUpdate!.created_at)}:</span> {latestText}
        </p>
      ) : null}
      <Button asChild size="sm" variant="outline">
        <Link to={`/work-orders/${workOrder.id}`}>View Work Order</Link>
      </Button>
    </article>
  )
}
