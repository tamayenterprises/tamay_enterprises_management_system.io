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
  useAttendanceAttempts,
  useAttendanceCorrections,
  useAttendanceEvents,
  useAttendanceRecords,
  useCorrectAttendance,
  useExceptionRequests,
  useResolveExceptionRequest,
  type AttendanceFilters,
} from '@/features/attendance/hooks'
import { useProfiles, useProjects } from '@/features/data/hooks'
import { actionButtonLabel, formatBreakDuration, formatDistance } from '@/lib/geo'
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
  const [reason, setReason] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const { data: events = [] } = useAttendanceEvents(selected?.id)
  const { data: corrections = [] } = useAttendanceCorrections(selected?.id)
  const { data: rejectedAttempts = [] } = useAttendanceAttempts({ onlyRejected: true })
  const { data: pendingExceptions = [] } = useExceptionRequests('pending')
  const resolveException = useResolveExceptionRequest()

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
                  setReason('')
                  setBreakMinutes(String(Math.round((row.break_seconds || 0) / 60)))
                }}
              >
                <AttendanceRow record={row} />
              </button>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending location exceptions</CardTitle>
          <CardDescription>
            Exception approval does not auto-create attendance unless you choose Create attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendingExceptions.length === 0 ? (
            <EmptyState title="No pending exceptions" />
          ) : (
            pendingExceptions.map((req) => (
              <div key={req.id} className="space-y-2 rounded-md border border-border px-3 py-3 text-sm">
                <p className="font-medium">
                  {req.profile ? fullName(req.profile.first_name, req.profile.last_name) : 'Worker'} ·{' '}
                  {actionButtonLabel(req.requested_action)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {req.project?.name} · {format(new Date(req.created_at), 'MMM d, h:mm a')}
                </p>
                <p>{req.explanation}</p>
                {req.calculated_distance_meters != null ? (
                  <p className="text-xs">Distance: {formatDistance(req.calculated_distance_meters)}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={resolveException.isPending}
                    onClick={async () => {
                      try {
                        await resolveException.mutateAsync({
                          requestId: req.id,
                          approve: true,
                          createAttendance: true,
                          adminNote: 'Approved with attendance created',
                        })
                        toast.success('Exception approved and attendance created')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Failed')
                      }
                    }}
                  >
                    Approve + create attendance
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveException.isPending}
                    onClick={async () => {
                      try {
                        await resolveException.mutateAsync({
                          requestId: req.id,
                          approve: true,
                          createAttendance: false,
                          adminNote: 'Approved without creating attendance yet',
                        })
                        toast.success('Exception approved (no attendance created)')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Failed')
                      }
                    }}
                  >
                    Approve only
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={resolveException.isPending}
                    onClick={async () => {
                      try {
                        await resolveException.mutateAsync({
                          requestId: req.id,
                          approve: false,
                          adminNote: 'Rejected',
                        })
                        toast.success('Exception rejected')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Failed')
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejected location attempts</CardTitle>
          <CardDescription>Visible to management only — not to other employees.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rejectedAttempts.length === 0 ? (
            <EmptyState title="No rejected attempts" />
          ) : (
            rejectedAttempts.slice(0, 20).map((attempt) => (
              <div key={attempt.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium">
                  {attempt.profile
                    ? fullName(attempt.profile.first_name, attempt.profile.last_name)
                    : 'Worker'}{' '}
                  · {actionButtonLabel(attempt.action)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {attempt.project?.name || '—'} · {format(new Date(attempt.server_timestamp), 'MMM d, h:mm a')} ·{' '}
                  {attempt.validation_result}
                </p>
                <p className="text-xs">{attempt.rejection_reason}</p>
                <p className="text-xs text-muted-foreground">
                  Distance {formatDistance(attempt.calculated_distance_meters)} · Accuracy{' '}
                  {attempt.device_accuracy_meters != null
                    ? formatDistance(Number(attempt.device_accuracy_meters))
                    : '—'}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance detail & correction</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {selected.profile
                  ? fullName(selected.profile.first_name, selected.profile.last_name)
                  : 'Worker'}
              </p>
              <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                <p>Paid hours: {formatHoursDuration(selected.paid_hours ?? selected.total_hours)}</p>
                <p>Break time: {formatBreakDuration(selected.break_seconds)}</p>
                <p>Status: {selected.workflow_status || '—'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Event timeline</p>
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No geofenced events (legacy record).</p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="rounded-md bg-muted/40 px-2 py-1 text-xs">
                      <p>
                        {actionButtonLabel(event.action)} ·{' '}
                        {format(new Date(event.server_timestamp), 'MMM d, h:mm a')}
                      </p>
                      <p className="text-muted-foreground">
                        Dist {formatDistance(event.calculated_distance_meters)} · Acc{' '}
                        {event.device_accuracy_meters != null
                          ? formatDistance(Number(event.device_accuracy_meters))
                          : '—'}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1">
                <Label>Clock in</Label>
                <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Clock out</Label>
                <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Total break minutes</Label>
                <Input
                  type="number"
                  min={0}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                />
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
                <Label>Correction reason (required)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being corrected?"
                />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
              <Button
                disabled={correct.isPending || !clockIn || reason.trim().length < 3}
                onClick={async () => {
                  if (!confirmAction('Save corrected attendance? Original values are kept in the audit trail.')) {
                    return
                  }
                  try {
                    await correct.mutateAsync({
                      id: selected.id,
                      clockInTime: fromLocalInputValue(clockIn),
                      clockOutTime: clockOut ? fromLocalInputValue(clockOut) : null,
                      projectId: projectId === 'none' ? null : projectId,
                      breakSeconds: Number(breakMinutes || 0) * 60,
                      reason,
                      notes: notes || null,
                    })
                    toast.success('Attendance corrected with audit trail')
                    setSelected(null)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Correction failed')
                  }
                }}
              >
                {correct.isPending ? 'Saving…' : 'Save correction'}
              </Button>

              {corrections.length > 0 ? (
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-sm font-medium">Correction history</p>
                  {corrections.map((c) => (
                    <div key={c.id} className="rounded-md border border-border px-2 py-1 text-xs">
                      <p>
                        {c.corrector
                          ? fullName(c.corrector.first_name, c.corrector.last_name)
                          : 'Manager'}{' '}
                        · {format(new Date(c.created_at), 'MMM d, h:mm a')}
                      </p>
                      <p className="text-muted-foreground">{c.reason}</p>
                    </div>
                  ))}
                </div>
              ) : null}
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
          {record.workflow_status === 'on_break' ? ' · on break' : ''}
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
          <p className="text-xs text-muted-foreground">
            Paid {formatHoursDuration(record.paid_hours ?? record.total_hours)}
            {record.break_seconds ? ` · break ${formatBreakDuration(record.break_seconds)}` : ''}
          </p>
        ) : (
          <Badge variant="secondary">
            {record.workflow_status === 'on_break' ? 'On break' : 'On the clock'}
          </Badge>
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
