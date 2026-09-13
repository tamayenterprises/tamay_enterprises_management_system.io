import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import {
  useProjectFinancialAudit,
  useProjectPayments,
  useProjectReceipts,
  useUpdateProjectTotals,
  useUpsertProjectPayment,
  useUpsertProjectReceipt,
  useVoidProjectPayment,
  useVoidProjectReceipt,
} from '@/features/projects/finance-hooks'
import { useFinanceProofViewer } from '@/features/projects/finance-proof-viewer'
import { formatUnknownError } from '@/lib/auth-errors'
import {
  clientPayNowLabel,
  exceedsBalanceWarning,
  formatCurrency,
  isClientPayNowEligible,
  nextPaymentDue,
  overallPaymentStatus,
  overallPaymentStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  remainingBalance,
  requiresOriginalTotalConfirmation,
  sumActiveReceipts,
  sumValidPayments,
  toMoneyNumber,
} from '@/lib/project-finance'
import { UPLOAD_ACCEPT, confirmAction } from '@/lib/uploads'
import { formatDate, fullName } from '@/lib/utils'
import type {
  Project,
  ProjectPayment,
  ProjectPaymentMethod,
  ProjectPaymentStageKey,
  ProjectReceipt,
} from '@/types/database'

type PaymentFormState = {
  id?: string
  label: string
  stageKey: ProjectPaymentStageKey
  expectedPercent: string
  expectedAmount: string
  actualAmount: string
  method: ProjectPaymentMethod | ''
  receivedOn: string
  checkReference: string
  notes: string
  sortOrder: string
  stripePaymentLinkUrl: string
  stripePaymentLinkActive: boolean
  proofFiles: File[]
}

const emptyPaymentForm = (): PaymentFormState => ({
  label: 'Initial Payment',
  stageKey: 'initial',
  expectedPercent: '',
  expectedAmount: '',
  actualAmount: '0',
  method: 'check',
  receivedOn: '',
  checkReference: '',
  notes: '',
  sortOrder: '0',
  stripePaymentLinkUrl: '',
  stripePaymentLinkActive: false,
  proofFiles: [],
})

function paymentToForm(payment: ProjectPayment): PaymentFormState {
  return {
    id: payment.id,
    label: payment.label,
    stageKey: payment.stage_key,
    expectedPercent: payment.expected_percent != null ? String(payment.expected_percent) : '',
    expectedAmount: String(toMoneyNumber(payment.expected_amount)),
    actualAmount: String(toMoneyNumber(payment.actual_amount)),
    method: payment.method ?? '',
    receivedOn: payment.received_on ?? '',
    checkReference: payment.check_reference ?? '',
    notes: payment.notes ?? '',
    sortOrder: String(payment.sort_order ?? 0),
    stripePaymentLinkUrl: payment.stripe_payment_link_url ?? '',
    stripePaymentLinkActive: Boolean(payment.stripe_payment_link_active),
    proofFiles: [],
  }
}

export type ProjectFinancePanelProps = {
  project: Project
  /** Contract totals, payments, Stripe, financial snapshot */
  showContractFinance?: boolean
  /** Internal project receipts */
  showReceipts?: boolean
  canManageContract?: boolean
  canAddReceipt?: boolean
  /** Void + edit any receipt */
  canManageReceipts?: boolean
  currentUserId?: string | null
  /** Increment to open the Add Receipt dialog (unified Upload → Receipt). */
  receiptOpenSignal?: number
}

export function ProjectFinancePanel({
  project,
  showContractFinance = true,
  showReceipts = true,
  canManageContract = true,
  canAddReceipt = true,
  canManageReceipts = true,
  currentUserId = null,
  receiptOpenSignal = 0,
}: ProjectFinancePanelProps) {
  const { openPaymentProof, openReceiptProof, viewer: proofViewer } = useFinanceProofViewer()
  const projectId = project.id
  const employeeOwnReceiptsOnly = showReceipts && !canManageReceipts
  const { data: payments = [], isError: paymentsError, refetch: refetchPayments } = useProjectPayments(
    projectId,
    { enabled: showContractFinance },
  )
  const { data: receipts = [], isError: receiptsError, refetch: refetchReceipts } = useProjectReceipts(
    projectId,
    {
      enabled: showReceipts,
      mineOnly: employeeOwnReceiptsOnly,
      currentUserId,
    },
  )
  const { data: audit = [] } = useProjectFinancialAudit(projectId, {
    enabled: showContractFinance && canManageContract,
  })
  const updateTotals = useUpdateProjectTotals(projectId)
  const upsertPayment = useUpsertProjectPayment(projectId)
  const voidPayment = useVoidProjectPayment(projectId)
  const upsertReceipt = useUpsertProjectReceipt(projectId)
  const voidReceipt = useVoidProjectReceipt(projectId)

  const [totalsOpen, setTotalsOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [stripeOpen, setStripeOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm)
  const [receiptForm, setReceiptForm] = useState({
    id: undefined as string | undefined,
    receiptNumber: '',
    amount: '',
    receivedOn: new Date().toISOString().slice(0, 10),
    notes: '',
    proofFiles: [] as File[],
  })
  const [currentTotalInput, setCurrentTotalInput] = useState(
    project.current_project_total != null ? String(toMoneyNumber(project.current_project_total)) : '',
  )
  const [originalTotalInput, setOriginalTotalInput] = useState(
    project.original_project_total != null ? String(toMoneyNumber(project.original_project_total)) : '',
  )
  const [stripeForm, setStripeForm] = useState({
    paymentId: '',
    amount: '',
    url: '',
    description: '',
  })
  const [receiptsExpanded, setReceiptsExpanded] = useState(false)
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null)
  const [paymentsExpanded, setPaymentsExpanded] = useState(false)

  const totalPaid = useMemo(() => sumValidPayments(payments), [payments])
  const recordedReceipts = useMemo(() => sumActiveReceipts(receipts), [receipts])
  const balance = remainingBalance(project.current_project_total, totalPaid)
  const status = overallPaymentStatus(project.current_project_total, totalPaid)
  const nextDue = nextPaymentDue(payments)
  const activePayments = payments.filter((p) => p.status !== 'void')
  const activeReceipts = receipts.filter((r) => r.status !== 'void')
  const isEmployeeReceiptMode = employeeOwnReceiptsOnly
  function openNewReceiptForm() {
    setReceiptForm({
      id: undefined,
      receiptNumber: `Receipt #${receipts.length + 1}`,
      amount: '',
      receivedOn: new Date().toISOString().slice(0, 10),
      notes: '',
      proofFiles: [],
    })
    setReceiptOpen(true)
  }

  useEffect(() => {
    if (!receiptOpenSignal || !canAddReceipt || !showReceipts) return
    openNewReceiptForm()
    window.requestAnimationFrame(() => {
      document.getElementById('project-receipts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only on signal bumps
  }, [receiptOpenSignal])

  function canEditReceipt(receipt: ProjectReceipt) {
    if (canManageReceipts) return receipt.status !== 'void'
    return (
      receipt.status !== 'void' &&
      Boolean(currentUserId) &&
      receipt.created_by === currentUserId
    )
  }

  async function savePayment() {
    const expected = Number(paymentForm.expectedAmount)
    const actual = Number(paymentForm.actualAmount)
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
      toast.error('Enter valid payment amounts')
      return
    }
    if (actual > 0) {
      const otherPaid = payments
        .filter((p) => p.status !== 'void' && p.id !== paymentForm.id)
        .reduce((s, p) => s + toMoneyNumber(p.actual_amount), 0)
      const rem = remainingBalance(project.current_project_total, otherPaid)
      const over = exceedsBalanceWarning(actual, rem)
      if (over.exceeds) {
        if (
          !confirmAction(
            `This payment exceeds the current outstanding project balance by ${formatCurrency(over.overBy)}. Continue?`,
          )
        ) {
          return
        }
      }
    }

    try {
      await upsertPayment.mutateAsync({
        id: paymentForm.id,
        label: paymentForm.label,
        stageKey: paymentForm.stageKey,
        expectedPercent: paymentForm.expectedPercent ? Number(paymentForm.expectedPercent) : null,
        expectedAmount: expected,
        actualAmount: actual,
        method: paymentForm.method || null,
        receivedOn: paymentForm.receivedOn || null,
        checkReference: paymentForm.checkReference || null,
        notes: paymentForm.notes || null,
        sortOrder: Number(paymentForm.sortOrder) || 0,
        stripePaymentLinkUrl: paymentForm.stripePaymentLinkUrl || null,
        stripePaymentLinkActive: paymentForm.stripePaymentLinkActive,
        proofFile: paymentForm.proofFiles[0] ?? null,
      })
      toast.success(paymentForm.id ? 'Payment updated' : 'Payment added')
      setPaymentOpen(false)
      setPaymentForm(emptyPaymentForm())
    } catch (error) {
      toast.error(formatUnknownError(error, 'Could not save payment'))
    }
  }

  async function saveReceipt() {
    const amount = Number(receiptForm.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid receipt amount')
      return
    }
    try {
      await upsertReceipt.mutateAsync({
        id: receiptForm.id,
        receiptNumber: receiptForm.receiptNumber || null,
        amount,
        receivedOn: receiptForm.receivedOn,
        notes: receiptForm.notes || null,
        proofFile: receiptForm.proofFiles[0] ?? null,
      })
      toast.success(receiptForm.id ? 'Receipt updated' : 'Receipt submitted')
      setReceiptOpen(false)
      setReceiptForm({
        id: undefined,
        receiptNumber: '',
        amount: '',
        receivedOn: new Date().toISOString().slice(0, 10),
        notes: '',
        proofFiles: [],
      })
    } catch (error) {
      toast.error(formatUnknownError(error, 'Could not save receipt'))
    }
  }

  return (
    <div className="space-y-4" id="project-finance">
      {showContractFinance ? (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Financial snapshot</CardTitle>
                <CardDescription>
                  Contract totals and payments. Restricted to admin, management, and project managers.
                </CardDescription>
              </div>
              <Badge variant="secondary">{overallPaymentStatusLabel(status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SnapshotStat
                label="Original project total"
                value={
                  project.original_project_total != null
                    ? formatCurrency(project.original_project_total)
                    : '—'
                }
              />
              <SnapshotStat
                label="Current project total"
                value={
                  project.current_project_total != null
                    ? formatCurrency(project.current_project_total)
                    : '—'
                }
              />
              <SnapshotStat label="Total paid" value={formatCurrency(totalPaid)} />
              <SnapshotStat label="Remaining balance" value={formatCurrency(balance)} />
              <SnapshotStat
                label="Next payment"
                value={
                  nextDue ? `${formatCurrency(nextDue.amountDue)} · ${nextDue.label}` : 'None due'
                }
              />
              {showReceipts ? (
                <SnapshotStat
                  label="Total recorded receipts"
                  value={formatCurrency(recordedReceipts)}
                />
              ) : null}
            </div>
            {canManageContract ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCurrentTotalInput(
                      project.current_project_total != null
                        ? String(toMoneyNumber(project.current_project_total))
                        : '',
                    )
                    setOriginalTotalInput(
                      project.original_project_total != null
                        ? String(toMoneyNumber(project.original_project_total))
                        : '',
                    )
                    setTotalsOpen(true)
                  }}
                >
                  Set project total
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setPaymentForm(emptyPaymentForm())
                    setPaymentOpen(true)
                  }}
                >
                  Add payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = nextDue
                    const openPayment =
                      payments.find(
                        (p) => p.label === next?.label && (p.status === 'due' || p.status === 'partial'),
                      ) ?? payments.find((p) => p.status === 'due' || p.status === 'partial')
                    setStripeForm({
                      paymentId: openPayment?.id ?? '',
                      amount: next ? String(next.amountDue) : '',
                      url: openPayment?.stripe_payment_link_url ?? '',
                      description: openPayment?.label ?? 'Project payment',
                    })
                    setStripeOpen(true)
                  }}
                >
                  Create Stripe payment link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    document.getElementById('project-payments')?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  View payments
                </Button>
                {showReceipts ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      document.getElementById('project-receipts')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    View receipts
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showContractFinance ? (
        <Card id="project-payments">
          <CardHeader className="pb-3">
            <div>
              <CardTitle>Client payments</CardTitle>
              <CardDescription>
                Track expected vs actual amounts. Use Client Pay Now to show or hide the portal
                button without deleting the payment.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentsError ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                Payments could not load. Apply the financial tracking migration if this is a new
                environment.{' '}
                <button type="button" className="underline" onClick={() => void refetchPayments()}>
                  Retry
                </button>
              </div>
            ) : null}
            <CompactAccordion
              title="PAYMENT HISTORY"
              summary={
                activePayments.length === 0
                  ? 'No payments recorded yet'
                  : `${activePayments.length} payment${activePayments.length === 1 ? '' : 's'} · ${formatCurrency(totalPaid)} paid · ${formatCurrency(balance)} remaining`
              }
              empty={activePayments.length === 0 && !paymentsError}
              expandLabel="View Payments ▼"
              collapseLabel="Hide Payments ▲"
              open={paymentsExpanded}
              onOpenChange={setPaymentsExpanded}
            >
              {payments.map((payment) => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  canManage={canManageContract}
                  onEdit={() => {
                    setPaymentForm(paymentToForm(payment))
                    setPaymentOpen(true)
                  }}
                  onVoid={async () => {
                    if (
                      !confirmAction(
                        'Void this payment? It will no longer count toward Total Paid.',
                      )
                    ) {
                      return
                    }
                    try {
                      await voidPayment.mutateAsync(payment.id)
                      toast.success('Payment voided')
                    } catch (error) {
                      toast.error(formatUnknownError(error, 'Could not void payment'))
                    }
                  }}
                  onViewProof={async () => {
                    if (!payment.proof_storage_path) return
                    await openPaymentProof(payment.id, payment.label)
                  }}
                  onToggleClientPayNow={async (enabled) => {
                    try {
                      await upsertPayment.mutateAsync({
                        id: payment.id,
                        label: payment.label,
                        stageKey: payment.stage_key,
                        expectedPercent:
                          payment.expected_percent == null
                            ? null
                            : toMoneyNumber(payment.expected_percent),
                        expectedAmount: toMoneyNumber(payment.expected_amount),
                        actualAmount: toMoneyNumber(payment.actual_amount),
                        method: payment.method,
                        receivedOn: payment.received_on,
                        checkReference: payment.check_reference,
                        notes: payment.notes,
                        sortOrder: payment.sort_order ?? 0,
                        stripePaymentLinkUrl: payment.stripe_payment_link_url,
                        stripePaymentLinkActive: enabled,
                      })
                      toast.success(
                        enabled ? 'Client Pay Now enabled' : 'Client Pay Now disabled',
                      )
                    } catch (error) {
                      toast.error(formatUnknownError(error, 'Could not update Pay Now'))
                    }
                  }}
                />
              ))}
            </CompactAccordion>
          </CardContent>
        </Card>
      ) : null}

      {showReceipts ? (
        <Card id="project-receipts">
          <CardHeader className="pb-3">
            <div>
              <CardTitle>{isEmployeeReceiptMode ? 'Your receipts' : 'Project receipts'}</CardTitle>
              <CardDescription>
                {isEmployeeReceiptMode
                  ? 'Only receipts you submitted for this project. Tamay internal spending is not shown.'
                  : 'Internal only — clients never see these. Total recorded receipts is not project profit or full cost.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {receiptsError ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                Receipts could not load.{' '}
                <button type="button" className="underline" onClick={() => void refetchReceipts()}>
                  Retry
                </button>
              </div>
            ) : null}
            <CompactAccordion
              title={isEmployeeReceiptMode ? 'YOUR RECEIPTS' : 'PROJECT RECEIPTS'}
              summary={
                activeReceipts.length === 0
                  ? isEmployeeReceiptMode
                    ? 'No receipts submitted yet'
                    : 'No receipts recorded yet'
                  : isEmployeeReceiptMode
                    ? `${activeReceipts.length} receipt${activeReceipts.length === 1 ? '' : 's'} · ${formatCurrency(recordedReceipts)} submitted`
                    : `${activeReceipts.length} receipt${activeReceipts.length === 1 ? '' : 's'} · ${formatCurrency(recordedReceipts)} recorded`
              }
              empty={activeReceipts.length === 0 && !receiptsError}
              expandLabel="View Receipts ▼"
              collapseLabel="Hide Receipts ▲"
              open={receiptsExpanded}
              onOpenChange={setReceiptsExpanded}
              actions={
                canAddReceipt ? (
                  <Button size="sm" onClick={openNewReceiptForm}>
                    {isEmployeeReceiptMode ? 'Upload Receipt' : 'Add Receipt'}
                  </Button>
                ) : null
              }
            >
              {receipts.map((receipt) => {
                const isOpen = expandedReceiptId === receipt.id
                const uploaderName = receipt.uploader
                  ? fullName(receipt.uploader.first_name, receipt.uploader.last_name)
                  : null
                return (
                  <div key={receipt.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setExpandedReceiptId(isOpen ? null : receipt.id)}
                    >
                      <span>
                        <span className="font-medium">
                          {receipt.receipt_number || 'Receipt'} · {formatCurrency(receipt.amount)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatDate(receipt.received_on)}
                          {!isEmployeeReceiptMode && uploaderName ? ` · ${uploaderName}` : ''}
                          {receipt.status === 'void' ? ' · Void' : ''}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen ? (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        {receipt.notes ? (
                          <p className="text-xs text-muted-foreground">{receipt.notes}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No note</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {receipt.proof_storage_path ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void openReceiptProof(
                                  receipt.id,
                                  receipt.receipt_number || 'Receipt',
                                )
                              }
                            >
                              View proof
                            </Button>
                          ) : null}
                          {canEditReceipt(receipt) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReceiptForm({
                                  id: receipt.id,
                                  receiptNumber: receipt.receipt_number ?? '',
                                  amount: String(toMoneyNumber(receipt.amount)),
                                  receivedOn: receipt.received_on,
                                  notes: receipt.notes ?? '',
                                  proofFiles: [],
                                })
                                setReceiptOpen(true)
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {canManageReceipts && receipt.status !== 'void' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (
                                  !confirmAction(
                                    'Void this receipt? It will leave the recorded total.',
                                  )
                                ) {
                                  return
                                }
                                try {
                                  await voidReceipt.mutateAsync(receipt.id)
                                  toast.success('Receipt voided')
                                } catch (error) {
                                  toast.error(formatUnknownError(error, 'Could not void receipt'))
                                }
                              }}
                            >
                              Void
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </CompactAccordion>
            {canManageContract && audit.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent financial edits
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {audit.slice(0, 8).map((row) => (
                    <li key={row.id}>
                      {row.field_name}: {row.old_value ?? '—'} → {row.new_value ?? '—'} ·{' '}
                      {formatDate(row.changed_at)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showContractFinance && canManageContract ? (
        <>
          <Dialog open={totalsOpen} onOpenChange={setTotalsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Project totals</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Original project total</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={originalTotalInput}
                    onChange={(e) => setOriginalTotalInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    First save establishes the original. Later corrections require confirmation and are
                    written to the audit trail (not Change Orders).
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Current project total</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentTotalInput}
                    onChange={(e) => setCurrentTotalInput(e.target.value)}
                  />
                </div>
                <Button
                  disabled={updateTotals.isPending}
                  onClick={async () => {
                    const current = Number(currentTotalInput)
                    const original = originalTotalInput === '' ? null : Number(originalTotalInput)
                    if (!Number.isFinite(current) || current < 0) {
                      toast.error('Enter a valid current total')
                      return
                    }
                    if (original != null && (!Number.isFinite(original) || original < 0)) {
                      toast.error('Enter a valid original total')
                      return
                    }

                    const existingOriginal =
                      project.original_project_total != null
                        ? toMoneyNumber(project.original_project_total)
                        : null
                    const originalChanging = requiresOriginalTotalConfirmation(
                      existingOriginal,
                      original,
                    )

                    if (originalChanging) {
                      if (
                        !confirmAction(
                          `Correct Original Project Total from ${formatCurrency(existingOriginal)} to ${formatCurrency(original)}?\n\nThis will be recorded in the audit trail.`,
                        )
                      ) {
                        return
                      }
                    }

                    try {
                      await updateTotals.mutateAsync({
                        currentProjectTotal: current,
                        originalProjectTotal: original ?? current,
                        confirmOriginalChange: originalChanging,
                      })
                      toast.success(
                        originalChanging
                          ? 'Original and current totals updated (audit recorded)'
                          : 'Project totals saved',
                      )
                      setTotalsOpen(false)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not save totals')
                    }
                  }}
                >
                  Save totals
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{paymentForm.id ? 'Edit payment' : 'Add payment'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Label</Label>
                  <Input
                    value={paymentForm.label}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Stage</Label>
                    <Select
                      value={paymentForm.stageKey}
                      onValueChange={(value) =>
                        setPaymentForm((f) => ({ ...f, stageKey: value as ProjectPaymentStageKey }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="initial">Initial Payment</SelectItem>
                        <SelectItem value="progress">Progress Payment</SelectItem>
                        <SelectItem value="second_progress">Second Progress Payment</SelectItem>
                        <SelectItem value="final">Final Payment</SelectItem>
                        <SelectItem value="other">Other Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Expected % (optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.expectedPercent}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, expectedPercent: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Expected amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.expectedAmount}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, expectedAmount: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Actual amount paid</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.actualAmount}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, actualAmount: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Method</Label>
                    <Select
                      value={paymentForm.method || 'none'}
                      onValueChange={(value) =>
                        setPaymentForm((f) => ({
                          ...f,
                          method: value === 'none' ? '' : (value as ProjectPaymentMethod),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="stripe">Stripe</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Date received</Label>
                    <Input
                      type="date"
                      value={paymentForm.receivedOn}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, receivedOn: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Check / reference #</Label>
                  <Input
                    value={paymentForm.checkReference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, checkReference: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment proof (photo or PDF)</Label>
                  <FilePickerButton
                    accept={UPLOAD_ACCEPT}
                    label="Choose proof"
                    variant="outline"
                    multiple={false}
                    selectedFiles={paymentForm.proofFiles}
                    onFiles={(files) => setPaymentForm((f) => ({ ...f, proofFiles: files.slice(0, 1) }))}
                  />
                  <SelectedFilesList
                    files={paymentForm.proofFiles}
                    onChange={(files) => setPaymentForm((f) => ({ ...f, proofFiles: files }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stripe payment link URL (optional)</Label>
                  <Input
                    placeholder="https://buy.stripe.com/..."
                    value={paymentForm.stripePaymentLinkUrl}
                    onChange={(e) =>
                      setPaymentForm((f) => ({ ...f, stripePaymentLinkUrl: e.target.value }))
                    }
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={paymentForm.stripePaymentLinkActive}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, stripePaymentLinkActive: e.target.checked }))
                      }
                    />
                    Client Pay Now: Enabled (client sees Pay Now when unpaid and URL is set)
                  </label>
                </div>
                <Button disabled={upsertPayment.isPending} onClick={() => void savePayment()}>
                  {upsertPayment.isPending ? 'Saving…' : 'Save payment'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={stripeOpen} onOpenChange={setStripeOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Stripe payment link</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  No automated Stripe API is configured in this app yet. Create a Payment Link in the
                  Stripe Dashboard for the amount below, then paste the link here. Clients see{' '}
                  <strong>Pay Now</strong> only while the link is marked active.
                </p>
                <div className="space-y-1">
                  <Label>Payment stage</Label>
                  <Select
                    value={stripeForm.paymentId || 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        setStripeForm((f) => ({ ...f, paymentId: '' }))
                        return
                      }
                      const payment = payments.find((p) => p.id === value)
                      setStripeForm((f) => ({
                        ...f,
                        paymentId: value,
                        amount: payment
                          ? String(
                              Math.max(
                                0,
                                toMoneyNumber(payment.expected_amount) -
                                  toMoneyNumber(payment.actual_amount),
                              ),
                            )
                          : f.amount,
                        url: payment?.stripe_payment_link_url ?? f.url,
                        description: payment?.label ?? f.description,
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select payment</SelectItem>
                      {activePayments.map((payment) => (
                        <SelectItem key={payment.id} value={payment.id}>
                          {payment.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Amount to collect</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stripeForm.amount}
                    onChange={(e) => setStripeForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description / reason</Label>
                  <Input
                    value={stripeForm.description}
                    onChange={(e) => setStripeForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stripe Payment Link URL</Label>
                  <Input
                    placeholder="https://buy.stripe.com/..."
                    value={stripeForm.url}
                    onChange={(e) => setStripeForm((f) => ({ ...f, url: e.target.value }))}
                  />
                </div>
                <Button
                  disabled={!stripeForm.paymentId || upsertPayment.isPending}
                  onClick={async () => {
                    const payment = payments.find((p) => p.id === stripeForm.paymentId)
                    if (!payment) {
                      toast.error('Select a payment stage first')
                      return
                    }
                    if (!stripeForm.url.trim().startsWith('http')) {
                      toast.error('Paste a valid Stripe Payment Link URL')
                      return
                    }
                    try {
                      await upsertPayment.mutateAsync({
                        id: payment.id,
                        label: payment.label,
                        stageKey: payment.stage_key,
                        expectedPercent:
                          payment.expected_percent != null
                            ? toMoneyNumber(payment.expected_percent)
                            : null,
                        expectedAmount: toMoneyNumber(payment.expected_amount),
                        actualAmount: toMoneyNumber(payment.actual_amount),
                        method: 'stripe',
                        receivedOn: payment.received_on,
                        checkReference: payment.check_reference,
                        notes: stripeForm.description || payment.notes,
                        sortOrder: payment.sort_order,
                        stripePaymentLinkUrl: stripeForm.url.trim(),
                        stripePaymentLinkActive: true,
                      })
                      toast.success('Stripe link saved — Pay Now is available in the Client Portal')
                      setStripeOpen(false)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not save link')
                    }
                  }}
                >
                  Save active Pay Now link
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {showReceipts && canAddReceipt ? (
        <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {receiptForm.id
                  ? 'Edit receipt'
                  : isEmployeeReceiptMode
                    ? 'Upload Receipt'
                    : 'Add receipt'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!isEmployeeReceiptMode ? (
                <div className="space-y-1">
                  <Label>Receipt number / label</Label>
                  <Input
                    value={receiptForm.receiptNumber}
                    onChange={(e) => setReceiptForm((f) => ({ ...f, receiptNumber: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiptForm.amount}
                    onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={receiptForm.receivedOn}
                    onChange={(e) => setReceiptForm((f) => ({ ...f, receivedOn: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Textarea
                  value={receiptForm.notes}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Photo / File</Label>
                <FilePickerButton
                  accept={UPLOAD_ACCEPT}
                  label="Upload Picture"
                  variant="outline"
                  multiple={false}
                  selectedFiles={receiptForm.proofFiles}
                  onFiles={(files) => setReceiptForm((f) => ({ ...f, proofFiles: files.slice(0, 1) }))}
                />
                <SelectedFilesList
                  files={receiptForm.proofFiles}
                  onChange={(files) => setReceiptForm((f) => ({ ...f, proofFiles: files }))}
                />
              </div>
              <Button disabled={upsertReceipt.isPending} onClick={() => void saveReceipt()}>
                {upsertReceipt.isPending
                  ? 'Saving…'
                  : isEmployeeReceiptMode && !receiptForm.id
                    ? 'Submit Receipt'
                    : 'Save receipt'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {proofViewer}
    </div>
  )
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function PaymentCard({
  payment,
  canManage,
  onEdit,
  onVoid,
  onViewProof,
  onToggleClientPayNow,
}: {
  payment: ProjectPayment
  canManage: boolean
  onEdit: () => void
  onVoid: () => void
  onViewProof: () => void
  onToggleClientPayNow: (enabled: boolean) => void
}) {
  const payNowState = clientPayNowLabel(payment)
  const hasUrl =
    typeof payment.stripe_payment_link_url === 'string' &&
    payment.stripe_payment_link_url.startsWith('http')
  const canTogglePayNow =
    canManage &&
    payment.status !== 'void' &&
    payment.status !== 'paid' &&
    hasUrl

  return (
    <div className="rounded-md border border-border px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{payment.label}</p>
          <p className="text-xs text-muted-foreground">
            Expected {formatCurrency(payment.expected_amount)} · Paid{' '}
            {formatCurrency(payment.actual_amount)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant={payment.status === 'void' ? 'outline' : 'secondary'}>
            {paymentStatusLabel(payment.status)}
          </Badge>
          {payment.method ? <Badge variant="outline">{paymentMethodLabel(payment.method)}</Badge> : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {payment.received_on ? `Received ${formatDate(payment.received_on)}` : 'No date yet'}
        {payment.check_reference ? ` · Ref ${payment.check_reference}` : ''}
      </p>
      {payment.notes ? <p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">Client Pay Now: {payNowState}</Badge>
        {isClientPayNowEligible(payment) ? (
          <span className="text-xs text-muted-foreground">Visible to client</span>
        ) : null}
        {payment.proof_storage_path ? (
          <Button size="sm" variant="outline" onClick={onViewProof}>
            View payment proof
          </Button>
        ) : null}
        {canTogglePayNow ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleClientPayNow(!payment.stripe_payment_link_active)}
          >
            {payment.stripe_payment_link_active ? 'Disable Pay Now' : 'Enable Pay Now'}
          </Button>
        ) : null}
        {canManage && payment.status !== 'void' ? (
          <>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onVoid}>
              Void
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
