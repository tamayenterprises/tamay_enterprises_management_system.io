import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/features/auth/auth-hooks'
import { useMyReadiness } from '@/features/subcontractors/hooks'
import { useUpdateWorkOrderStatus, useWorkOrder, useWorkOrderProjectSummaries } from '@/features/work-orders/hooks'
import { WorkOrderReferenceFiles } from '@/features/work-orders/work-order-files'
import { WorkOrderFormDialog } from '@/features/work-orders/work-order-form-dialog'
import { WorkOrderUpdates } from '@/features/work-orders/work-order-updates'
import { formatDay } from '@/lib/subcontractor-requirements'
import { confirmAction } from '@/lib/uploads'
import { formatDate, fullName, isManagementRole } from '@/lib/utils'
import {
  WORK_ORDER_STATUS_LABEL,
  canCloseWorkOrder,
  formatMoney,
  formatWorkOrderNumber,
  subcontractorActions,
  workOrderStatusVariant,
} from '@/lib/work-orders'

export function WorkOrderDetailPage() {
  const { workOrderId = '' } = useParams()
  const { profile } = useAuth()
  const { data: workOrder, isLoading } = useWorkOrder(workOrderId)
  const { data: summaries } = useWorkOrderProjectSummaries(workOrderId ? [workOrderId] : [])
  const { readiness, installed: readinessInstalled } = useMyReadiness()
  const update = useUpdateWorkOrderStatus()
  const [editing, setEditing] = useState(false)

  if (isLoading) return <LoadingState label="Loading work order..." />
  if (!workOrder) return <EmptyState title="Work order not found" description="It may have been removed or reassigned." />

  const manage = isManagementRole(profile?.role)
  const isAssignee = workOrder.subcontractor_id === profile?.id
  const project = summaries?.get(workOrder.id)
  const actions = isAssignee ? subcontractorActions(workOrder.status) : []
  const notReady = readinessInstalled && readiness != null && readiness.status !== 'ready'
  const sub = workOrder.subcontractor
  const subName = sub ? sub.company_name || fullName(sub.first_name, sub.last_name) : 'Subcontractor'

  async function run(action: 'accept' | 'start' | 'complete' | 'close', message: string) {
    try {
      await update.mutateAsync({ workOrderId: workOrder!.id, action })
      toast.success(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the work order')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild size="sm" variant="outline">
        {manage ? <Link to={`/projects/${workOrder.project_id}`}>← Project</Link> : <Link to="/work-orders">← My Work Orders</Link>}
      </Button>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {formatWorkOrderNumber(workOrder.work_order_number)}
            {workOrder.trade ? ` · ${workOrder.trade}` : ''}
          </p>
          <Badge variant={workOrderStatusVariant(workOrder.status)}>{WORK_ORDER_STATUS_LABEL[workOrder.status]}</Badge>
        </div>
        <h1 className="font-display text-2xl font-semibold">{workOrder.title}</h1>
        {project ? (
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {project.project_name}
              {project.job_address ? ` · ${project.job_address}` : ''}
            </span>
          </p>
        ) : null}
        {manage ? <p className="text-sm">Subcontractor: {subName}</p> : null}
      </div>

      {actions.length > 0 || manage ? (
        <div className="flex flex-wrap gap-2">
          {actions.includes('accept') ? (
            <Button disabled={update.isPending} onClick={() => void run('accept', 'Work order accepted')}>
              Accept Work Order
            </Button>
          ) : null}
          {actions.includes('start') ? (
            <Button disabled={update.isPending || notReady} onClick={() => void run('start', 'Work started')}>
              Start Work
            </Button>
          ) : null}
          {actions.includes('complete') ? (
            <Button
              disabled={update.isPending}
              onClick={() => {
                if (!confirmAction('Mark this work order as completed? Tamay will review it.')) return
                void run('complete', 'Marked Work Completed — Tamay has been notified')
              }}
            >
              Mark Work Completed
            </Button>
          ) : null}
          {manage && workOrder.status !== 'closed' ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
          {canCloseWorkOrder(profile?.role, workOrder.status) ? (
            <Button
              variant={workOrder.status === 'work_completed' ? 'default' : 'outline'}
              disabled={update.isPending}
              onClick={() => {
                if (!confirmAction('Close this work order?')) return
                void run('close', 'Work order closed')
              }}
            >
              Close Work Order
            </Button>
          ) : null}
        </div>
      ) : null}
      {actions.includes('start') && notReady ? (
        <p className="text-sm font-medium text-destructive">Complete your setup (documents approved) before starting work.</p>
      ) : null}
      {isAssignee && workOrder.status === 'work_completed' ? (
        <p className="text-sm text-muted-foreground">Work Completed — waiting for Tamay to review.</p>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Work Order details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Detail label="Agreed price" value={formatMoney(workOrder.agreed_price)} />
            <Detail label="Start date" value={formatDay(workOrder.start_date)} />
            <Detail label="Target completion" value={formatDay(workOrder.target_completion_date)} />
          </dl>
          <Block label="Scope of work" text={workOrder.scope_of_work} />
          <Block label="Measurements & specifications" text={workOrder.measurements_and_specs} />
          {workOrder.payment_notes ? <Block label="Payment notes" text={workOrder.payment_notes} /> : null}
          {workOrder.started_at || workOrder.completed_at ? (
            <p className="text-xs text-muted-foreground">
              {workOrder.started_at ? `Started ${formatDate(workOrder.started_at)}` : ''}
              {workOrder.completed_at ? ` · Completed ${formatDate(workOrder.completed_at)}` : ''}
              {workOrder.closed_at ? ` · Closed ${formatDate(workOrder.closed_at)}` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {workOrder.important_requirements ? (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
              Important Job Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm">{workOrder.important_requirements}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Warranty Responsibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Badge variant={workOrder.warranty_applies ? 'default' : 'secondary'}>
            {workOrder.warranty_applies ? 'Applies' : 'Does Not Apply'}
          </Badge>
          {workOrder.warranty_applies && workOrder.warranty_notes ? (
            <p className="whitespace-pre-line">{workOrder.warranty_notes}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Reference photos & files</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderReferenceFiles workOrder={workOrder} canManage={manage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Work Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderUpdates workOrder={workOrder} canAdd={isAssignee && actions.includes('add_update')} />
        </CardContent>
      </Card>

      {editing ? (
        <WorkOrderFormDialog open onOpenChange={setEditing} projectId={workOrder.project_id} workOrder={workOrder} />
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function Block({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line">{text || '—'}</p>
    </div>
  )
}
