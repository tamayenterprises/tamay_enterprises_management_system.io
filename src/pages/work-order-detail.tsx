import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, MapPin, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-hooks'
import { useMyReadiness } from '@/features/subcontractors/hooks'
import {
  useRespondToWorkOrder,
  useSendWorkOrderOffers,
  useUpdateWorkOrderStatus,
  useWorkOrder,
  useWorkOrderFiles,
  useWorkOrderOffers,
  useWorkOrderProjectSummaries,
} from '@/features/work-orders/hooks'
import { SubcontractorPicker } from '@/features/work-orders/subcontractor-picker'
import { SubcontractorDocuments, TamayDocuments } from '@/features/work-orders/work-order-files'
import { WorkOrderFormDialog } from '@/features/work-orders/work-order-form-dialog'
import { WorkOrderUpdates } from '@/features/work-orders/work-order-updates'
import { formatDay } from '@/lib/subcontractor-requirements'
import { confirmAction } from '@/lib/uploads'
import { formatDate, fullName, isManagementRole } from '@/lib/utils'
import {
  ACCEPTANCE_STATEMENT,
  WORK_ORDER_STATUS_LABEL,
  canCloseWorkOrder,
  formatMoney,
  formatWorkOrderNumber,
  insuranceStatus,
  subcontractorActions,
  workOrderStatusVariant,
} from '@/lib/work-orders'
import type { DirectoryProfile, WorkOrderOfferRecord, WorkOrderRecord } from '@/types/database'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
const displayName = (p?: Pick<DirectoryProfile, 'company_name' | 'first_name' | 'last_name'> | null) =>
  p ? p.company_name || fullName(p.first_name, p.last_name) : 'Subcontractor'

export function WorkOrderDetailPage() {
  const { workOrderId = '' } = useParams()
  const { profile } = useAuth()
  const { data: workOrder, isLoading } = useWorkOrder(workOrderId)
  const { data: summaries } = useWorkOrderProjectSummaries(workOrderId ? [workOrderId] : [])
  const { data: files = [] } = useWorkOrderFiles(workOrder?.id)
  const manage = isManagementRole(profile?.role)
  const { data: offers = [] } = useWorkOrderOffers(manage && workOrder ? [workOrder.id] : [])
  const { readiness, installed: readinessInstalled } = useMyReadiness()
  const update = useUpdateWorkOrderStatus()
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<'accept' | 'decline' | 'send' | null>(null)

  if (isLoading) return <LoadingState label="Loading work order..." />
  if (!workOrder) return <EmptyState title="Work order not found" description="It may have been closed, taken by another subcontractor or removed." />

  const isAssignee = workOrder.subcontractor_id != null && workOrder.subcontractor_id === profile?.id
  const isOfferee = !manage && profile?.role === 'subcontractor' && workOrder.status === 'offered'
  const project = summaries?.get(workOrder.id)
  const actions = isAssignee || isOfferee ? subcontractorActions(workOrder.status) : []
  const notReady = readinessInstalled && readiness != null && readiness.status !== 'ready'
  const insurance = insuranceStatus(workOrder, files)
  const insuranceBlocks = workOrder.insurance_required && insurance !== 'approved'

  async function run(action: 'start' | 'complete' | 'close', message: string) {
    try {
      await update.mutateAsync({ workOrderId: workOrder!.id, action })
      toast.success(message)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update the work order'))
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
          <Badge variant={workOrderStatusVariant(workOrder.status)}>
            {isOfferee ? 'New Offer' : WORK_ORDER_STATUS_LABEL[workOrder.status]}
          </Badge>
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
        {manage && workOrder.subcontractor_id ? <p className="text-sm">Subcontractor: {displayName(workOrder.subcontractor)}</p> : null}
      </div>

      {isOfferee ? (
        <p className="rounded-md border border-warning/50 bg-warning/5 px-3 py-2 text-sm">
          Tamay is offering you this work order. Review the details and documents below, then accept or decline.
          {workOrder.status === 'offered' ? ' It may be offered to other subcontractors too — the first to accept gets it.' : ''}
        </p>
      ) : null}

      {actions.length > 0 || manage ? (
        <div className="flex flex-wrap gap-2">
          {actions.includes('accept') ? <Button onClick={() => setDialog('accept')}>Accept Work Order</Button> : null}
          {actions.includes('decline') ? (
            <Button variant="outline" onClick={() => setDialog('decline')}>
              Decline
            </Button>
          ) : null}
          {actions.includes('start') ? (
            <Button disabled={update.isPending || notReady || insuranceBlocks} onClick={() => void run('start', 'Work started')}>
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
          {manage && workOrder.status === 'offered' ? (
            <Button onClick={() => setDialog('send')}>Send to subcontractors</Button>
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
      {actions.includes('start') && !notReady && insuranceBlocks ? (
        <p className="text-sm font-medium text-destructive">
          Upload the insurance certificate for this job below. Work can start once Tamay approves it.
        </p>
      ) : null}
      {isAssignee && workOrder.status === 'work_completed' ? (
        <p className="text-sm text-muted-foreground">Work Completed — waiting for Tamay to review.</p>
      ) : null}

      {manage && (workOrder.status === 'offered' || offers.length > 0) ? <OffersCard offers={offers} /> : null}

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Contract & Documents</CardTitle>
          <p className="text-sm text-muted-foreground">Job site photos, contract, proposal and plans from Tamay.</p>
        </CardHeader>
        <CardContent>
          <TamayDocuments workOrder={workOrder} canManage={manage} />
        </CardContent>
      </Card>

      {workOrder.accepted_at && workOrder.acceptance_statement ? <AcceptanceRecord workOrder={workOrder} /> : null}

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

      {manage || isAssignee ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Subcontractor Documents</CardTitle>
            <p className="text-sm text-muted-foreground">Insurance certificate, permits, receipts / invoices and other documents for this job.</p>
          </CardHeader>
          <CardContent>
            <SubcontractorDocuments workOrder={workOrder} canManage={manage} canUpload={isAssignee} />
          </CardContent>
        </Card>
      ) : workOrder.insurance_required ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              Insurance certificate required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>If you accept, upload a General Liability certificate for this job listing as Certificate Holder:</p>
            <p className="whitespace-pre-line rounded bg-muted px-2 py-1 font-medium">{workOrder.certificate_holder}</p>
            <p className="text-xs text-muted-foreground">Work cannot start until Tamay approves it.</p>
          </CardContent>
        </Card>
      ) : null}

      {manage || isAssignee ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Work Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkOrderUpdates workOrder={workOrder} canAdd={isAssignee && actions.includes('add_update')} />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <WorkOrderFormDialog open onOpenChange={setEditing} projectId={workOrder.project_id} workOrder={workOrder} />
      ) : null}
      {dialog === 'accept' ? <AcceptDialog workOrder={workOrder} onClose={() => setDialog(null)} /> : null}
      {dialog === 'decline' ? <DeclineDialog workOrder={workOrder} onClose={() => setDialog(null)} /> : null}
      {dialog === 'send' ? <SendOffersDialog workOrder={workOrder} offers={offers} onClose={() => setDialog(null)} /> : null}
    </div>
  )
}

function AcceptDialog({ workOrder, onClose }: { workOrder: WorkOrderRecord; onClose: () => void }) {
  const respond = useRespondToWorkOrder()
  const [agree, setAgree] = useState(false)

  async function accept() {
    try {
      await respond.mutateAsync({ workOrderId: workOrder.id, accept: true, agree })
      toast.success('Work order accepted — Tamay has been notified')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not accept the work order'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !respond.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept {formatWorkOrderNumber(workOrder.work_order_number)}</DialogTitle>
          <DialogDescription>
            {workOrder.title} · {formatMoney(workOrder.agreed_price)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Review the scope, price, dates, requirements, warranty and the contract documents before accepting.</p>
          {workOrder.insurance_required ? (
            <p className="font-medium">
              You will need to upload an insurance certificate listing {workOrder.certificate_holder?.split('\n')[0]} as Certificate Holder before
              starting.
            </p>
          ) : null}
          <label className="flex items-start gap-2 rounded-md border border-border p-3">
            <input type="checkbox" className="mt-0.5 accent-primary" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            <span>{ACCEPTANCE_STATEMENT}</span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={respond.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!agree || respond.isPending} onClick={() => void accept()}>
              Accept Work Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeclineDialog({ workOrder, onClose }: { workOrder: WorkOrderRecord; onClose: () => void }) {
  const respond = useRespondToWorkOrder()
  const [reason, setReason] = useState('')

  async function decline() {
    try {
      await respond.mutateAsync({ workOrderId: workOrder.id, accept: false, reason })
      toast.success('Work order declined')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not decline the work order'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !respond.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {formatWorkOrderNumber(workOrder.work_order_number)}</DialogTitle>
          <DialogDescription>{workOrder.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wo-decline-reason">Reason (optional)</Label>
            <Textarea
              id="wo-decline-reason"
              rows={2}
              maxLength={500}
              placeholder="Busy those dates · price too low · not my trade"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={respond.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={respond.isPending} onClick={() => void decline()}>
              Decline Work Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SendOffersDialog({ workOrder, offers, onClose }: { workOrder: WorkOrderRecord; offers: WorkOrderOfferRecord[]; onClose: () => void }) {
  const send = useSendWorkOrderOffers()
  const [selected, setSelected] = useState<string[]>([])
  const pending = offers.filter((offer) => offer.status === 'pending').map((offer) => offer.subcontractor_id)

  async function submit() {
    try {
      const sent = await send.mutateAsync({ workOrderId: workOrder.id, subcontractorIds: selected })
      toast.success(`Sent to ${sent} subcontractor${sent === 1 ? '' : 's'}`)
      onClose()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not send the work order'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !send.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {formatWorkOrderNumber(workOrder.work_order_number)}</DialogTitle>
          <DialogDescription>Subcontractors who already have it waiting are not listed. Someone who declined can be asked again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SubcontractorPicker selected={selected} onChange={(ids) => setSelected(ids)} exclude={pending} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={send.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={selected.length === 0 || send.isPending} onClick={() => void submit()}>
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const OFFER_BADGE: Record<WorkOrderOfferRecord['status'], { label: string; variant: 'warning' | 'success' | 'destructive' | 'secondary' }> = {
  pending: { label: 'Waiting for answer', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'destructive' },
  closed: { label: 'Offer closed', variant: 'secondary' },
}

function OffersCard({ offers }: { offers: WorkOrderOfferRecord[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Offers</CardTitle>
      </CardHeader>
      <CardContent>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not sent to anyone yet. Use "Send to subcontractors".</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="work-order-offers">
            {offers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{displayName(offer.subcontractor)}</span>
                  {offer.decline_reason ? <span className="block text-xs text-muted-foreground">"{offer.decline_reason}"</span> : null}
                </span>
                <Badge variant={OFFER_BADGE[offer.status].variant}>{OFFER_BADGE[offer.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AcceptanceRecord({ workOrder }: { workOrder: WorkOrderRecord }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-success" aria-hidden />
          Acceptance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          Accepted by <strong>{displayName(workOrder.subcontractor)}</strong> on {formatDate(workOrder.accepted_at!, 'MMM d, yyyy h:mm a')}.
        </p>
        <p className="text-muted-foreground">"{workOrder.acceptance_statement}"</p>
      </CardContent>
    </Card>
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
