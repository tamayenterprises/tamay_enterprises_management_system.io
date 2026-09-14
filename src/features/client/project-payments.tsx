import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import { useProjectPayments } from '@/features/projects/finance-hooks'
import { useFinanceProofViewer } from '@/features/projects/finance-proof-viewer'
import { paymentProgressPercent } from '@/lib/client-portal-progress'
import {
  activeStripePayLink,
  formatCurrency,
  isClientPayNowEligible,
  nextPaymentDue,
  overallPaymentStatus,
  overallPaymentStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  remainingBalance,
  sumValidPayments,
} from '@/lib/project-finance'
import { cn, formatDate } from '@/lib/utils'
import type { Project, ProjectPayment } from '@/types/database'

function statusBadgeClass(status: ProjectPayment['status']) {
  switch (status) {
    case 'paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'due':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    case 'partial':
      return 'border-sky-200 bg-sky-50 text-sky-900'
    case 'void':
      return 'border-border bg-muted text-muted-foreground'
    default:
      return ''
  }
}

export function ClientProjectPayments({ project }: { project: Project }) {
  const { data: payments = [], isLoading, isError, refetch } = useProjectPayments(project.id, {
    clientSafe: true,
  })
  const { openPaymentProof, viewer } = useFinanceProofViewer()
  const [historyOpen, setHistoryOpen] = useState(false)

  const totalPaid = useMemo(() => sumValidPayments(payments), [payments])
  const balance = remainingBalance(project.current_project_total, totalPaid)
  const status = overallPaymentStatus(project.current_project_total, totalPaid)
  const nextDue = nextPaymentDue(payments)
  const payLink = activeStripePayLink(payments)
  const visiblePayments = payments.filter((p) => p.status !== 'void')
  const payPct = paymentProgressPercent(project.current_project_total, totalPaid)

  return (
    <div id="client-payments" className="space-y-3">
      <section className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04),0_8px_24px_rgba(9,46,76,0.04)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Payment summary
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-primary">
              Your balance
            </h2>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {overallPaymentStatusLabel(status)}
          </Badge>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Remaining balance</p>
              <p className="font-display text-3xl font-semibold tracking-tight text-primary">
                {formatCurrency(balance)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Project total</p>
              <p className="text-sm font-semibold">
                {project.current_project_total != null
                  ? formatCurrency(project.current_project_total)
                  : '—'}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Paid {formatCurrency(totalPaid)}</span>
              <span>{payPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${payPct}%` }}
              />
            </div>
          </div>

          {nextDue ? (
            <p className="text-sm text-muted-foreground">
              Next due:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(nextDue.amountDue)}
              </span>
              {' · '}
              {nextDue.label}
            </p>
          ) : null}

          {payLink ? (
            <Button
              asChild
              className="h-11 w-full rounded-xl bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 hover:brightness-[0.98]"
            >
              <a href={payLink} target="_blank" rel="noopener noreferrer">
                Pay now
              </a>
            </Button>
          ) : null}
        </div>

        {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading payments…</p> : null}
        {isError ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Unable to load payments.{' '}
            <button type="button" className="underline" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        ) : null}
      </section>

      <CompactAccordion
        title="PAYMENT HISTORY"
        summary={
          visiblePayments.length === 0
            ? 'No payments recorded yet'
            : `${visiblePayments.length} payment${visiblePayments.length === 1 ? '' : 's'} · ${formatCurrency(totalPaid)} paid · ${formatCurrency(balance)} remaining`
        }
        empty={visiblePayments.length === 0 && !isLoading}
        expandLabel="View Payments ▼"
        collapseLabel="Hide Payments ▲"
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        className="rounded-2xl border-border/80 bg-white shadow-[0_1px_2px_rgba(9,46,76,0.04)]"
      >
        {visiblePayments.map((payment) => (
          <div
            key={payment.id}
            className="rounded-xl border border-border/80 bg-[#fbfcff] px-3 py-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{payment.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatCurrency(payment.actual_amount || payment.expected_amount)}
                  {payment.received_on ? ` · ${formatDate(payment.received_on)}` : null}
                  {payment.method ? ` · ${paymentMethodLabel(payment.method)}` : null}
                </p>
              </div>
              <Badge className={cn('border', statusBadgeClass(payment.status))}>
                {paymentStatusLabel(payment.status)}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {payment.proof_storage_path ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => void openPaymentProof(payment.id, payment.label)}
                >
                  View proof
                </Button>
              ) : null}
              {isClientPayNowEligible(payment) && payment.stripe_payment_link_url ? (
                <Button
                  asChild
                  size="sm"
                  className="rounded-lg bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <a
                    href={payment.stripe_payment_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pay now
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CompactAccordion>
      {viewer}
    </div>
  )
}
