import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/features/auth/auth-hooks'
import { canHaveWorkSchedule, useMyWorkSchedule } from '@/features/schedule/hooks'
import { ScheduleEntryCard } from '@/features/schedule/schedule-entry-card'
import {
  parseDateKey,
  scheduleDayLabel,
  toDateKey,
  weekDays,
} from '@/features/schedule/schedule-links'
import { cn, isManagementRole } from '@/lib/utils'
import type { MyWorkScheduleItem } from '@/types/database'

export function MySchedulePage() {
  const { profile } = useAuth()
  const [anchor, setAnchor] = useState(() => new Date())
  const todayKey = toDateKey(new Date())
  const days = useMemo(() => weekDays(anchor), [anchor])
  const from = days[0]
  const to = days[days.length - 1]
  const { data: items = [], isLoading, isError } = useMyWorkSchedule(from, to)

  const byDay = useMemo(() => {
    const map = new Map<string, MyWorkScheduleItem[]>()
    for (const item of items) {
      const list = map.get(item.work_date) ?? []
      list.push(item)
      map.set(item.work_date, list)
    }
    return map
  }, [items])

  if (!canHaveWorkSchedule(profile?.role)) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="font-display text-2xl font-semibold">My Schedule</h1>
        <EmptyState
          title="No personal schedule for this account"
          description={
            isManagementRole(profile?.role)
              ? 'Admins are not scheduled to jobs. Use Work Schedule to plan the crew.'
              : 'Work scheduling is available for employees and project managers.'
          }
          action={
            isManagementRole(profile?.role) ? (
              <Button asChild size="sm">
                <Link to="/work-schedule">Open Work Schedule</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  const isCurrentWeek = days.includes(todayKey)
  const rangeLabel = `${format(parseDateKey(from), 'MMM d')} – ${format(parseDateKey(to), 'MMM d, yyyy')}`

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold">My Schedule</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            aria-label="Previous week"
            onClick={() => setAnchor((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant={isCurrentWeek ? 'default' : 'outline'}
            className="h-11"
            onClick={() => setAnchor(new Date())}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            aria-label="Next week"
            onClick={() => setAnchor((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <p className="text-sm font-medium text-muted-foreground">{rangeLabel}</p>
        </div>
      </div>

      {isLoading ? <LoadingState label="Loading your schedule..." /> : null}
      {isError ? (
        <EmptyState title="Unable to load your schedule" description="Check your connection and try again." />
      ) : null}

      {!isLoading && !isError ? (
        <div className="space-y-4">
          {days.map((day) => {
            const dayItems = byDay.get(day) ?? []
            const isToday = day === todayKey
            return (
              <section key={day} aria-labelledby={`day-${day}`} className="space-y-2">
                <h2
                  id={`day-${day}`}
                  className={cn(
                    'text-sm font-semibold uppercase tracking-wide text-muted-foreground',
                    isToday && 'text-primary',
                  )}
                >
                  {scheduleDayLabel(day, todayKey)}
                </h2>
                {dayItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    No work scheduled
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dayItems.map((item) => (
                      <ScheduleEntryCard key={item.entry_id} item={item} isToday={isToday} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
