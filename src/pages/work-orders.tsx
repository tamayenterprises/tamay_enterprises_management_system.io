import { Navigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useMyReadiness } from '@/features/subcontractors/hooks'
import { MyWorkOrderGroups } from '@/features/work-orders/my-work-order-groups'
import { useMyWorkOrders } from '@/features/work-orders/hooks'
import { canSeeWorkOrders } from '@/lib/subcontractor-requirements'

/** Subcontractor: My Work Orders (Assigned, In Progress, Work Completed). */
export function WorkOrdersPage() {
  const { readiness, isLoading: readinessLoading, installed } = useMyReadiness()
  const { data: workOrders = [], isLoading } = useMyWorkOrders()

  if (readinessLoading || isLoading) return <LoadingState label="Loading work orders..." />
  if (installed && (!readiness || !canSeeWorkOrders(readiness.status))) return <Navigate to="/setup" replace />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">My Work Orders</h1>
        <p className="text-sm text-muted-foreground">Accept new work, start when you begin, add updates, and mark it completed when done.</p>
      </div>
      {workOrders.length === 0 ? (
        <EmptyState title="No work orders yet" description="New work from Tamay shows up here." />
      ) : (
        <MyWorkOrderGroups workOrders={workOrders} />
      )}
    </div>
  )
}
