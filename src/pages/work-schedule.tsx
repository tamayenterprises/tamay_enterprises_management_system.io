import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ChevronLeft, ChevronRight, MapPin, Plus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useWorkSchedule } from '@/features/schedule/hooks'
import { ScheduleEntryDialog } from '@/features/schedule/schedule-entry-dialog'
import {
  canonicalProjectAddress,
  formatScheduleTimeRange,
  parseDateKey,
  scheduleDayLabel,
  toDateKey,
  weekDays,
} from '@/features/schedule/schedule-links'
import { cn, fullName } from '@/lib/utils'
import type { WorkScheduleEntry } from '@/types/database'

type ViewMode = 'day' | 'week'

export function WorkSchedulePage() {
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkScheduleEntry | null>(null)

  const todayKey = toDateKey(new Date())
  const anchorKey = toDateKey(anchor)
  const days = useMemo(() => (view === 'day' ? [toDateKey(anchor)] : weekDays(anchor)), [view, anchor])
  const from = days[0]
  const to = days[days.length - 1]
  const { data: entries = [], isLoading, isError } = useWorkSchedule(from, to)

  const byDay = useMemo(() => {
    const map = new Map<string, WorkScheduleEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.work_date) ?? []
      list.push(entry)
      map.set(entry.work_date, list)
    }
    return map
  }, [entries])

  const step = view === 'day' ? 1 : 7
  const rangeLabel =
    view === 'day'
      ? format(anchor, 'EEEE, MMM d, yyyy')
      : `${format(parseDateKey(from), 'MMM d')} – ${format(parseDateKey(to), 'MMM d, yyyy')}`
  const showsToday = days.includes(todayKey)

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (entry: WorkScheduleEntry) => {
    setEditing(entry)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Work Schedule</h1>
          <p className="text-sm text-muted-foreground">Plan who works where. Employees see their jobs in the app.</p>
        </div>
        <Button className="h-11 w-full sm:w-auto" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Schedule Work
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-white p-1" role="group" aria-label="View">
          {(['day', 'week'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-medium capitalize transition',
                view === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
          onClick={() => setAnchor((d) => addDays(d, -step))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant={showsToday ? 'default' : 'outline'}
          className="h-11"
          onClick={() => setAnchor(new Date())}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label={view === 'day' ? 'Next day' : 'Next week'}
          onClick={() => setAnchor((d) => addDays(d, step))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <p className="text-sm font-medium text-muted-foreground">{rangeLabel}</p>
      </div>

      {isLoading ? <LoadingState label="Loading schedule..." /> : null}
      {isError ? (
        <EmptyState
          title="Unable to load the work schedule"
          description="If this is a new setup, the work schedule database migration may not be applied yet."
        />
      ) : null}

      {!isLoading && !isError ? (
        <div className="space-y-5">
          {days.map((day) => {
            const dayEntries = byDay.get(day) ?? []
            return (
              <section key={day} aria-labelledby={`ws-${day}`} className="space-y-2">
                <h2
                  id={`ws-${day}`}
                  className={cn(
                    'text-sm font-semibold uppercase tracking-wide text-muted-foreground',
                    day === todayKey && 'text-primary',
                  )}
                >
                  {scheduleDayLabel(day, todayKey)}
                </h2>
                {dayEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    No work scheduled
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dayEntries.map((entry) => (
                      <ManagementEntryCard key={entry.id} entry={entry} onOpen={() => openEdit(entry)} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : null}

      <ScheduleEntryDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        entry={editing}
        defaultDate={view === 'day' ? anchorKey : showsToday ? todayKey : from}
      />
    </div>
  )
}

function ManagementEntryCard({ entry, onOpen }: { entry: WorkScheduleEntry; onOpen: () => void }) {
  const assignees = entry.assignees ?? []
  const names = assignees
    .map((a) => (a.profile ? fullName(a.profile.first_name, a.profile.last_name) : 'Unknown'))
    .sort((a, b) => a.localeCompare(b))
  const inactive = assignees.filter(
    (a) => a.profile && (!a.profile.is_active || a.profile.archived_at || a.profile.approval_status !== 'approved'),
  )
  const address = canonicalProjectAddress(entry.project)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/30 hover:bg-[#fbfcff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm font-semibold">
          {formatScheduleTimeRange(entry.start_time, entry.end_time)}
        </p>
        {entry.project?.archived_at ? <Badge variant="warning">Project archived</Badge> : null}
      </div>
      <p className="mt-0.5 font-semibold leading-snug">{entry.project?.name ?? 'Project'}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{entry.task}</p>
      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{names.length > 0 ? names.join(', ') : 'No one assigned'}</span>
      </p>
      {address ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{address}</span>
        </p>
      ) : null}
      {inactive.length > 0 ? (
        <p className="mt-1 text-xs text-destructive">
          {inactive.length === 1 ? '1 person is' : `${inactive.length} people are`} no longer active — edit to update.
        </p>
      ) : null}
    </button>
  )
}
