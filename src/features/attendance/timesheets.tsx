import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useAttendanceRecords,
  useCorrectAttendance,
  type AttendanceFilters,
} from '@/features/attendance/hooks'
import { useProfiles, useProjects } from '@/features/data/hooks'
import { confirmAction } from '@/lib/uploads'
import { formatHoursDuration, fullName, roleLabel } from '@/lib/utils'
import type { AttendanceRecord, UserRole } from '@/types/database'

function toLocalInputValue(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string) {
  return new Date(value).toISOString()
}

export function DailyAttendanceSummary() {
  const today = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const { data = [], isLoading, isError } = useAttendanceRecords({ fromDate: today, toDate: today })

  if (isLoading) return <LoadingState label="Loading today's attendance..." />
  if (isError) return <EmptyState title="Unable to load attendance" />

  const openCount = data.filter((row) => !row.clock_out_time).length
  const closed = data.filter((row) => row.clock_out_time)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Today&apos;s attendance</CardTitle>
          <CardDescription>Who clocked in today across the workforce.</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/timesheets">View timesheets</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryPill label="Clocked in today" value={data.length} />
          <SummaryPill label="Still on the clock" value={openCount} />
          <SummaryPill label="Completed shifts" value={closed.length} />
        </div>
        {data.length === 0 ? (
          <EmptyState title="No attendance yet today" description="Records appear when workers clock in." />
        ) : (
          data.slice(0, 8).map((row) => <AttendanceRow key={row.id} record={row} compact />)
        )}
      </CardContent>
    </Card>
  )
}

export function TimesheetsPanel() {
  const [filters, setFilters] = useState<AttendanceFilters>({
    role: 'all',
    fromDate: format(startOfDay(new Date()), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  })
  const [selected, setSelected] = useState<AttendanceRecord | null>(null)
  const { data: projects = [] } = useProjects()
  const { data: workers = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager'],
  })
  const { data = [], isLoading, isError } = useAttendanceRecords(filters)
  const correct = useCorrectAttendance()

  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [projectId, setProjectId] = useState('none')
  const [notes, setNotes] = useState('')

  const workerOptions = useMemo(
    () =>
      workers.filter(
        (person) =>
          person.approval_status === 'approved' && person.is_active && !person.archived_at,
      ),
    [workers],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Timesheet filters</CardTitle>
          <CardDescription>Filter attendance by worker, role, project, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <Label>Worker</Label>
            <Select
              value={filters.userId ?? 'all'}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, userId: value === 'all' ? undefined : value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All workers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workers</SelectItem>
                {workerOptions.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {fullName(person.first_name, person.last_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select
              value={filters.role ?? 'all'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  role: value as UserRole | 'all',
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="subcontractor">Subcontractor</SelectItem>
                <SelectItem value="project_manager">Project Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Project</Label>
            <Select
              value={filters.projectId ?? 'all'}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  projectId: value === 'all' ? undefined : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>From</Label>
            <Input
              type="date"
              value={filters.fromDate ?? ''}
              onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value || undefined }))}
            />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input
              type="date"
              value={filters.toDate ?? ''}
              onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value || undefined }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance history</CardTitle>
          <CardDescription>Clock in/out times and calculated hours. Click a row to correct a record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <LoadingState label="Loading timesheets..." /> : null}
          {isError ? <EmptyState title="Unable to load timesheets" /> : null}
          {!isLoading && !isError && data.length === 0 ? (
            <EmptyState title="No attendance records" description="Try adjusting filters or wait for workers to clock in." />
          ) : null}
          {!isLoading &&
            !isError &&
            data.map((row) => (
              <button
                key={row.id}
                type="button"
                className="w-full text-left"
                onClick={() => {
                  setSelected(row)
                  setClockIn(toLocalInputValue(row.clock_in_time))
                  setClockOut(row.clock_out_time ? toLocalInputValue(row.clock_out_time) : '')
                  setProjectId(row.project_id ?? 'none')
                  setNotes(row.notes ?? '')
                }}
              >
                <AttendanceRow record={row} />
              </button>
            ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct attendance</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {selected.profile
                  ? fullName(selected.profile.first_name, selected.profile.last_name)
                  : 'Worker'}
              </p>
              <div className="space-y-1">
                <Label>Clock in</Label>
                <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Clock out</Label>
                <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue />
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
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Correction reason" />
              </div>
              <Button
                disabled={correct.isPending || !clockIn}
                onClick={async () => {
                  if (!confirmAction('Save corrected attendance times for this worker?')) return
                  try {
                    await correct.mutateAsync({
                      id: selected.id,
                      clockInTime: fromLocalInputValue(clockIn),
                      clockOutTime: clockOut ? fromLocalInputValue(clockOut) : null,
                      projectId: projectId === 'none' ? null : projectId,
                      notes: notes || null,
                    })
                    toast.success('Attendance corrected')
                    setSelected(null)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Correction failed')
                  }
                }}
              >
                {correct.isPending ? 'Saving…' : 'Save correction'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AttendanceRow({ record, compact }: { record: AttendanceRecord; compact?: boolean }) {
  const name = record.profile
    ? fullName(record.profile.first_name, record.profile.last_name)
    : 'Worker'
  const role = record.profile ? roleLabel(record.profile.role) : '—'

  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {role}
          {record.project?.name ? ` · ${record.project.name}` : ''}
        </p>
        {!compact ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {format(new Date(record.clock_in_time), 'MMM d, yyyy')}
          </p>
        ) : null}
      </div>
      <div className="text-right text-sm">
        <p>
          In {format(new Date(record.clock_in_time), 'h:mm a')}
          {record.clock_out_time
            ? ` · Out ${format(new Date(record.clock_out_time), 'h:mm a')}`
            : null}
        </p>
        {record.clock_out_time ? (
          <p className="text-xs text-muted-foreground">{formatHoursDuration(record.total_hours)}</p>
        ) : (
          <Badge variant="secondary">On the clock</Badge>
        )}
      </div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-[#fbfcff] px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-semibold">{value}</p>
    </div>
  )
}
