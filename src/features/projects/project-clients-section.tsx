import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { useAssignWorker, useRemoveAssignment, useSetPrimaryClient } from '@/features/data/hooks'
import { formatPhoneDisplay, phoneHref } from '@/features/schedule/schedule-links'
import { isEligibleClientAssignment, resolvePrimaryClient } from '@/lib/primary-client'
import { confirmAction } from '@/lib/uploads'
import { cn, formatRelative, fullName } from '@/lib/utils'
import type { Profile, ProjectAssignment } from '@/types/database'

function clientName(profile?: Pick<Profile, 'first_name' | 'last_name' | 'company_name'> | null) {
  if (!profile) return 'Client'
  return fullName(profile.first_name, profile.last_name).trim() || profile.company_name?.trim() || 'Client'
}

type PendingPrimary = { profileId: string; name: string; assignFirst: boolean }

export function ProjectClientsSection({
  projectId,
  clientAssignments,
  clientOptions,
  canManage,
  assignmentsLoading = false,
  assignmentsError = false,
}: {
  projectId: string
  /** Active assignments whose profile is a client. */
  clientAssignments: ProjectAssignment[]
  /** Approved, active, non-archived client accounts (assigned or not). */
  clientOptions: Profile[]
  canManage: boolean
  assignmentsLoading?: boolean
  assignmentsError?: boolean
}) {
  const assignWorker = useAssignWorker()
  const removeAssignment = useRemoveAssignment()
  const setPrimaryClient = useSetPrimaryClient()
  const [selectedClient, setSelectedClient] = useState('')
  const [makePrimary, setMakePrimary] = useState(false)
  const [pending, setPending] = useState<PendingPrimary | null>(null)

  const resolution = useMemo(() => resolvePrimaryClient(clientAssignments), [clientAssignments])
  const primaryId = resolution.status === 'primary' ? resolution.contact?.id ?? null : null
  const hasClients = resolution.clients.length > 0
  const ordered = useMemo(() => {
    const eligibleOrder = new Map(resolution.clients.map((item, index) => [item.id, index]))
    return [...clientAssignments].sort(
      (a, b) => (eligibleOrder.get(a.id) ?? Infinity) - (eligibleOrder.get(b.id) ?? Infinity),
    )
  }, [clientAssignments, resolution.clients])
  const assignedByProfile = useMemo(
    () => new Map(resolution.clients.map((item) => [item.profile_id, item])),
    [resolution.clients],
  )

  const selected = clientOptions.find((item) => item.id === selectedClient)
  const selectedAssignment = selected ? assignedByProfile.get(selected.id) : undefined
  const selectedIsPrimary = Boolean(selectedAssignment && selectedAssignment.id === primaryId)
  const working = assignWorker.isPending || setPrimaryClient.isPending
  const busy = working || removeAssignment.isPending || assignmentsLoading

  function resetPicker() {
    setSelectedClient('')
    setMakePrimary(false)
  }

  async function assignOnly(client: Profile) {
    try {
      const row = await assignWorker.mutateAsync({ projectId, profileId: client.id })
      resetPicker()
      toast.success(
        row.is_primary_client ? `${clientName(client)} assigned as Primary Client` : `${clientName(client)} assigned`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed')
    }
  }

  function onPickerAction() {
    if (!selected) return
    if (selectedAssignment) {
      if (!selectedIsPrimary) setPending({ profileId: selected.id, name: clientName(selected), assignFirst: false })
      return
    }
    if (hasClients && makePrimary) {
      setPending({ profileId: selected.id, name: clientName(selected), assignFirst: true })
      return
    }
    void assignOnly(selected)
  }

  async function confirmPrimary() {
    if (!pending) return
    const { profileId, name, assignFirst } = pending
    if (assignFirst) {
      try {
        await assignWorker.mutateAsync({ projectId, profileId })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Assignment failed')
        setPending(null)
        return
      }
    }
    try {
      await setPrimaryClient.mutateAsync({ projectId, profileId })
      toast.success(`${name} is now the Primary Client`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      toast.error(
        assignFirst ? `Client assigned, but Primary Client was not changed: ${message}` : `Could not change the Primary Client: ${message}`,
      )
    } finally {
      setPending(null)
      if (assignFirst || selectedClient === profileId) resetPicker()
    }
  }

  async function removeClient(assignment: ProjectAssignment) {
    const name = clientName(assignment.profile)
    if (assignment.id === primaryId) {
      const remaining = resolution.clients.filter((item) => item.id !== assignment.id)
      const next =
        remaining.length === 1
          ? `${clientName(remaining[0].profile)} will become the Primary Client automatically.`
          : remaining.length > 1
            ? 'You will need to choose a new Primary Client.'
            : 'This project will have no client contact.'
      if (!confirmAction(`Remove ${name}, the Primary Client, from this project? ${next}`)) return
    }
    try {
      await removeAssignment.mutateAsync({
        assignmentId: assignment.id,
        projectId,
        profileId: assignment.profile_id,
      })
      toast.success('Client removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed')
    }
  }

  const pickerActionLabel = selectedAssignment
    ? selectedIsPrimary
      ? 'Primary Client'
      : 'Set as Primary Client'
    : 'Assign client'

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Clients</p>
        <p className="text-xs text-muted-foreground">
          Assigned clients can see this project in the client portal. The Primary Client is the contact
          employees see and call.
        </p>
      </div>

      {assignmentsError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          Could not load the clients on this project. Refresh the page before assigning or changing clients.
        </p>
      ) : null}

      {canManage && !assignmentsError && resolution.status === 'needs_selection' ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <p className="font-medium">Primary client not selected</p>
          <p>
            Choose who employees should call. Until then, schedules use the earliest assigned client (
            {clientName(resolution.contact?.profile)}).
          </p>
        </div>
      ) : null}

      {canManage && !assignmentsError ? (
        <div className="space-y-2">
          <NativeSelect
            aria-label="Select a client"
            value={selectedClient}
            onChange={(event) => {
              setSelectedClient(event.target.value)
              setMakePrimary(false)
            }}
            disabled={busy}
          >
            <option value="">{clientOptions.length === 0 ? 'No approved clients' : 'Select a client'}</option>
            {clientOptions.map((client) => {
              const assignment = assignedByProfile.get(client.id)
              const status = assignment ? (assignment.id === primaryId ? ' — Primary Client' : ' — assigned') : ''
              return (
                <option key={client.id} value={client.id}>
                  {clientName(client)}
                  {client.company_name ? ` · ${client.company_name}` : ''}
                  {client.email ? ` (${client.email})` : ''}
                  {status}
                </option>
              )
            })}
          </NativeSelect>
          {selectedAssignment ? (
            <p className="text-xs text-muted-foreground">
              {selectedIsPrimary
                ? 'Already assigned and the Primary Client.'
                : 'Already assigned to this project.'}
            </p>
          ) : hasClients ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={makePrimary}
                onChange={(event) => setMakePrimary(event.target.checked)}
              />
              Set as Primary Client
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">The first client becomes the Primary Client automatically.</p>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={!selected || busy || selectedIsPrimary}
            onClick={onPickerAction}
          >
            {pickerActionLabel}
          </Button>
        </div>
      ) : null}

      {assignmentsError ? null : assignmentsLoading ? (
        <p className="text-sm text-muted-foreground">Loading clients…</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
      ) : (
        ordered.map((assignment) => {
          const isPrimary = assignment.id === primaryId
          const eligible = isEligibleClientAssignment(assignment)
          const name = clientName(assignment.profile)
          const tel = isPrimary && canManage ? phoneHref(assignment.profile?.phone) : null
          const phoneLabel = isPrimary && canManage ? formatPhoneDisplay(assignment.profile?.phone) : null
          return (
            <div
              key={assignment.id}
              data-testid="client-row"
              className={cn(
                'flex flex-col gap-2 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
                isPrimary ? 'border-accent bg-accent/10' : 'border-border',
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  {isPrimary ? <Star className="h-4 w-4 shrink-0 fill-accent text-accent" aria-label="Primary" /> : null}
                  <span className="truncate">{name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {isPrimary ? 'Primary Client' : 'Assigned Client'}
                  {assignment.profile?.company_name ? ` · ${assignment.profile.company_name}` : ''}
                  {assignment.profile?.archived_at ? ' · Archived' : ''} · assigned{' '}
                  {formatRelative(assignment.assigned_at)}
                </p>
                {tel ? (
                  <a href={tel} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                    {phoneLabel}
                  </a>
                ) : phoneLabel ? (
                  <p className="text-xs font-medium">{phoneLabel}</p>
                ) : isPrimary && canManage ? (
                  <p className="text-xs text-muted-foreground">No phone number on file</p>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {!isPrimary && eligible ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={busy}
                      onClick={() => setPending({ profileId: assignment.profile_id, name, assignFirst: false })}
                    >
                      Set as Primary
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={busy}
                    onClick={() => removeClient(assignment)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })
      )}

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !working) setPending(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set {pending?.name} as Primary Client?</DialogTitle>
            <DialogDescription>
              {pending?.name} will become the main client contact for employee schedules and project contact
              information. Other assigned clients will keep their project access.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11" disabled={working} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button className="min-h-11" disabled={working} onClick={() => void confirmPrimary()}>
              {working ? 'Saving…' : 'Set as Primary'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
