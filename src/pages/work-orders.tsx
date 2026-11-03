import { Link, Navigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useMyReadiness, useMyWorkOrders } from '@/features/subcontractors/hooks'
import { WorkOrderCard } from '@/features/subcontractors/work-order-card'
import { canSeeWorkOrders, sortWorkOrders } from '@/lib/subcontractor-requirements'
import { formatDate } from '@/lib/utils'

function useWorkOrderAccess() {
  const { readiness, isLoading, installed } = useMyReadiness()
  return {
    loading: isLoading,
    allowed: installed && Boolean(readiness && canSeeWorkOrders(readiness.status)),
    ready: readiness?.status === 'ready',
  }
}

export function WorkOrdersPage() {
  const access = useWorkOrderAccess()
  const { data: workOrders = [], isLoading } = useMyWorkOrders()

  if (access.loading || isLoading) return <LoadingState label="Loading work orders..." />
  if (!access.allowed) return <Navigate to="/setup" replace />

  const open = sortWorkOrders(workOrders.filter((row) => row.work_status !== 'completed'))
  const completed = sortWorkOrders(workOrders.filter((row) => row.work_status === 'completed'))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Work Orders</h1>
        <p className="text-sm text-muted-foreground">Start each job when you begin, and mark it complete when the work is done.</p>
      </div>
      {open.length === 0 && completed.length === 0 ? (
        <EmptyState title="No work orders yet" description="New work from Tamay shows up here." />
      ) : null}
      {open.map((row) => (
        <WorkOrderCard key={row.id} workOrder={row} readyToWork={access.ready} />
      ))}
      {completed.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Work Completed</h2>
          {completed.map((row) => (
            <WorkOrderCard key={row.id} workOrder={row} readyToWork={access.ready} />
          ))}
        </section>
      ) : null}
    </div>
  )
}

export function WorkOrderDetailPage() {
  const { assignmentId } = useParams()
  const access = useWorkOrderAccess()
  const { data: workOrders = [], isLoading } = useMyWorkOrders()

  if (access.loading || isLoading) return <LoadingState label="Loading work order..." />
  if (!access.allowed) return <Navigate to="/setup" replace />

  const workOrder = workOrders.find((row) => row.id === assignmentId)
  if (!workOrder) {
    return <EmptyState title="Work order not found" description="It may have been closed or reassigned." />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild size="sm" variant="outline">
        <Link to="/work-orders">← All Work Orders</Link>
      </Button>
      <WorkOrderCard workOrder={workOrder} readyToWork={access.ready} showViewLink={false} />
      <div className="space-y-1 rounded-md border border-border px-4 py-3 text-sm">
        <p>
          <span className="text-muted-foreground">Assigned:</span> {formatDate(workOrder.assigned_at)}
        </p>
        {workOrder.started_at ? (
          <p>
            <span className="text-muted-foreground">Started:</span> {formatDate(workOrder.started_at, 'MMM d, yyyy h:mm a')}
          </p>
        ) : null}
        {workOrder.completed_at ? (
          <p>
            <span className="text-muted-foreground">Completed:</span> {formatDate(workOrder.completed_at, 'MMM d, yyyy h:mm a')}
          </p>
        ) : null}
        {workOrder.completion_note ? (
          <p>
            <span className="text-muted-foreground">Completion note:</span> {workOrder.completion_note}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Project updates from Tamay are on the Updates page.</p>
    </div>
  )
}
