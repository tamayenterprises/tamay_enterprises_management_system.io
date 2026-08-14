import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import { useProfiles, useProjects, useSetWorkerStatus, useWorkerEligibility } from '@/features/data/hooks'
import {
  CORRECTION_REASON_OPTIONS,
  buildDetailedCorrectionPreview,
  buildSimpleCorrectionPreview,
  fromLocalInputValue,
  recommendDetailedMode,
  toLocalInputValue,
  type CorrectionMode,
  type CorrectionReasonCode,
  type TimelineEventInput,
} from '@/lib/attendance-correction'
import { actionButtonLabel, formatBreakDuration, formatDistance, newIdempotencyKey } from '@/lib/geo'
import { confirmAction } from '@/lib/uploads'
import { supabase } from '@/lib/supabase'
import { formatHoursDuration, fullName, roleLabel } from '@/lib/utils'
import type { AttendanceExceptionRequest, AttendanceRecord, UserRole } from '@/types/database'

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
  const [linkedException, setLinkedException] = useState<AttendanceExceptionRequest | null>(null)
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
  const [reasonCode, setReasonCode] = useState<CorrectionReasonCode | ''>('')
  const [reasonOther, setReasonOther] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>('simple')
  const [detailedEvents, setDetailedEvents] = useState<TimelineEventInput[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey())
  const timelineSeededFor = useRef<string | null>(null)

  const { data: events = [], isFetching: eventsFetching } = useAttendanceEvents(selected?.id)
  const { data: corrections = [] } = useAttendanceCorrections(selected?.id)
  const { data: rejectedAttempts = [] } = useAttendanceAttempts({ onlyRejected: true })
  const { data: pendingExceptions = [] } = useExceptionRequests('pending')
  const resolveException = useResolveExceptionRequest()
  const [params] = useSearchParams()
  const focusExceptionId = params.get('exception')
  const focusRecordId = params.get('record')

  useEffect(() => {
    if (!focusExceptionId) return
    const timer = window.setTimeout(() => {
      document
        .getElementById(`exception-${focusExceptionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [focusExceptionId, pendingExceptions])

  useEffect(() => {
    if (!focusRecordId || selected?.id === focusRecordId) return
    const row = data.find((r) => r.id === focusRecordId)
    if (row) openCorrection(row)
  }, [focusRecordId, data, selected?.id])

  // Seed detailed timeline after events for the selected record have loaded (avoids stale prior row).
  useEffect(() => {
    if (!selected?.id || eventsFetching) return
    if (timelineSeededFor.current === selected.id) return
    timelineSeededFor.current = selected.id

    const breakStarts = events.filter((e) => e.action === 'BREAK_STARTED').length
    const missingBreakEnd =
      Boolean(selected.active_break_started_at) || selected.workflow_status === 'on_break'
    const missingClockOut = !selected.clock_out_time
    const preferDetailed = recommendDetailedMode({
      eventCount: events.length,
      missingBreakEnd,
      missingClockOut,
      breakEventCount: breakStarts * 2,
    })
    setCorrectionMode(preferDetailed ? 'detailed' : 'simple')

    const seeded: TimelineEventInput[] = [{ action: 'WORK_STARTED', timestamp: selected.clock_in_time }]
    for (const event of events) {
      if (event.action === 'WORK_STARTED') continue
      seeded.push({ action: event.action, timestamp: event.server_timestamp })
    }
    if (
      selected.active_break_started_at &&
      !seeded.some(
        (e) => e.action === 'BREAK_STARTED' && e.timestamp === selected.active_break_started_at,
      )
    ) {
      seeded.push({ action: 'BREAK_STARTED', timestamp: selected.active_break_started_at })
    }
    setDetailedEvents(seeded)
  }, [selected, events, eventsFetching])

  const workerOptions = useMemo(
    () =>
      workers.filter(
        (person) =>
          person.approval_status === 'approved' && person.is_active && !person.archived_at,
      ),
    [workers],
  )

  function openCorrection(row: AttendanceRecord, exception?: AttendanceExceptionRequest | null) {
    timelineSeededFor.current = null
    setSelected(row)
    setLinkedException(exception ?? null)
    setClockIn(toLocalInputValue(row.clock_in_time))
    setClockOut(row.clock_out_time ? toLocalInputValue(row.clock_out_time) : '')
    setProjectId(row.project_id ?? 'none')
    setNotes(row.notes ?? '')
    setReasonCode(exception ? 'incomplete_workday' : '')
    setReasonOther('')
    setBreakMinutes(
      String(
        row.break_seconds > 0
          ? Math.round(row.break_seconds / 60)
          : row.workflow_status === 'on_break' || Boolean(row.active_break_started_at)
            ? 30
            : 0,
      ),
    )
    setIdempotencyKey(newIdempotencyKey())
    setDetailedEvents([{ action: 'WORK_STARTED', timestamp: row.clock_in_time }])
  }

  const originalBreakStart =
    selected?.active_break_started_at ||
    events.filter((e) => e.action === 'BREAK_STARTED').at(-1)?.server_timestamp ||
    null

  const preview = useMemo(() => {
    if (!selected || !clockIn) return { value: null as ReturnType<typeof buildSimpleCorrectionPreview> | null, error: null as string | null }
    try {
      if (correctionMode === 'simple') {
        return {
          value: buildSimpleCorrectionPreview({
            clockInIso: fromLocalInputValue(clockIn),
            clockOutIso: clockOut ? fromLocalInputValue(clockOut) : null,
            breakMinutes: Number(breakMinutes || 0),
            originalBreakStartedAt: originalBreakStart,
          }),
          error: null,
        }
      }
      const normalized = detailedEvents.map((event) => {
        const raw = event.timestamp
        const iso =
          raw.length === 16
            ? fromLocalInputValue(raw)
            : raw.includes('Z') || /[+-]\d{2}:\d{2}$/.test(raw)
              ? raw
              : fromLocalInputValue(toLocalInputValue(raw))
        return { ...event, timestamp: iso }
      })
      return { value: buildDetailedCorrectionPreview(normalized), error: null }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Invalid correction preview',
      }
    }
  }, [selected, clockIn, clockOut, breakMinutes, correctionMode, detailedEvents, originalBreakStart])

  const previewError = preview.error
  const previewValue = preview.value

  const reasonText =
    reasonCode === 'other'
      ? reasonOther.trim()
      : CORRECTION_REASON_OPTIONS.find((o) => o.value === reasonCode)?.label || ''

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Timesheet filters</CardTitle>
          <CardDescription>Filter by worker, role, project, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
                onClick={() => openCorrection(row)}
              >
                <AttendanceRow record={row} />
              </button>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending attendance exceptions</CardTitle>
          <CardDescription>
            Review the worker explanation, then Approve and Correct Attendance to repair the timesheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendingExceptions.length === 0 ? (
            <EmptyState title="No pending exceptions" />
          ) : (
            pendingExceptions.map((req) => {
              const related = data.find(
                (row) =>
                  row.id === req.attendance_record_id ||
                  row.id === req.resulting_attendance_record_id ||
                  (row.user_id === req.user_id &&
                    row.project_id === req.project_id &&
                    !row.clock_out_time),
              )
              return (
                <ExceptionRequestCard
                  key={req.id}
                  req={req}
                  related={related}
                  focusExceptionId={focusExceptionId}
                  resolveException={resolveException}
                  correctPending={correct.isPending}
                  onApproveAndCorrect={async () => {
                    if (related) {
                      openCorrection(related, req)
                      return
                    }
                    const recordId = req.attendance_record_id || req.resulting_attendance_record_id
                    if (recordId) {
                      const { data: fetched, error } = await supabase
                        .from('attendance_records')
                        .select('*, project:projects(*), profile:profiles!user_id(*)')
                        .eq('id', recordId)
                        .maybeSingle()
                      if (!error && fetched) {
                        openCorrection(fetched as AttendanceRecord, req)
                        return
                      }
                    }
                    const { data: openRows } = await supabase
                      .from('attendance_records')
                      .select('*, project:projects(*), profile:profiles!user_id(*)')
                      .eq('user_id', req.user_id)
                      .eq('project_id', req.project_id)
                      .is('clock_out_time', null)
                      .order('clock_in_time', { ascending: false })
                      .limit(1)
                    if (openRows?.[0]) {
                      openCorrection(openRows[0] as AttendanceRecord, req)
                      return
                    }

                    // Failed clock-in: no session exists yet — create attendance from the exception.
                    try {
                      const created = await resolveException.mutateAsync({
                        requestId: req.id,
                        approve: true,
                        createAttendance: true,
                        adminNote: 'Approved and created attendance from exception request',
                      })
                      const createdId = created.attendance_record_id
                      if (!createdId) {
                        toast.error(
                          'Attendance was not created. Activate the worker if inactive, then try again.',
                        )
                        return
                      }
                      const { data: fetched, error } = await supabase
                        .from('attendance_records')
                        .select('*, project:projects(*), profile:profiles!user_id(*)')
                        .eq('id', createdId)
                        .maybeSingle()
                      if (error || !fetched) {
                        toast.success(
                          'Attendance created. Refresh timesheets and open the new session to correct times.',
                        )
                        return
                      }
                      toast.success('Attendance created from exception — review and correct times if needed')
                      openCorrection(fetched as AttendanceRecord, {
                        ...req,
                        status: 'approved',
                        resulting_attendance_record_id: createdId,
                      })
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not create attendance')
                    }
                  }}
                />
              )
            })
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
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setLinkedException(null)
            timelineSeededFor.current = null
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <DialogHeader>
            <DialogTitle>Approve and correct attendance</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {selected.profile
                  ? fullName(selected.profile.first_name, selected.profile.last_name)
                  : 'Worker'}
                {selected.profile?.role ? ` · ${roleLabel(selected.profile.role)}` : ''}
              </p>

              {linkedException ? (
                <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
                  <p className="font-medium">Linked exception request</p>
                  <p>{linkedException.explanation}</p>
                  <p className="text-muted-foreground">
                    {actionButtonLabel(linkedException.requested_action)} · {linkedException.status} ·{' '}
                    {format(new Date(linkedException.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              ) : null}

              <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Original timeline</p>
                <p>Clock In: {format(new Date(selected.clock_in_time), 'MMM d, yyyy h:mm a')}</p>
                <p>
                  Start Break:{' '}
                  {originalBreakStart
                    ? format(new Date(originalBreakStart), 'MMM d, yyyy h:mm a')
                    : 'Missing'}
                </p>
                <p>
                  End Break:{' '}
                  {events.some((e) => e.action === 'BREAK_ENDED')
                    ? format(
                        new Date(events.filter((e) => e.action === 'BREAK_ENDED').at(-1)!.server_timestamp),
                        'MMM d, yyyy h:mm a',
                      )
                    : 'Missing'}
                </p>
                <p>
                  Clock Out:{' '}
                  {selected.clock_out_time
                    ? format(new Date(selected.clock_out_time), 'MMM d, yyyy h:mm a')
                    : 'Missing'}
                </p>
                <p>
                  Status: {selected.workflow_status || '—'} · Paid:{' '}
                  {formatHoursDuration(selected.paid_hours ?? selected.total_hours)}
                </p>
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
                        {event.device_info &&
                        typeof event.device_info === 'object' &&
                        (event.device_info as { isAdministrativeCorrection?: boolean })
                          .isAdministrativeCorrection
                          ? ' · admin correction'
                          : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-1">
                <Label>Correction type</Label>
                <Select
                  value={correctionMode}
                  onValueChange={(value) => setCorrectionMode(value as CorrectionMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple Correction</SelectItem>
                    <SelectItem value="detailed">Detailed Timeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {correctionMode === 'simple' ? (
                <>
                  <div className="space-y-1">
                    <Label>Clock in</Label>
                    <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Clock out</Label>
                    <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Total unpaid break minutes</Label>
                    <Input
                      type="number"
                      min={0}
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {detailedEvents.map((event, index) => (
                    <div key={`${event.action}-${index}`} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Select
                        value={event.action}
                        onValueChange={(value) =>
                          setDetailedEvents((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, action: value as TimelineEventInput['action'] }
                                : row,
                            ),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['WORK_STARTED', 'BREAK_STARTED', 'BREAK_ENDED', 'WORK_ENDED'] as const).map(
                            (action) => (
                              <SelectItem key={action} value={action}>
                                {actionButtonLabel(action)}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        type="datetime-local"
                        value={
                          event.timestamp.length === 16
                            ? event.timestamp
                            : toLocalInputValue(event.timestamp)
                        }
                        onChange={(e) =>
                          setDetailedEvents((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, timestamp: e.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDetailedEvents((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, exclude: !row.exclude } : row,
                            ),
                          )
                        }
                      >
                        {event.exclude ? 'Include' : 'Exclude'}
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDetailedEvents((prev) => [
                        ...prev,
                        {
                          action: 'BREAK_STARTED',
                          timestamp: clockIn || toLocalInputValue(new Date().toISOString()),
                        },
                      ])
                    }
                  >
                    Add another break / event
                  </Button>
                </div>
              )}

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
                <Select
                  value={reasonCode || undefined}
                  onValueChange={(value) => setReasonCode(value as CorrectionReasonCode)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {CORRECTION_REASON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reasonCode === 'other' ? (
                  <Input
                    className="mt-2"
                    value={reasonOther}
                    onChange={(e) => setReasonOther(e.target.value)}
                    placeholder="Explain the other reason"
                  />
                ) : null}
              </div>

              <div className="space-y-1">
                <Label>Administrative notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>

              <div className="rounded-md border border-border px-3 py-2 text-xs">
                <p className="font-medium">Corrected timeline preview</p>
                {previewError ? <p className="text-destructive">{previewError}</p> : null}
                {previewValue ? (
                  <>
                    <p>Clock In: {format(new Date(previewValue.clockIn), 'MMM d, yyyy h:mm a')}</p>
                    {previewValue.timeline
                      .filter((e) => e.action === 'BREAK_STARTED' || e.action === 'BREAK_ENDED')
                      .map((e, i) => (
                        <p key={`${e.action}-${i}`}>
                          {actionButtonLabel(e.action)}: {format(new Date(e.timestamp), 'MMM d, yyyy h:mm a')}
                        </p>
                      ))}
                    <p>
                      Clock Out:{' '}
                      {previewValue.clockOut
                        ? format(new Date(previewValue.clockOut), 'MMM d, yyyy h:mm a')
                        : 'Missing'}
                    </p>
                    <p>Total break: {formatBreakDuration(previewValue.breakSeconds)}</p>
                    <p>Paid time: {formatHoursDuration(previewValue.paidHours)}</p>
                    <p>Status: {previewValue.status}</p>
                    {previewValue.warnings.map((warning) => (
                      <p key={warning} className="text-amber-700">
                        {warning}
                      </p>
                    ))}
                  </>
                ) : null}
              </div>

              <Button
                className="min-h-11 w-full"
                disabled={
                  correct.isPending ||
                  !clockIn ||
                  !reasonText ||
                  reasonText.length < 3 ||
                  Boolean(previewError) ||
                  !previewValue ||
                  projectId === 'none'
                }
                onClick={async () => {
                  if (!previewValue) return
                  if (
                    !confirmAction(
                      'Save corrected attendance? Original values remain in the audit trail and the exception (if linked) will be marked resolved.',
                    )
                  ) {
                    return
                  }
                  try {
                    const clockInIso = fromLocalInputValue(clockIn)
                    const clockOutIso = clockOut ? fromLocalInputValue(clockOut) : null
                    const result = await correct.mutateAsync({
                      id: selected.id,
                      clockInTime: correctionMode === 'simple' ? clockInIso : previewValue.clockIn,
                      clockOutTime: correctionMode === 'simple' ? clockOutIso : previewValue.clockOut,
                      projectId: projectId === 'none' ? null : projectId,
                      breakSeconds: previewValue.breakSeconds,
                      reason: reasonText,
                      notes: notes || null,
                      exceptionRequestId: linkedException?.id ?? null,
                      correctionMode,
                      timeline: previewValue.timeline,
                      idempotencyKey,
                      expectedUpdatedAt: selected.updated_at,
                      reasonCode: reasonCode || null,
                    })
                    toast.success(result.message || 'Attendance correction saved successfully.')
                    setSelected(null)
                    setLinkedException(null)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Correction failed')
                    setIdempotencyKey(newIdempotencyKey())
                  }
                }}
              >
                {correct.isPending ? 'Saving correction…' : 'Save correction'}
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
                        {c.revision ? ` · rev ${c.revision}` : ''}
                      </p>
                      <p className="text-muted-foreground">{c.reason}</p>
                      <Badge variant="outline">Corrected</Badge>
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

function ExceptionRequestCard({
  req,
  related,
  focusExceptionId,
  resolveException,
  correctPending,
  onApproveAndCorrect,
}: {
  req: AttendanceExceptionRequest
  related?: AttendanceRecord
  focusExceptionId: string | null
  resolveException: ReturnType<typeof useResolveExceptionRequest>
  correctPending: boolean
  onApproveAndCorrect: () => Promise<void>
}) {
  const { data: eligibility } = useWorkerEligibility(req.user_id)
  const setStatus = useSetWorkerStatus()
  const [activateReason, setActivateReason] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const inactive = eligibility && !eligibility.can_submit_attendance

  return (
    <div
      id={`exception-${req.id}`}
      className={`space-y-2 rounded-md border px-3 py-3 text-sm ${
        focusExceptionId === req.id ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">
          {req.profile ? fullName(req.profile.first_name, req.profile.last_name) : 'Worker'} ·{' '}
          {actionButtonLabel(req.requested_action)}
        </p>
        <Badge variant="secondary">{req.status}</Badge>
        {req.profile?.role ? <Badge variant="outline">{roleLabel(req.profile.role)}</Badge> : null}
        {eligibility ? (
          <Badge variant={eligibility.can_submit_attendance ? 'success' : 'destructive'}>
            {eligibility.derived_status}
          </Badge>
        ) : null}
      </div>
      {inactive ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-2">
          <p className="font-medium">
            {req.profile
              ? `${fullName(req.profile.first_name, req.profile.last_name)}’s employee profile is inactive.`
              : 'This worker profile is inactive.'}{' '}
            Review and activate the worker before creating attendance. The exception remains reviewable.
          </p>
          <p>{eligibility?.blocking_reason}</p>
          <Input
            placeholder="Activation reason (required)"
            value={activateReason}
            onChange={(e) => setActivateReason(e.target.value)}
          />
          <Button
            size="sm"
            disabled={setStatus.isPending || activateReason.trim().length < 3}
            onClick={async () => {
              try {
                await setStatus.mutateAsync({
                  workerId: req.user_id,
                  action: 'activate',
                  reason: activateReason.trim(),
                })
                toast.success('Worker activated. Continue with Approve and Correct Attendance — activation alone does not create attendance.')
                setActivateReason('')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Activation failed')
              }
            }}
          >
            Activate Worker and Continue Review
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {req.project?.name} · {format(new Date(req.created_at), 'MMM d, h:mm a')}
        {req.work_date ? ` · work date ${req.work_date}` : ''}
      </p>
      <p>{req.explanation}</p>
      {req.follow_up_note ? (
        <p className="text-xs text-muted-foreground">Follow-up: {req.follow_up_note}</p>
      ) : null}
      {req.calculated_distance_meters != null ? (
        <p className="text-xs">Distance: {formatDistance(req.calculated_distance_meters)}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={correctPending || resolveException.isPending} onClick={() => void onApproveAndCorrect()}>
          Approve and Correct Attendance
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={resolveException.isPending}
          onClick={async () => {
            try {
              const result = await resolveException.mutateAsync({
                requestId: req.id,
                approve: true,
                createAttendance: false,
                adminNote: 'Placed under review',
              })
              toast.success(
                (result as { message?: string })?.message || 'Exception placed under review',
              )
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Failed')
            }
          }}
        >
          Mark under review
        </Button>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <Input
            placeholder="Rejection reason (required)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={resolveException.isPending || rejectNote.trim().length < 3}
            onClick={async () => {
              try {
                await resolveException.mutateAsync({
                  requestId: req.id,
                  approve: false,
                  adminNote: rejectNote.trim(),
                })
                toast.success('Exception rejected')
                setRejectNote('')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed')
              }
            }}
          >
            Reject
          </Button>
        </div>
      </div>
      {!related && !req.attendance_record_id && !req.resulting_attendance_record_id ? (
        <p className="text-xs text-amber-700">
          No linked attendance session yet. Approve and Correct will create one from this exception
          (worker must be active), then open the correction form.
        </p>
      ) : null}
    </div>
  )
}

function AttendanceRow({ record, compact }: { record: AttendanceRecord; compact?: boolean }) {
  const name = record.profile
    ? fullName(record.profile.first_name, record.profile.last_name)
    : 'Worker'
  const role = record.profile ? roleLabel(record.profile.role) : '—'

  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5">
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
