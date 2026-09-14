import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { clientProjectProgress } from '@/lib/client-portal-progress'
import { CLIENT_PORTAL_FALLBACK_IMAGE } from '@/lib/project-visuals'
import { cn, formatDate, projectStatusLabel } from '@/lib/utils'
import type { Project } from '@/types/database'

export { CLIENT_PORTAL_FALLBACK_IMAGE }

function toneBadgeClass(tone: ReturnType<typeof clientProjectProgress>['tone']) {
  switch (tone) {
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'attention':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    case 'on_track':
      return 'border-sky-200 bg-sky-50 text-sky-900'
    default:
      return 'border-primary/20 bg-primary/5 text-primary'
  }
}

export function ClientHomeActiveProjectCard({
  project,
  paymentPercent,
}: {
  project: Project
  paymentPercent?: number | null
}) {
  const progress = clientProjectProgress(project.status, { paymentPercent })
  const nextStep =
    project.status === 'completed'
      ? 'Enjoy your finished space'
      : project.status === 'waiting'
        ? 'Tamay may need a decision or material from you'
        : progress.phase

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-white shadow-brand animate-rise">
      <div className="grid lg:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-[180px] sm:min-h-[220px]">
          <img
            src={CLIENT_PORTAL_FALLBACK_IMAGE}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] sm:object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#092e4c]/75 via-[#0b3c5d]/25 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-white/10" />
          <div className="absolute bottom-3 left-3 right-3 lg:hidden">
            <Badge className={cn('border', toneBadgeClass(progress.tone))}>
              {progress.statusLabel}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 p-4 sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your active project
            </p>
            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight text-primary sm:text-2xl">
                {project.name}
              </h2>
              <Badge className={cn('hidden border lg:inline-flex', toneBadgeClass(progress.tone))}>
                {progress.statusLabel}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {projectStatusLabel(project.status)}
              {project.location ? ` · ${project.location}` : ''}
            </p>

            <div className="mt-4">
              <div className="flex items-end justify-between gap-3">
                <p className="font-display text-3xl font-semibold tracking-tight text-primary">
                  {progress.percent}%
                </p>
                <p className="pb-1 text-xs text-muted-foreground">Complete</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Current phase</dt>
                <dd className="text-right font-medium text-foreground">{progress.phase}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Next step</dt>
                <dd className="text-right font-medium text-foreground">{nextStep}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Estimated completion</dt>
                <dd className="text-right font-medium text-foreground">
                  {project.deadline ? formatDate(project.deadline) : 'To be scheduled'}
                </dd>
              </div>
            </dl>
          </div>

          <Button asChild className="h-11 w-full rounded-xl sm:w-auto">
            <Link to={`/portal/projects/${project.id}`}>View project</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

export function ClientHomeOtherProjectCard({
  project,
  paymentPercent,
}: {
  project: Project
  paymentPercent?: number | null
}) {
  const progress = clientProjectProgress(project.status, { paymentPercent })

  return (
    <Link
      to={`/portal/projects/${project.id}`}
      className="block rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight text-primary">
          {project.name}
        </h3>
        <Badge className={cn('shrink-0 border', toneBadgeClass(progress.tone))}>
          {progress.statusLabel}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-foreground">
        {progress.percent}% · {progress.phase}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{projectStatusLabel(project.status)}</p>
      <p className="mt-3 text-xs font-semibold text-primary">View project →</p>
    </Link>
  )
}
