import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, FolderOpen, MapPin, Navigation, Phone, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { googleDirectionsUrl, wazeUrl } from '@/lib/project-coords'
import { cn } from '@/lib/utils'
import {
  formatPhoneDisplay,
  formatScheduleTimeRange,
  phoneHref,
  scheduleNavigationTarget,
} from '@/features/schedule/schedule-links'
import type { MyWorkScheduleItem } from '@/types/database'

export function ScheduleEntryCard({
  item,
  isToday,
  highlight,
  className,
}: {
  item: MyWorkScheduleItem
  isToday: boolean
  highlight?: 'now' | 'next' | null
  className?: string
}) {
  const waze = wazeUrl(scheduleNavigationTarget(item))

  return (
    <article
      className={cn(
        'rounded-xl border border-border bg-card p-3 shadow-sm',
        highlight === 'now' && 'border-primary/40 ring-1 ring-primary/20',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-base font-semibold leading-tight">
          <Clock3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {formatScheduleTimeRange(item.start_time, item.end_time)}
        </p>
        {highlight === 'now' ? <Badge variant="success">Now</Badge> : null}
        {highlight === 'next' ? <Badge variant="accent">Next</Badge> : null}
      </div>

      <h3 className="mt-1 text-[15px] font-semibold leading-snug">{item.project_name}</h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-snug">{item.task}</p>
      {item.notes ? (
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{item.notes}</p>
      ) : null}

      <div className="mt-2 space-y-1 text-sm">
        <ScheduleClientContact item={item} />
        <p className="flex items-start gap-1.5 leading-snug text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="whitespace-pre-line">{item.project_address || 'No address on file'}</span>
        </p>
        {item.crew.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>With {item.crew.join(', ')}</span>
          </p>
        ) : null}
      </div>

      <ScheduleEntryActions
        item={item}
        attendanceSlot={isToday ? <ScheduleClockInButton projectId={item.project_id} /> : null}
        className="mt-3"
      />
      {waze ? (
        <a
          href={waze}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-8 items-center text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open in Waze
        </a>
      ) : null}
    </article>
  )
}

export function ScheduleClientContact({ item }: { item: MyWorkScheduleItem }) {
  const tel = phoneHref(item.client_phone)
  const phoneLabel = formatPhoneDisplay(item.client_phone)

  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 leading-snug">
      <dt className="text-xs text-muted-foreground">Client</dt>
      <dd className="font-medium">{item.client_name || 'No client on file'}</dd>
      <dt className="text-xs text-muted-foreground">Phone</dt>
      <dd>
        {phoneLabel && tel ? (
          <a
            href={tel}
            className="text-base font-semibold tracking-wide text-primary underline-offset-2 hover:underline"
          >
            {phoneLabel}
          </a>
        ) : phoneLabel ? (
          <span className="text-base font-semibold tracking-wide">{phoneLabel}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No phone number on file</span>
        )}
      </dd>
    </dl>
  )
}

export function ScheduleClockInButton({
  projectId,
  variant = 'accent',
}: {
  projectId: string
  variant?: 'accent' | 'default'
}) {
  return (
    <Button asChild variant={variant} className="h-11">
      <Link to={`/dashboard?clockProject=${projectId}`}>
        <Clock3 className="h-4 w-4" />
        Clock In
      </Link>
    </Button>
  )
}

/** Directions / Call / Open Project, plus an optional attendance button in the last slot. */
export function ScheduleEntryActions({
  item,
  attendanceSlot,
  openProjectVariant = 'outline',
  className,
}: {
  item: MyWorkScheduleItem
  attendanceSlot?: ReactNode
  openProjectVariant?: 'outline' | 'accent'
  className?: string
}) {
  const directions = googleDirectionsUrl(scheduleNavigationTarget(item))
  const tel = phoneHref(item.client_phone)

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
      {directions ? (
        <Button asChild className="h-11">
          <a href={directions} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-4 w-4" />
            Directions
          </a>
        </Button>
      ) : null}
      {tel ? (
        <Button asChild variant="outline" className="h-11">
          <a href={tel}>
            <Phone className="h-4 w-4" />
            Call
          </a>
        </Button>
      ) : null}
      <Button asChild variant={openProjectVariant} className="h-11">
        <Link to={`/projects/${item.project_id}`}>
          <FolderOpen className="h-4 w-4" />
          Open Project
        </Link>
      </Button>
      {attendanceSlot}
    </div>
  )
}
