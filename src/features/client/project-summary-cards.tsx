import { Link } from 'react-router-dom'
import { clientProjectProgress, paymentProgressPercent } from '@/lib/client-portal-progress'
import { formatCurrency } from '@/lib/project-finance'
import { cn, formatRelative } from '@/lib/utils'
import type { Project, ProjectNote } from '@/types/database'

type Props = {
  project: Project
  totalPaid: number
  remaining: number
  latestUpdate?: ProjectNote | null
  attentionLabel?: string
  payLink?: string | null
  /** Where “Ask a question” goes when no payment action (home vs project detail). */
  askHref?: string
}

function SummaryCard({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04),0_8px_24px_rgba(9,46,76,0.04)]',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

export function ClientProjectSummaryCards({
  project,
  totalPaid,
  remaining,
  latestUpdate,
  attentionLabel = 'No action needed',
  payLink,
  askHref = '#client-ask-question',
}: Props) {
  const payPct = paymentProgressPercent(project.current_project_total, totalPaid)
  const progress = clientProjectProgress(project.status, {
    paymentPercent: project.current_project_total != null ? payPct : null,
  })
  const excerpt = latestUpdate?.content?.trim()
    ? latestUpdate.content.trim().slice(0, 90) +
      (latestUpdate.content.trim().length > 90 ? '…' : '')
    : latestUpdate?.photo_path
      ? 'New project photo shared'
      : 'No updates yet'

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Project progress">
        <p className="font-display text-2xl font-semibold tracking-tight text-primary">
          {progress.percent}%
        </p>
        <p className="mt-1 text-sm text-foreground">{progress.phase}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Next: {project.status === 'completed' ? 'Enjoy your finished space' : progress.phase}
        </p>
      </SummaryCard>

      <SummaryCard label="Payments">
        <p className="text-sm text-muted-foreground">
          Paid{' '}
          <span className="font-semibold text-foreground">{formatCurrency(totalPaid)}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Remaining{' '}
          <span className="font-semibold text-primary">{formatCurrency(remaining)}</span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${payPct}%` }}
          />
        </div>
        {payLink ? (
          <a
            href={payLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Pay now →
          </a>
        ) : null}
      </SummaryCard>

      <SummaryCard label="Latest update">
        <p className="text-sm leading-snug text-foreground">{excerpt}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {latestUpdate ? formatRelative(latestUpdate.created_at) : '—'}
        </p>
      </SummaryCard>

      <SummaryCard label="Needs your attention">
        <p className="text-sm font-medium text-foreground">{attentionLabel}</p>
        {payLink ? (
          <a
            href={payLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:brightness-95"
          >
            Complete payment
          </a>
        ) : (
          <Link
            to={askHref}
            className="mt-2 inline-flex text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Ask a question
          </Link>
        )}
      </SummaryCard>
    </div>
  )
}
