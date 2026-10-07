import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  CalendarDays,
  Camera,
  ChevronDown,
  Folder,
  ImageIcon,
  List,
  MapPin,
  Navigation,
  Phone,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectCoverUrl, type ProjectNoteSnippet } from '@/features/projects/my-projects-hooks'
import {
  EMPLOYEE_STATUS_LABEL,
  employeeStatus,
  hasProjectDetails,
  projectInitials,
  visitDayLabel,
  type MyProjectView,
} from '@/features/projects/my-projects-model'
import { STATUS_DOT, STATUS_TINT } from '@/features/projects/my-projects-styles'
import {
  formatPhoneDisplay,
  formatScheduleTimeRange,
  parseDateKey,
  phoneHref,
} from '@/features/schedule/schedule-links'
import { googleDirectionsUrl } from '@/lib/project-coords'
import { cn, fullName } from '@/lib/utils'
import type { MyWorkScheduleItem, ProjectStatus } from '@/types/database'

function ProjectStatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  const group = employeeStatus(status)
  return (
    <span
      data-testid="status-pill"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        STATUS_TINT[group],
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[group])} aria-hidden />
      {EMPLOYEE_STATUS_LABEL[group]}
    </span>
  )
}

/** Date-only columns ("2026-10-06") read as local days, not UTC midnight. */
function formatDayKey(value: string) {
  return format(parseDateKey(value.slice(0, 10)), 'MMM d, yyyy')
}

function ProjectCover({ view }: { view: MyProjectView }) {
  const { project, photos } = view
  const cover = useProjectCoverUrl(photos.cover)
  const [broken, setBroken] = useState(false)
  const src = !broken ? cover.data : undefined

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-primary lg:aspect-[4/3]">
      {src ? (
        <img
          src={src}
          alt={`${project.name} — latest project photo`}
          loading="lazy"
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_30%_20%,#145079_0%,#0b3c5d_55%,#082c45_100%)]">
          <img src="/tamay-logo.png" alt="" className="h-10 w-10 rounded-full bg-white object-contain p-1 lg:h-12 lg:w-12" />
          <span className="font-display text-xs font-bold tracking-[0.2em] text-accent lg:text-sm">
            {projectInitials(project.name)}
          </span>
          {photos.count === 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-white/70 lg:text-xs">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              No photos yet
            </span>
          ) : null}
        </div>
      )}
      {photos.count > 0 ? (
        <span
          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-[#0b1f30]/70 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm"
          aria-label={`${photos.count} project photo${photos.count === 1 ? '' : 's'}`}
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
          {photos.count}
        </span>
      ) : null}
    </div>
  )
}

/** Icon + value; the small label only appears on desktop, as in the approved layout. */
function InfoGroup({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 first:pr-3 [&:not(:first-child)]:pl-3 lg:gap-3 lg:first:pr-5 lg:[&:not(:first-child)]:pl-5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary lg:mt-1 lg:h-5 lg:w-5" aria-hidden />
      <div className="min-w-0 text-[13px] leading-snug lg:text-sm">
        <p className="hidden text-xs text-muted-foreground lg:block">{label}</p>
        {children}
      </div>
    </div>
  )
}

function NextVisit({ visit }: { visit: MyWorkScheduleItem | undefined }) {
  if (!visit) return <p className="text-muted-foreground">Not scheduled</p>
  return (
    <>
      <p className="font-bold text-primary">{visitDayLabel(visit.work_date)}</p>
      <p className="text-xs text-foreground/80 lg:text-[13px]">{formatScheduleTimeRange(visit.start_time, visit.end_time)}</p>
    </>
  )
}

function PrimaryClient({ client }: { client: MyProjectView['client'] }) {
  const tel = phoneHref(client?.phone)
  const phone = formatPhoneDisplay(client?.phone)
  if (!client) return <p className="text-muted-foreground">No contact on file</p>
  return (
    <>
      <p className="truncate font-bold text-primary">{client.name || 'Client'}</p>
      {phone && tel ? (
        <a
          href={tel}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 lg:text-[13px] lg:no-underline lg:hover:underline"
        >
          <Phone className="hidden h-3.5 w-3.5 shrink-0 lg:block" aria-hidden />
          {phone}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground lg:text-[13px]">{phone || 'No phone on file'}</p>
      )}
    </>
  )
}

function DetailSection({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cn('space-y-1', wide && 'lg:col-span-2')}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Secondary information only. Flat sections (no nested expanders) in a compact grid. */
function ProjectDetails({ view, notes }: { view: MyProjectView; notes: ProjectNoteSnippet[] }) {
  const { project, visits } = view
  const next = visits[0]
  const later = visits.slice(1, 4)
  return (
    <div className="grid gap-x-6 gap-y-3 text-sm lg:grid-cols-2">
      {next?.task ? (
        <DetailSection title="Next task">
          <p className="whitespace-pre-line">{next.task}</p>
        </DetailSection>
      ) : null}
      {next?.notes ? (
        <DetailSection title="Visit notes">
          <p className="whitespace-pre-line text-muted-foreground">{next.notes}</p>
        </DetailSection>
      ) : null}
      {next && next.crew.length > 0 ? (
        <DetailSection title="Crew on next visit">
          <p>{next.crew.join(', ')}</p>
        </DetailSection>
      ) : null}
      {later.length > 0 ? (
        <DetailSection title="Future visits">
          <ul className="space-y-0.5">
            {later.map((visit) => (
              <li key={visit.entry_id} className="flex justify-between gap-3">
                <span className="font-medium text-primary">{visitDayLabel(visit.work_date)}</span>
                <span className="text-muted-foreground">{formatScheduleTimeRange(visit.start_time, visit.end_time)}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}
      {project.description?.trim() ? (
        <DetailSection title="About this project">
          <p className="whitespace-pre-line text-muted-foreground">{project.description.trim()}</p>
        </DetailSection>
      ) : null}
      {project.start_date || project.deadline ? (
        <DetailSection title="Project dates">
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {project.start_date ? (
              <div>
                <dt className="text-xs text-muted-foreground">Start</dt>
                <dd className="font-medium">{formatDayKey(project.start_date)}</dd>
              </div>
            ) : null}
            {project.deadline ? (
              <div>
                <dt className="text-xs text-muted-foreground">Target completion</dt>
                <dd className="font-medium">{formatDayKey(project.deadline)}</dd>
              </div>
            ) : null}
          </dl>
        </DetailSection>
      ) : null}
      {notes.length > 0 ? (
        <DetailSection title="Latest updates" wide>
          <ul className="grid gap-2 lg:grid-cols-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border bg-white px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">
                    {fullName(note.author?.first_name ?? '', note.author?.last_name ?? '') || 'Team member'}
                  </span>{' '}
                  · {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                </p>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-line">
                  {note.content?.trim() || (note.photo_path ? 'Shared a photo' : '')}
                </p>
              </li>
            ))}
          </ul>
          <Link
            to={`/projects/${project.id}`}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            See all updates
          </Link>
        </DetailSection>
      ) : null}
    </div>
  )
}

const ACTION =
  'h-16 min-w-0 flex-col gap-1 rounded-lg px-1 text-xs font-semibold lg:h-11 lg:flex-row lg:gap-2 lg:text-sm'
const SECONDARY_ACTION = cn(ACTION, 'bg-[#e8eff7] text-primary hover:bg-[#dbe6f2]')

/**
 * Employee project card (approved visual). Mobile: inset photo + status, then name, address,
 * Next Visit | Primary Client, three actions, Details. Desktop (lg+): photo left, information
 * and actions right, Details row under the information column. Closed = act-now fields only.
 */
export function MyProjectCard({
  view,
  notes = [],
  showClient,
}: {
  view: MyProjectView
  notes?: ProjectNoteSnippet[]
  /** Only employees can see the project contact (existing rule); subcontractors cannot. */
  showClient: boolean
}) {
  const { project, address, client, visits } = view
  const directions = googleDirectionsUrl({
    latitude: project.latitude,
    longitude: project.longitude,
    address,
  })
  const tel = showClient ? phoneHref(client?.phone) : null
  const panelId = `${useId()}-details`
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasDetails = hasProjectDetails(view, notes.length)

  return (
    <article
      data-testid="my-project-card"
      className="rounded-xl border border-[#e3e8ef] bg-card p-3 shadow-[0_1px_3px_rgba(11,60,93,0.06)] lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-x-5 lg:p-3.5"
    >
      {/* Fixed-aspect thumbnail in row 1; the details rows below never stretch it. */}
      <div
        data-testid="card-photo"
        className="flex items-start justify-between gap-3 lg:col-start-1 lg:row-start-1 lg:block lg:self-start"
      >
        <Link to={`/projects/${project.id}`} tabIndex={-1} className="block w-[62%] shrink-0 lg:w-full">
          <ProjectCover view={view} />
        </Link>
        <ProjectStatusPill status={project.status} className="lg:hidden" />
      </div>

      <div
        data-testid="card-info"
        className="mt-2.5 flex min-w-0 flex-col gap-2.5 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:justify-between lg:gap-3 lg:pt-1"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-[17px] font-bold leading-snug text-primary lg:text-xl">
              <Link to={`/projects/${project.id}`} className="hover:underline">
                {project.name}
              </Link>
            </h2>
            <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug text-foreground/75 lg:mt-1 lg:text-sm">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary lg:h-4 lg:w-4" aria-hidden />
              <span className="whitespace-pre-line">{address || 'No address on file'}</span>
            </p>
          </div>
          <ProjectStatusPill status={project.status} className="hidden lg:inline-flex" />
        </div>

        <div className={cn('grid py-0.5', showClient ? 'grid-cols-2 divide-x divide-border' : 'grid-cols-1')}>
          <InfoGroup icon={CalendarDays} label="Next Visit">
            <NextVisit visit={visits[0]} />
          </InfoGroup>
          {showClient ? (
            <InfoGroup icon={UserRound} label="Primary Client">
              <PrimaryClient client={client} />
            </InfoGroup>
          ) : null}
        </div>

        <div data-testid="card-actions" className={cn('grid gap-2', showClient ? 'grid-cols-3' : 'grid-cols-2')}>
          {directions ? (
            <Button asChild variant="secondary" className={SECONDARY_ACTION}>
              <a href={directions} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4 shrink-0 fill-current" />
                Directions
              </a>
            </Button>
          ) : (
            <Button variant="secondary" className={SECONDARY_ACTION} disabled title="No address on file">
              <Navigation className="h-4 w-4 shrink-0 fill-current" />
              Directions
            </Button>
          )}
          {showClient ? (
            tel ? (
              <Button asChild variant="secondary" className={SECONDARY_ACTION}>
                <a href={tel} aria-label={`Call ${client?.name || 'client'}`}>
                  <Phone className="h-4 w-4 shrink-0 fill-current" />
                  Call
                </a>
              </Button>
            ) : (
              <Button variant="secondary" className={SECONDARY_ACTION} disabled title="No phone on file">
                <Phone className="h-4 w-4 shrink-0 fill-current" />
                Call
              </Button>
            )
          ) : null}
          <Button asChild variant="accent" className={cn(ACTION, 'text-primary')}>
            <Link to={`/projects/${project.id}`}>
              <Folder className="h-4 w-4 shrink-0 fill-current" />
              Open Project
            </Link>
          </Button>
        </div>
      </div>

      {hasDetails ? (
        <div className="mt-2.5 lg:col-start-2 lg:row-start-2 lg:mt-3">
          <button
            type="button"
            aria-label="View details"
            aria-expanded={detailsOpen}
            aria-controls={panelId}
            onClick={() => setDetailsOpen((value) => !value)}
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-white px-3 text-left text-[13px] font-semibold text-primary transition-colors hover:bg-[#f3f7fb] aria-expanded:bg-[#f3f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:text-sm"
          >
            <List className="h-4 w-4 shrink-0" aria-hidden />
            <span className="lg:hidden">Details</span>
            <span className="hidden lg:inline">View details</span>
            <ChevronDown
              className={cn('ml-auto h-4 w-4 shrink-0 transition-transform duration-200', detailsOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>
      ) : null}

      {hasDetails ? (
        <div
          id={panelId}
          data-testid="card-details"
          className={cn(
            'px-1 pb-1 pt-3 lg:col-start-2 lg:row-start-3 lg:px-1',
            detailsOpen ? 'block animate-fade-in' : 'hidden',
          )}
        >
          <ProjectDetails view={view} notes={notes} />
        </div>
      ) : null}
    </article>
  )
}

