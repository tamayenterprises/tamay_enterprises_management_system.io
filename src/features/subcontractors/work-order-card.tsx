import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, MapPin, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateWorkOrder, type WorkOrder } from '@/features/subcontractors/hooks'
import {
  WORK_ORDER_STATUS_LABEL,
  formatDay,
  workOrderAction,
  workOrderDisplayStatus,
  workOrderStatusVariant,
} from '@/lib/subcontractor-requirements'
import { formatDate } from '@/lib/utils'

export function WorkOrderCard({
  workOrder,
  readyToWork,
  showViewLink = true,
}: {
  workOrder: WorkOrder
  readyToWork: boolean
  showViewLink?: boolean
}) {
  const update = useUpdateWorkOrder()
  const [completing, setCompleting] = useState(false)
  const [note, setNote] = useState('')
  const status = workOrderDisplayStatus(workOrder.work_status, readyToWork)
  const action = workOrderAction(status)
  const project = workOrder.project
  const place = project?.job_site_address || project?.location

  async function run(next: 'start' | 'complete') {
    try {
      await update.mutateAsync({ assignmentId: workOrder.id, action: next, note: next === 'complete' ? note : null })
      toast.success(next === 'start' ? 'Work started' : 'Work marked completed')
      setCompleting(false)
      setNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the work order')
    }
  }

  return (
    <article className="space-y-2 rounded-lg border border-border bg-card px-4 py-3 shadow-sm" data-testid="work-order-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{project?.name ?? 'Project'}</h3>
          {place ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{place}</span>
            </p>
          ) : null}
        </div>
        <Badge variant={workOrderStatusVariant(status)}>{WORK_ORDER_STATUS_LABEL[status]}</Badge>
      </div>
      {workOrder.work_scope ? <p className="text-sm">Scope: {workOrder.work_scope}</p> : null}
      <p className="text-xs text-muted-foreground">
        {status === 'completed' && workOrder.completed_at
          ? `Work Completed ${formatDate(workOrder.completed_at)}`
          : [
              project?.start_date ? `Starts ${formatDay(project.start_date)}` : null,
              project?.deadline ? `Target ${formatDay(project.deadline)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || `Assigned ${formatDate(workOrder.assigned_at)}`}
      </p>
      {status === 'assigned' ? (
        <p className="text-xs font-medium text-destructive">Complete your setup before starting this work order.</p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {showViewLink ? (
          <Button asChild size="sm" variant="outline">
            <Link to={`/work-orders/${workOrder.id}`}>View Work Order</Link>
          </Button>
        ) : null}
        {action === 'start' ? (
          <Button size="sm" disabled={update.isPending} onClick={() => void run('start')}>
            <Play className="mr-1 h-4 w-4" aria-hidden />
            Start Work
          </Button>
        ) : null}
        {action === 'complete' ? (
          <Button size="sm" disabled={update.isPending} onClick={() => setCompleting(true)}>
            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
            Complete Work
          </Button>
        ) : null}
      </div>
      <Dialog open={completing} onOpenChange={(open) => !update.isPending && setCompleting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this work order?</DialogTitle>
            <DialogDescription>Tamay is notified that the work is done.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor={`complete-note-${workOrder.id}`}>Completion note (optional)</Label>
            <Textarea
              id={`complete-note-${workOrder.id}`}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={update.isPending} onClick={() => setCompleting(false)}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={() => void run('complete')}>
              Complete Work
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
