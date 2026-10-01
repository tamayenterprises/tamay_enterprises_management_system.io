import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-hooks'
import { canHaveWorkSchedule, useMyWorkSchedule } from '@/features/schedule/hooks'
import { ScheduleEntryCard } from '@/features/schedule/schedule-entry-card'
import { currentOrNextIndex, toDateKey } from '@/features/schedule/schedule-links'

export function TodayWorkCard() {
  const { profile } = useAuth()
  const todayKey = toDateKey(new Date())
  const { data: items = [], isLoading, isError } = useMyWorkSchedule(todayKey, todayKey)

  const highlightIndex = useMemo(() => currentOrNextIndex(items, new Date()), [items])

  if (!canHaveWorkSchedule(profile?.role)) return null

  const highlightFor = (index: number, item: (typeof items)[number]) => {
    if (index !== highlightIndex) return null
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    const [h, m] = item.start_time.split(':')
    return Number(h) * 60 + Number(m) <= nowMinutes ? 'now' : 'next'
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          Today&apos;s Work
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/schedule">My week</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading today&apos;s schedule…</p> : null}
        {isError ? (
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your schedule. Try again shortly.</p>
        ) : null}
        {!isLoading && !isError && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work scheduled today.</p>
        ) : null}
        {items.map((item, index) => (
          <ScheduleEntryCard
            key={item.entry_id}
            item={item}
            isToday
            highlight={highlightFor(index, item)}
          />
        ))}
      </CardContent>
    </Card>
  )
}
