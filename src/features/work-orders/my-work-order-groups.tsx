import { useWorkOrderProjectSummaries } from '@/features/work-orders/hooks'
import { WorkOrderCard } from '@/features/work-orders/work-order-card'
import { sortWorkOrders, workOrderGroup, type WorkOrderGroup } from '@/lib/work-orders'
import type { WorkOrderRecord } from '@/types/database'

const GROUPS: Array<{ key: WorkOrderGroup; title: string }> = [
  { key: 'assigned', title: 'Assigned' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'work_completed', title: 'Work Completed' },
]

/** Subcontractor work orders grouped Assigned / In Progress / Work Completed. */
export function MyWorkOrderGroups({ workOrders, completedLimit }: { workOrders: WorkOrderRecord[]; completedLimit?: number }) {
  const { data: summaries } = useWorkOrderProjectSummaries(workOrders.map((row) => row.id))
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        let rows = sortWorkOrders(workOrders.filter((row) => workOrderGroup(row.status) === group.key))
        if (group.key === 'work_completed' && completedLimit) rows = rows.slice(0, completedLimit)
        if (rows.length === 0) return null
        return (
          <section key={group.key} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title} ({rows.length})
            </h2>
            {rows.map((row) => (
              <WorkOrderCard key={row.id} workOrder={row} project={summaries?.get(row.id)} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
