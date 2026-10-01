import { Link } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DashboardSectionTitle } from '@/features/dashboard/dashboard-section-title'
import { useMyWorkSchedule } from '@/features/schedule/hooks'
import { formatScheduleTime, parseDateKey, toDateKey } from '@/features/schedule/schedule-links'
import { previewList } from '@/features/dashboard/employee-dashboard-model'

/** Next few jobs after today. The full week lives on /schedule. */
export function UpNextCard() {
  const now = new Date()
  const tomorrowKey = toDateKey(addDays(now, 1))
  const { data: items = [], isLoading, isError } = useMyWorkSchedule(tomorrowKey, toDateKey(addDays(now, 7)))
  const { shown, hiddenCount } = previewList(items)

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <DashboardSectionTitle icon={CalendarDays}>Up Next</DashboardSectionTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading upcoming work…</p> : null}
        {isError ? <p className="text-sm text-muted-foreground">We couldn&apos;t load upcoming work.</p> : null}
        {!isLoading && !isError && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing else scheduled this week.</p>
        ) : null}

        {shown.length > 0 ? (
          <ul className="divide-y divide-border">
            {shown.map((item) => (
              <li key={item.entry_id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0">
                  <span className="inline-block rounded-md bg-primary/[0.06] px-2 py-0.5 text-xs font-semibold text-primary">
                    {item.work_date === tomorrowKey
                      ? 'Tomorrow'
                      : format(parseDateKey(item.work_date), 'EEE, MMM d')}
                  </span>
                </span>
                <span className="w-16 shrink-0 text-muted-foreground">{formatScheduleTime(item.start_time)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-primary">{item.project_name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <Link
          to="/schedule"
          className="flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-semibold text-primary transition hover:bg-accent/10"
        >
          <span>
            View full schedule
            {hiddenCount > 0 ? (
              <span className="font-medium text-muted-foreground"> ({hiddenCount} more)</span>
            ) : null}
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
