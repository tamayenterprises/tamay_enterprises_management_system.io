import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, MapPin, Phone, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useProfiles, useProjects } from '@/features/data/hooks'
import {
  SCHEDULABLE_ROLES,
  useDeleteWorkScheduleEntry,
  useSaveWorkScheduleEntry,
  useScheduleProjectContacts,
  useWorkSchedule,
} from '@/features/schedule/hooks'
import {
  canonicalProjectAddress,
  formatPhoneDisplay,
  formatScheduleTimeRange,
  timesOverlap,
  toTimeInputValue,
} from '@/features/schedule/schedule-links'
import { confirmAction } from '@/lib/uploads'
import { fullName, roleLabel } from '@/lib/utils'
import type { Profile, WorkScheduleEntry } from '@/types/database'

const AUTO_ASSIGN_WARNING = 'This employee will also be assigned to this project.'

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function ScheduleEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: WorkScheduleEntry | null
  defaultDate: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit scheduled work' : 'Schedule work'}</DialogTitle>
          <DialogDescription>
            Address and client contact come from the project. Employees see this in Today&apos;s Work and My
            Schedule.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ScheduleEntryForm
            key={entry?.id ?? `new-${defaultDate}`}
            entry={entry ?? null}
            defaultDate={defaultDate}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function isEligible(person: Pick<Profile, 'approval_status' | 'is_active' | 'archived_at' | 'role'>) {
  return (
    person.approval_status === 'approved' &&
    person.is_active &&
    !person.archived_at &&
    SCHEDULABLE_ROLES.includes(person.role)
  )
}

function ScheduleEntryForm({
  entry,
  defaultDate,
  onDone,
}: {
  entry: WorkScheduleEntry | null
  defaultDate: string
  onDone: () => void
}) {
  const [projectId, setProjectId] = useState(entry?.project_id ?? '')
  const [workDate, setWorkDate] = useState(entry?.work_date ?? defaultDate)
  const [startTime, setStartTime] = useState(toTimeInputValue(entry?.start_time) || '07:00')
  const [endTime, setEndTime] = useState(toTimeInputValue(entry?.end_time))
  const [task, setTask] = useState(entry?.task ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((entry?.assignees ?? []).map((a) => a.profile_id)),
  )
  const [staffSearch, setStaffSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: projects = [], isLoading: projectsLoading } = useProjects({ archived: 'active' })
  const { data: staff = [], isLoading: staffLoading } = useProfiles({ role: SCHEDULABLE_ROLES })
  const { data: contacts, isLoading: contactsLoading } = useScheduleProjectContacts(projectId ? [projectId] : [])
  const { data: dayEntries = [] } = useWorkSchedule(workDate, workDate)
  const save = useSaveWorkScheduleEntry()
  const remove = useDeleteWorkScheduleEntry()

  const projectOptions = useMemo(
    () =>
      projects
        .filter((p) => p.status !== 'completed' || p.id === entry?.project_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, entry?.project_id],
  )
  const selectedProject = projects.find((p) => p.id === projectId) ?? null
  const projectContact = projectId ? contacts?.get(projectId) : undefined

  const staffOptions = useMemo(() => {
    const eligible = staff.filter((person) => isEligible(person) || selected.has(person.id))
    const term = staffSearch.trim().toLowerCase()
    const filtered = term
      ? eligible.filter((person) => fullName(person.first_name, person.last_name).toLowerCase().includes(term))
      : eligible
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 0 : 1
      const bSel = selected.has(b.id) ? 0 : 1
      if (aSel !== bSel) return aSel - bSel
      return fullName(a.first_name, a.last_name).localeCompare(fullName(b.first_name, b.last_name))
    })
  }, [staff, selected, staffSearch])

  const staffById = useMemo(() => new Map(staff.map((person) => [person.id, person])), [staff])

  const willAutoAssign = useMemo(() => {
    if (!projectId || !projectContact) return new Set<string>()
    return new Set([...selected].filter((id) => !projectContact.activeProfileIds.has(id)))
  }, [selected, projectId, projectContact])

  const conflictsByPerson = useMemo(() => {
    const map = new Map<string, WorkScheduleEntry[]>()
    if (!startTime) return map
    const candidate = { start_time: startTime, end_time: endTime || null }
    for (const other of dayEntries) {
      if (other.id === entry?.id) continue
      if (!timesOverlap(other, candidate)) continue
      for (const assignee of other.assignees ?? []) {
        if (!selected.has(assignee.profile_id)) continue
        const list = map.get(assignee.profile_id) ?? []
        list.push(other)
        map.set(assignee.profile_id, list)
      }
    }
    return map
  }, [dayEntries, entry?.id, selected, startTime, endTime])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const nameFor = (id: string) => {
    const person = staffById.get(id)
    return person ? fullName(person.first_name, person.last_name) : 'Employee'
  }

  const handleSave = async () => {
    setFormError(null)
    if (!projectId) return setFormError('Choose a project.')
    if (!workDate) return setFormError('Choose a date.')
    if (!startTime) return setFormError('Choose a start time.')
    if (endTime && endTime <= startTime) return setFormError('End time must be after start time.')
    if (!task.trim()) return setFormError('Enter the task / work plan.')
    if (selected.size === 0) return setFormError('Assign at least one employee.')
    const ineligible = [...selected].filter((id) => {
      const person = staffById.get(id)
      return person ? !isEligible(person) : false
    })
    if (ineligible.length > 0) {
      return setFormError(
        `Remove inactive or unapproved staff before saving: ${ineligible.map(nameFor).join(', ')}.`,
      )
    }

    try {
      const result = await save.mutateAsync({
        entryId: entry?.id ?? null,
        projectId,
        workDate,
        startTime,
        endTime: endTime || null,
        task: task.trim(),
        notes: notes.trim() || null,
        assigneeIds: [...selected],
      })
      toast.success(entry ? 'Schedule updated' : 'Work scheduled')
      if (result.auto_assigned.length > 0) {
        toast.info(
          `Also assigned to ${selectedProject?.name ?? 'the project'}: ${result.auto_assigned.map(nameFor).join(', ')}`,
        )
      }
      if (result.double_booked.length > 0) {
        const names = Array.from(new Set(result.double_booked.map((c) => c.name))).join(', ')
        toast.warning(`Double-booked at overlapping times: ${names}`)
      }
      onDone()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save the schedule.'))
    }
  }

  const handleDelete = async () => {
    if (!entry) return
    if (!confirmAction('Cancel this scheduled work? Scheduled employees will be notified.')) return
    try {
      await remove.mutateAsync(entry.id)
      toast.success('Scheduled work cancelled')
      onDone()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not cancel the schedule.'))
    }
  }

  const address = canonicalProjectAddress(selectedProject)
  const busy = save.isPending || remove.isPending

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="schedule-project">Project</Label>
        <NativeSelect
          id="schedule-project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          disabled={projectsLoading}
        >
          <option value="">{projectsLoading ? 'Loading projects…' : 'Select a project'}</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {selectedProject ? (
        <div className="space-y-1 rounded-lg border border-border bg-[#fbfcff] px-3 py-2 text-sm">
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{address || 'No address on file'}</span>
          </p>
          <p className="flex items-start gap-1.5">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {contactsLoading ? 'Loading client…' : projectContact?.client?.name || 'No client on file'}
            </span>
          </p>
          <p className="flex items-start gap-1.5">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {contactsLoading
                ? '…'
                : formatPhoneDisplay(projectContact?.client?.phone) || 'No phone number on file'}
            </span>
          </p>
          {selectedProject.location_verification_status !== 'verified' ? (
            <p className="text-xs text-amber-700">
              Job-site location is not verified yet. Directions will use the address, and Clock In needs a verified
              location.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            type="date"
            className="h-11"
            value={workDate}
            onChange={(event) => setWorkDate(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="schedule-start">Start time</Label>
          <Input
            id="schedule-start"
            type="time"
            step={300}
            className="h-11"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="schedule-end">End time (optional)</Label>
          <Input
            id="schedule-end"
            type="time"
            step={300}
            className="h-11"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Assign employees</Label>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        </div>
        {staff.length > 8 ? (
          <Input
            placeholder="Search employees"
            value={staffSearch}
            onChange={(event) => setStaffSearch(event.target.value)}
            className="h-10"
          />
        ) : null}
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {staffLoading ? <p className="px-2 py-2 text-sm text-muted-foreground">Loading employees…</p> : null}
          {!staffLoading && staffOptions.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">No eligible employees found.</p>
          ) : null}
          {staffOptions.map((person) => {
            const checked = selected.has(person.id)
            const eligible = isEligible(person)
            const conflicts = conflictsByPerson.get(person.id) ?? []
            return (
              <label
                key={person.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                  checked={checked}
                  onChange={() => toggle(person.id)}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{fullName(person.first_name, person.last_name)}</span>
                  {person.role !== 'employee' ? (
                    <span className="ml-1 text-xs text-muted-foreground">· {roleLabel(person.role)}</span>
                  ) : null}
                  {!eligible ? (
                    <span className="block text-xs text-destructive">Inactive or not approved — remove to save.</span>
                  ) : null}
                  {checked && willAutoAssign.has(person.id) ? (
                    <span className="block text-xs text-amber-700">{AUTO_ASSIGN_WARNING}</span>
                  ) : null}
                  {checked
                    ? conflicts.map((other) => (
                        <span key={other.id} className="block text-xs text-amber-700">
                          Already scheduled {formatScheduleTimeRange(other.start_time, other.end_time)} ·{' '}
                          {other.project?.name ?? 'another project'}
                        </span>
                      ))
                    : null}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="schedule-task">Task / work plan</Label>
        <Textarea
          id="schedule-task"
          rows={3}
          maxLength={500}
          placeholder="Demo cabinets, prep for plumbing"
          value={task}
          onChange={(event) => setTask(event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="schedule-notes">Notes (optional)</Label>
        <Textarea
          id="schedule-notes"
          rows={2}
          maxLength={2000}
          placeholder="Gate code, materials to bring, parking…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {willAutoAssign.size > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{AUTO_ASSIGN_WARNING}</p>
            <p>{[...willAutoAssign].map(nameFor).join(', ')}</p>
          </div>
        </div>
      ) : null}

      {conflictsByPerson.size > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p>
            Double booking: {[...conflictsByPerson.keys()].map(nameFor).join(', ')} already{' '}
            {conflictsByPerson.size === 1 ? 'has' : 'have'} work at an overlapping time. You can still save.
          </p>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {entry ? (
          <Button variant="outline" className="h-11 text-destructive" onClick={handleDelete} disabled={busy}>
            {remove.isPending ? 'Cancelling…' : 'Cancel this work'}
          </Button>
        ) : (
          <span />
        )}
        <Button className="h-11" onClick={handleSave} disabled={busy}>
          {save.isPending ? 'Saving…' : entry ? 'Save changes' : 'Schedule work'}
        </Button>
      </div>
    </div>
  )
}
