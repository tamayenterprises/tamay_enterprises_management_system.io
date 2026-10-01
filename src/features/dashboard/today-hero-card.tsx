import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { ChevronRight, Clock3, MapPin, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Disclosure, ExpandableText } from '@/components/ui/disclosure'
import { useMyAttendanceHistory, useMyOpenAttendance } from '@/features/attendance/hooks'
import { useMyWorkSchedule } from '@/features/schedule/hooks'
import {
  ScheduleClientContact,
  ScheduleClockInButton,
  ScheduleEntryActions,
} from '@/features/schedule/schedule-entry-card'
import {
  formatScheduleTime,
  formatScheduleTimeRange,
  parseDateKey,
  scheduleNavigationTarget,
  toDateKey,
} from '@/features/schedule/schedule-links'
import { wazeUrl } from '@/lib/project-coords'
import { cn } from '@/lib/utils'
import {
  splitTodayJobs,
  summarizeAttendance,
  type AttendanceSummary,
} from '@/features/dashboard/employee-dashboard-model'
import type { MyWorkScheduleItem } from '@/types/database'

function scrollToTimeClock() {
  document.getElementById('time-clock')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function AttendancePill({ summary }: { summary: AttendanceSummary }) {
  const pill =
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white'
  const dot = 'h-2 w-2 rounded-full'
  switch (summary.kind) {
    case 'working':
      return (
        <span className={pill}>
          <span className={cn(dot, 'bg-emerald-400')} aria-hidden />
          Working · {format(new Date(summary.since), 'h:mm a')}
        </span>
      )
    case 'on_break':
      return (
        <span className={pill}>
          <span className={cn(dot, 'bg-amber-400')} aria-hidden />
          On break
        </span>
      )
    case 'done_today':
      return (
        <span className={pill}>
          <span className={cn(dot, 'bg-white/70')} aria-hidden />
          Done for today
        </span>
      )
    default:
      return (
        <span className={cn(pill, 'text-white/85')}>
          <span className={cn(dot, 'bg-white/40')} aria-hidden />
          Not clocked in
        </span>
      )
  }
}

/** Last action slot: Clock In when off the clock, otherwise a jump to the live time clock. */
function AttendanceSlot({ summary, projectId }: { summary: AttendanceSummary; projectId: string }) {
  if (summary.kind === 'working' || summary.kind === 'on_break') {
    return (
      <Button type="button" className="h-11" onClick={scrollToTimeClock}>
        <Clock3 className="h-4 w-4 text-accent" />
        Time Clock
      </Button>
    )
  }
  if (summary.kind === 'done_today') return null
  return <ScheduleClockInButton projectId={projectId} variant="default" />
}

function OtherJobRow({ item }: { item: MyWorkScheduleItem }) {
  return (
    <Link
      to="/schedule"
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-[#fbfcff] px-3 py-2 text-sm transition hover:border-accent/60 hover:bg-accent/10"
    >
      <span className="min-w-0">
        <span className="font-semibold text-primary">
          {formatScheduleTimeRange(item.start_time, item.end_time)}
        </span>
        <span className="block truncate text-muted-foreground">{item.project_name}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
    </Link>
  )
}

function PrimaryJob({
  item,
  highlight,
  summary,
}: {
  item: MyWorkScheduleItem
  highlight: 'now' | 'next' | null
  summary: AttendanceSummary
}) {
  const waze = wazeUrl(scheduleNavigationTarget(item))
  const hasDetails = Boolean(item.notes) || item.crew.length > 0 || Boolean(waze)

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-2xl font-semibold leading-tight text-primary">
            {formatScheduleTimeRange(item.start_time, item.end_time)}
          </p>
          {highlight === 'now' ? (
            <Badge className="border-transparent bg-accent text-accent-foreground">Now</Badge>
          ) : null}
          {highlight === 'next' ? (
            <Badge variant="outline" className="border-primary/30 text-primary">
              Next
            </Badge>
          ) : null}
        </div>
        <h2 className="mt-1 text-lg font-bold leading-snug text-primary">{item.project_name}</h2>
        <ExpandableText text={item.task} lines={2} className="mt-1 text-sm leading-snug" />
      </div>

      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-1.5 leading-snug">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className={cn('whitespace-pre-line', !item.project_address && 'text-muted-foreground')}>
            {item.project_address || 'No address on file'}
          </span>
        </p>
        <ScheduleClientContact item={item} />
      </div>

      <ScheduleEntryActions
        item={item}
        attendanceSlot={<AttendanceSlot summary={summary} projectId={item.project_id} />}
        openProjectVariant="accent"
        className="sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4"
      />

      {hasDetails ? (
        <Disclosure label="Show details" desktopOpen panelClassName="space-y-2 pt-1 text-sm">
          {item.notes ? <ExpandableText text={item.notes} lines={3} className="text-muted-foreground" /> : null}
          {item.crew.length > 0 ? (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>With {item.crew.join(', ')}</span>
            </p>
          ) : null}
          {waze ? (
            <a
              href={waze}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Open in Waze
            </a>
          ) : null}
        </Disclosure>
      ) : null}
    </div>
  )
}

function NoJobToday({ nextJob, todayKey }: { nextJob: MyWorkScheduleItem | null; todayKey: string }) {
  const tomorrowKey = toDateKey(addDays(parseDateKey(todayKey), 1))
  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-xl font-semibold text-primary">No work scheduled today</p>
        {nextJob ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Next:{' '}
            <span className="font-medium text-primary">
              {nextJob.work_date === tomorrowKey ? 'Tomorrow' : format(parseDateKey(nextJob.work_date), 'EEE, MMM d')}{' '}
              · {formatScheduleTime(nextJob.start_time)} · {nextJob.project_name}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No upcoming work scheduled. Your manager will add jobs here.
          </p>
        )}
      </div>
      <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
        <Link to="/schedule">View my schedule</Link>
      </Button>
    </div>
  )
}

export function TodayHeroCard() {
  const now = new Date()
  const todayKey = toDateKey(now)
  const tomorrowKey = toDateKey(addDays(now, 1))
  const weekAheadKey = toDateKey(addDays(now, 7))
  const today = useMyWorkSchedule(todayKey, todayKey)
  const upcoming = useMyWorkSchedule(tomorrowKey, weekAheadKey)
  const { data: openRecord } = useMyOpenAttendance()
  const { data: history = [] } = useMyAttendanceHistory(5)

  const items = useMemo(() => today.data ?? [], [today.data])
  const { primary, highlight, others } = useMemo(() => splitTodayJobs(items, new Date()), [items])
  const summary = summarizeAttendance(openRecord, history, now)

  return (
    <section
      aria-labelledby="today-work-heading"
      className="overflow-hidden rounded-2xl border border-[rgba(11,60,93,0.08)] bg-card shadow-brand"
    >
      <header className="flex items-center justify-between gap-3 border-b-2 border-accent bg-primary px-4 py-3 text-primary-foreground">
        <div className="min-w-0">
          <p id="today-work-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Today&apos;s Work
          </p>
          <p className="font-display text-base font-semibold leading-tight">{format(now, 'EEEE, MMM d')}</p>
        </div>
        <AttendancePill summary={summary} />
      </header>

      <div className="space-y-3 p-4">
        {today.isLoading ? <p className="text-sm text-muted-foreground">Loading today&apos;s work…</p> : null}
        {today.isError ? (
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your schedule. Try again shortly.</p>
        ) : null}
        {!today.isLoading && !today.isError && !primary ? (
          <NoJobToday nextJob={upcoming.data?.[0] ?? null} todayKey={todayKey} />
        ) : null}
        {primary ? <PrimaryJob item={primary} highlight={highlight} summary={summary} /> : null}

        {others.length === 1 ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also today</p>
            <OtherJobRow item={others[0]} />
          </div>
        ) : null}
        {others.length > 1 ? (
          <Disclosure
            label="Also today"
            count={others.length}
            desktopOpen
            className="border-t border-border pt-2"
            panelClassName="space-y-1.5 pt-1"
          >
            <p className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
              Also today ({others.length})
            </p>
            {others.map((item) => (
              <OtherJobRow key={item.entry_id} item={item} />
            ))}
          </Disclosure>
        ) : null}
      </div>
    </section>
  )
}
