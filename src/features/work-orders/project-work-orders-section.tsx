import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLatestWorkOrderUpdates, useProjectWorkOrders } from '@/features/work-orders/hooks'
import { WorkOrderCard } from '@/features/work-orders/work-order-card'
import { WorkOrderFormDialog } from '@/features/work-orders/work-order-form-dialog'
import { sortWorkOrders } from '@/lib/work-orders'

/** Project Detail (management): the subcontractor work orders on this project. */
export function ProjectWorkOrdersSection({ projectId }: { projectId: string }) {
  const [creating, setCreating] = useState(false)
  const { data: workOrders = [], isLoading } = useProjectWorkOrders(projectId)
  const { data: latest } = useLatestWorkOrderUpdates(workOrders.map((row) => row.id))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Work Orders</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Create Work Order
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading work orders…</p>
        ) : workOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No work orders yet. Create one for each subcontractor scope (for example Plumbing, Electrical, Tile).
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sortWorkOrders(workOrders).map((row) => (
              <WorkOrderCard key={row.id} workOrder={row} latestUpdate={latest?.get(row.id) ?? null} showSubcontractor />
            ))}
          </div>
        )}
      </CardContent>
      {creating ? <WorkOrderFormDialog open onOpenChange={setCreating} projectId={projectId} /> : null}
    </Card>
  )
}
