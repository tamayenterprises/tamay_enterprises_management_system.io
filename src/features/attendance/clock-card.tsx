import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useMyActiveExceptionRequest,
  useMyAttendanceHistory,
  useMyOpenAttendance,
  useRecordAttendanceAction,
  useSubmitExceptionRequest,
  type AttendanceActionError,
  type CapturedAttendanceLocation,
} from '@/features/attendance/hooks'
import { useProjects, useWorkerEligibility } from '@/features/data/hooks'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  actionButtonLabel,
  formatBreakDuration,
  formatDistance,
  newIdempotencyKey,
  nextAttendanceActions,
  type AttendanceActionType,
} from '@/lib/geo'
import { deriveWorkerEligibility } from '@/lib/worker-eligibility'
import { confirmAction, resolvedImageUploadAccept } from '@/lib/uploads'
import { formatHoursDuration, formatRelative } from '@/lib/utils'
import type { AttendanceActionResult, AttendanceExceptionRequest } from '@/types/database'

export function ClockInOutCard() {
  const { profile } = useAuth()
  const { data: openRecord, isLoading, isError } = useMyOpenAttendance()
  const { data: history = [] } = useMyAttendanceHistory(5)
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const { data: eligibilityRpc } = useWorkerEligibility(profile?.id)
  const recordAction = useRecordAttendanceAction()
  const submitException = useSubmitExceptionRequest()

  const [projectId, setProjectId] = useState<string>('')
  const [busyAction, setBusyAction] = useState<AttendanceActionType | null>(null)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [exceptionAction, setExceptionAction] = useState<AttendanceActionType>('WORK_STARTED')
  const [exceptionText, setExceptionText] = useState('')
  const [exceptionPhoto, setExceptionPhoto] = useState<File | null>(null)
  const [lastResult, setLastResult] = useState<AttendanceActionResult | null>(null)
  const [lastLocation, setLastLocation] = useState<CapturedAttendanceLocation | null>(null)
  const [activeRequest, setActiveRequest] = useState<AttendanceExceptionRequest | null>(null)
  const [submitToken, setSubmitToken] = useState(() => newIdempotencyKey())
  const [actionToken, setActionToken] = useState(() => newIdempotencyKey())

  const eligibility = eligibilityRpc ?? deriveWorkerEligibility(profile)
  const canClock = eligibility.can_submit_attendance
  const canRequestException = eligibility.can_submit_exception_request

  const activeProjectId = openRecord?.project_id || projectId
  const workflowStatus = openRecord?.workflow_status ?? null
  const actions = useMemo(() => nextAttendanceActions(workflowStatus), [workflowStatus])
  const { data: existingActive } = useMyActiveExceptionRequest(
    exceptionOpen ? activeProjectId || undefined : undefined,
    exceptionOpen ? exceptionAction : undefined,
  )

  const verifiedProjects = projects.filter(
    (p) => p.location_verification_status === 'verified' && p.latitude != null && p.longitude != null,
  )

  if (isLoading) return <LoadingState label="Loading time clock..." />
  if (isError) return <EmptyState title="Unable to load time clock" />

  async function runAction(action: AttendanceActionType) {
    if (!canClock) {
      toast.error(
        eligibility.blocking_reason ||
          'Your profile cannot submit attendance yet. Ask management to activate your worker profile.',
      )
      return
    }
    const pid = action === 'WORK_STARTED' ? projectId : openRecord?.project_id || projectId
    if (!pid) {
      toast.error('Select an assigned project first')
      return
    }
    if (action === 'WORK_ENDED') {
      if (!confirmAction('Clock out now? Paid hours will exclude break time.')) return
    }

    setBusyAction(action)
    const pressKey = actionToken
    try {
      const result = await recordAction.mutateAsync({
        action,
        projectId: pid,
        idempotencyKey: pressKey,
      })
      setLastResult(result)
      setActionToken(newIdempotencyKey())
      toast.success(`${actionButtonLabel(action)} recorded`)
      if (action === 'WORK_STARTED') setProjectId(pid)
    } catch (error) {
      const attendanceError = error as AttendanceActionError
      const result = attendanceError.result
      if (result) setLastResult(result)
      if (attendanceError.capturedLocation) setLastLocation(attendanceError.capturedLocation)
      const message =
        attendanceError.message ||
        (error instanceof Error && error.message
          ? error.message
          : 'Attendance action failed')
      toast.error(message)
      const openException =
        Boolean(result?.allow_exception_request) || Boolean(attendanceError.allowExceptionRequest)
      if (openException && canRequestException) {
        setExceptionAction(action)
        setSubmitToken(newIdempotencyKey())
        setActiveRequest(null)
        setExceptionOpen(true)
      } else if (openException && !canRequestException) {
        toast.error(
          eligibility.blocking_reason ||
            'Exception requests are blocked until management activates your profile.',
        )
      }
      setActionToken(newIdempotencyKey())
    } finally {
      setBusyAction(null)
    }
  }

  const shownRequest = activeRequest || existingActive

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time clock</CardTitle>
        <CardDescription>
          Clock in, take breaks, and clock out at the job site. Location is checked for each action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border border-border bg-[#fbfcff] px-3 py-2 text-xs text-muted-foreground">
          Your location is checked only when you record a work or break action. Tamay Enterprises does not
          continuously track your location through this feature.
        </p>

        {!canClock ? (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">Attendance blocked ({eligibility.derived_status})</p>
            <p>
              {eligibility.blocking_reason ||
                'Your worker profile is inactive or not approved. Ask management to activate you before clocking in.'}
            </p>
            {eligibility.required_administrative_action ? (
              <p className="text-muted-foreground">Needed: {eligibility.required_administrative_action}</p>
            ) : null}
          </div>
        ) : null}

        {openRecord ? (
          <div className="space-y-1 rounded-xl border border-border bg-[#fbfcff] px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {workflowStatus === 'on_break' ? 'On break' : 'Working'}
              </Badge>
              {openRecord.geofence_enforced ? <Badge variant="outline">Geofenced</Badge> : null}
            </div>
            <p className="font-display text-2xl font-semibold">
              {format(new Date(openRecord.clock_in_time), 'h:mm a')}
            </p>
            <p className="text-sm text-muted-foreground">
              Project: {openRecord.project?.name || 'Unknown project'}
            </p>
            <p className="text-xs text-muted-foreground">
              Breaks so far: {formatBreakDuration(openRecord.break_seconds)} ·{' '}
              {formatRelative(openRecord.clock_in_time)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Assigned project (required)</Label>
              <Select value={projectId || undefined} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No assigned projects
                    </SelectItem>
                  ) : (
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        {project.location_verification_status !== 'verified'
                          ? ' (location needs verification)'
                          : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {verifiedProjects.length === 0 && projects.length > 0 ? (
              <p className="text-xs text-amber-700">
                Assigned projects need an administrator to verify job-site coordinates before normal
                clock-in. You can still submit an exception request if needed.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">You are currently not working.</p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {actions.map((action) => (
            <Button
              key={action}
              className="min-h-11 w-full sm:w-auto"
              variant={action === 'WORK_ENDED' || action === 'BREAK_STARTED' ? 'outline' : 'default'}
              disabled={
                Boolean(busyAction) ||
                !canClock ||
                (action === 'WORK_STARTED' && !projectId)
              }
              onClick={() => void runAction(action)}
            >
              {busyAction === action ? 'Checking location…' : actionButtonLabel(action)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={!canRequestException}
            onClick={() => {
              if (!canRequestException) {
                toast.error(
                  eligibility.blocking_reason ||
                    'Exception requests are blocked until management activates your profile.',
                )
                return
              }
              setExceptionAction(actions[0] ?? 'WORK_STARTED')
              setSubmitToken(newIdempotencyKey())
              setActiveRequest(null)
              setExceptionOpen(true)
            }}
          >
            Request exception
          </Button>
        </div>

        {lastResult && !lastResult.ok ? (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-medium">Location check needs attention</p>
            <p>{lastResult.rejection_reason}</p>
            {lastResult.distance_meters != null ? (
              <p>Distance: {formatDistance(lastResult.distance_meters)}</p>
            ) : null}
            <p>
              Tips: enable precise location, move near a window or open area, wait briefly, then retry.
            </p>
          </div>
        ) : null}

        {history.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Recent shifts</p>
            {history.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p>{format(new Date(row.clock_in_time), 'MMM d')}</p>
                  <p className="text-xs text-muted-foreground">{row.project?.name || 'No project'}</p>
                </div>
                <div className="text-xs text-muted-foreground sm:text-right">
                  <p>
                    {format(new Date(row.clock_in_time), 'h:mm a')}
                    {row.clock_out_time ? ` – ${format(new Date(row.clock_out_time), 'h:mm a')}` : ' – open'}
                  </p>
                  <p>
                    Paid {formatHoursDuration(row.paid_hours ?? row.total_hours)}
                    {row.break_seconds ? ` · break ${formatBreakDuration(row.break_seconds)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Dialog
          open={exceptionOpen}
          onOpenChange={(open) => {
            setExceptionOpen(open)
            if (!open) {
              setExceptionText('')
              setExceptionPhoto(null)
            }
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Attendance exception request</DialogTitle>
            </DialogHeader>

            {shownRequest ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  You already submitted a request for this attendance issue. Management has not completed
                  its review yet.
                </p>
                <div className="space-y-1 rounded-md border border-border px-3 py-2">
                  <p>
                    <span className="text-muted-foreground">Status:</span> {shownRequest.status}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Submitted:</span>{' '}
                    {format(new Date(shownRequest.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Requested action:</span>{' '}
                    {actionButtonLabel(shownRequest.requested_action)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Project:</span>{' '}
                    {shownRequest.project?.name || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Explanation:</span> {shownRequest.explanation}
                  </p>
                  <p className="text-xs text-muted-foreground">Reference: {shownRequest.id}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setExceptionOpen(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This does not change your timesheet automatically. An administrator must review and
                  approve.
                </p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Action</Label>
                    <Select
                      value={exceptionAction}
                      onValueChange={(v) => setExceptionAction(v as AttendanceActionType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['WORK_STARTED', 'BREAK_STARTED', 'BREAK_ENDED', 'WORK_ENDED'] as const).map(
                          (a) => (
                            <SelectItem key={a} value={a}>
                              {actionButtonLabel(a)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {!openRecord ? (
                    <div className="space-y-1">
                      <Label>Project</Label>
                      <Select value={projectId || undefined} onValueChange={setProjectId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>Explanation</Label>
                    <Textarea
                      value={exceptionText}
                      onChange={(e) => setExceptionText(e.target.value)}
                      placeholder="Describe the legitimate attendance problem…"
                      rows={4}
                    />
                  </div>
                  <FilePickerButton
                    accept={resolvedImageUploadAccept()}
                    label={exceptionPhoto ? 'Change photo' : 'Optional photo'}
                    variant="outline"
                    multiple={false}
                    onFile={(file) => setExceptionPhoto(file)}
                  />
                  <Button
                    className="min-h-11 w-full"
                    disabled={submitException.isPending || !exceptionText.trim() || !activeProjectId}
                    onClick={async () => {
                      if (!activeProjectId) return
                      try {
                        const result = await submitException.mutateAsync({
                          projectId: activeProjectId,
                          action: exceptionAction,
                          explanation: exceptionText,
                          latitude: lastLocation?.latitude ?? null,
                          longitude: lastLocation?.longitude ?? null,
                          accuracyMeters: lastLocation?.accuracyMeters ?? null,
                          distanceMeters: lastResult?.distance_meters ?? null,
                          photo: exceptionPhoto,
                          attendanceRecordId: openRecord?.id ?? null,
                          idempotencyKey: submitToken,
                        })
                        toast.success(
                          result.message ||
                            'Your attendance correction request was submitted successfully. Management will review it.',
                        )
                        setActiveRequest(result.request ?? null)
                        setExceptionText('')
                        setExceptionPhoto(null)
                      } catch (error) {
                        const duplicateResult = (
                          error as Error & {
                            result?: { request?: AttendanceExceptionRequest; message?: string }
                          }
                        ).result
                        if (duplicateResult?.request) {
                          setActiveRequest(duplicateResult.request)
                          toast.error(
                            duplicateResult.message ||
                              'You already submitted a request for this attendance issue. Management has not completed its review yet.',
                          )
                          return
                        }
                        toast.error(error instanceof Error ? error.message : 'Submit failed')
                        setSubmitToken(newIdempotencyKey())
                      }
                    }}
                  >
                    {submitException.isPending ? 'Submitting…' : 'Submit request'}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
