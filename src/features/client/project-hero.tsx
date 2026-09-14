import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { clientProjectProgress } from '@/lib/client-portal-progress'
import { CLIENT_PORTAL_FALLBACK_IMAGE } from '@/lib/project-visuals'
import { cn, formatDate, projectStatusLabel } from '@/lib/utils'
import type { Project } from '@/types/database'

function toneBadgeClass(tone: ReturnType<typeof clientProjectProgress>['tone']) {
  switch (tone) {
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'attention':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    case 'on_track':
      return 'border-sky-200 bg-sky-50 text-sky-900'
    default:
      return 'border-white/30 bg-white/15 text-white'
  }
}

export function ClientProjectHero({
  project,
  paymentPercent,
}: {
  project: Project
  paymentPercent?: number | null
}) {
  const progress = clientProjectProgress(project.status, { paymentPercent })

  return (
    <section className="relative overflow-hidden rounded-2xl shadow-brand animate-rise">
      <div className="absolute inset-0">
        <img
          src={CLIENT_PORTAL_FALLBACK_IMAGE}
          alt=""
          className="h-full w-full object-cover object-[center_40%] sm:object-center"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#092e4c]/92 via-[#0b3c5d]/78 to-[#0b3c5d]/45" />
      </div>

      <div className="relative grid gap-4 p-4 sm:gap-6 sm:p-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-8 lg:p-8">
        <div className="max-w-xl text-white">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1.5 h-8 px-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Link to="/portal/projects">← My projects</Link>
          </Button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Your project
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:mt-2 sm:text-4xl">
            {project.name}
          </h1>
          <p className="mt-1.5 text-sm text-white/85 sm:mt-2 sm:text-base">
            A more beautiful home for what matters most.
          </p>
          {project.location ? (
            <p className="mt-1.5 hidden text-xs text-white/70 sm:block">{project.location}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/20 bg-white/10 p-3.5 text-white backdrop-blur-md sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className={cn('border', toneBadgeClass(progress.tone))}>
              {progress.statusLabel}
            </Badge>
            <span className="text-xs text-white/75">{projectStatusLabel(project.status)}</span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight">{progress.percent}%</p>
          <p className="text-xs text-white/75">Complete</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-white/70">Current phase</dt>
              <dd className="text-right font-medium">{progress.phase}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/70">Estimated completion</dt>
              <dd className="text-right font-medium">
                {project.deadline ? formatDate(project.deadline) : 'To be scheduled'}
              </dd>
            </div>
            {project.warranty_ends_on ? (
              <div className="flex justify-between gap-3">
                <dt className="text-white/70">Warranty through</dt>
                <dd className="text-right font-medium">{formatDate(project.warranty_ends_on)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  )
}
