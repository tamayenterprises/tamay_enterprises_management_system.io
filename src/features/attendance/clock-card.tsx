import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClockIn, useClockOut, useMyAttendanceHistory, useMyOpenAttendance } from '@/features/attendance/hooks'
import { useProjects } from '@/features/data/hooks'
import { confirmAction } from '@/lib/uploads'
import { formatHoursDuration, formatRelative } from '@/lib/utils'

export function ClockInOutCard() {
  const { data: openRecord, isLoading, isError } = useMyOpenAttendance()
  const { data: history = [] } = useMyAttendanceHistory(5)
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const clockIn = useClockIn()
  const clockOut = useClockOut()
  const [projectId, setProjectId] = useState<string>('none')

  if (isLoading) return <LoadingState label="Loading time clock..." />
  if (isError) return <EmptyState title="Unable to load time clock" />

  const isClockedIn = Boolean(openRecord)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time clock</CardTitle>
        <CardDescription>Clock in and out to track your working hours.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isClockedIn && openRecord ? (
          <div className="space-y-1 rounded-xl border border-border bg-[#fbfcff] px-3 py-3">
            <Badge variant="secondary">Clocked in</Badge>
            <p className="font-display text-2xl font-semibold">
              {format(new Date(openRecord.clock_in_time), 'h:mm a')}
            </p>
            <p className="text-sm text-muted-foreground">
              Project: {openRecord.project?.name || 'No project selected'}
            </p>
            <p className="text-xs text-muted-foreground">{formatRelative(openRecord.clock_in_time)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Assigned project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">You are currently clocked out.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isClockedIn || clockIn.isPending}
            onClick={async () => {
              try {
                await clockIn.mutateAsync({
                  projectId: projectId === 'none' ? null : projectId,
                })
                toast.success('Clocked in — status set to Active')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Clock in failed')
              }
            }}
          >
            {clockIn.isPending ? 'Clocking in…' : 'Clock in'}
          </Button>
          <Button
            variant="outline"
            disabled={!isClockedIn || clockOut.isPending || !openRecord}
            onClick={async () => {
              if (!openRecord) return
              if (!confirmAction('Clock out now? Your hours will be calculated and status set to Completed for Day.')) {
                return
              }
              try {
                const record = await clockOut.mutateAsync({ recordId: openRecord.id })
                toast.success(`Clocked out — ${formatHoursDuration(record.total_hours)}`)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Clock out failed')
              }
            }}
          >
            {clockOut.isPending ? 'Clocking out…' : 'Clock out'}
          </Button>
        </div>

        {history.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Recent shifts</p>
            {history.map((row) => (
              <div key={row.id} className="flex items-center justify-between text-sm">
                <div>
                  <p>{format(new Date(row.clock_in_time), 'MMM d')}</p>
                  <p className="text-xs text-muted-foreground">{row.project?.name || 'No project'}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {format(new Date(row.clock_in_time), 'h:mm a')}
                    {row.clock_out_time ? ` – ${format(new Date(row.clock_out_time), 'h:mm a')}` : ' – open'}
                  </p>
                  <p>{formatHoursDuration(row.total_hours)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
