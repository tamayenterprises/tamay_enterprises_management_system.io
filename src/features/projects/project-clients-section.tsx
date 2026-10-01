import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

function primaryChangeMessage(newName: string) {
  return (
    `${newName} will become the Primary Client for this project.\n\n` +
    'The previous Primary Client will remain assigned but will no longer be the primary project contact.'
  )
}

export function ProjectClientsSection({
  projectId,
  clientAssignments,
  availableClients,
  canManage,
}: {
  projectId: string
  /** Active assignments whose profile is a client. */
  clientAssignments: ProjectAssignment[]
  availableClients: Profile[]
  canManage: boolean
}) {
  const assignWorker = useAssignWorker()
  const removeAssignment = useRemoveAssignment()
  const setPrimaryClient = useSetPrimaryClient()
  const [selectedClient, setSelectedClient] = useState('')
  const [makePrimary, setMakePrimary] = useState(false)

  const resolution = useMemo(() => resolvePrimaryClient(clientAssignments), [clientAssignments])
  const primaryId = resolution.status === 'primary' ? resolution.contact?.id ?? null : null
  const currentPrimary = primaryId ? resolution.contact : null
  const hasClients = resolution.clients.length > 0
  const ordered = useMemo(() => {
    const eligibleOrder = new Map(resolution.clients.map((item, index) => [item.id, index]))
    return [...clientAssignments].sort(
      (a, b) => (eligibleOrder.get(a.id) ?? Infinity) - (eligibleOrder.get(b.id) ?? Infinity),
    )
  }, [clientAssignments, resolution.clients])
  const busy = assignWorker.isPending || setPrimaryClient.isPending || removeAssignment.isPending

  async function assignClient() {
    const client = availableClients.find((item) => item.id === selectedClient)
    if (!client) return
    const wantsPrimary = hasClients && makePrimary
    if (wantsPrimary && currentPrimary && !confirmAction(primaryChangeMessage(clientName(client)))) return
    try {
      await assignWorker.mutateAsync({ projectId, profileId: client.id })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed')
      return
    }
    if (wantsPrimary) {
      try {
        await setPrimaryClient.mutateAsync({ projectId, profileId: client.id })
      } catch (error) {
        toast.error(
          `Client assigned, but Primary Client was not changed: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
        setSelectedClient('')
        setMakePrimary(false)
        return
      }
    }
    setSelectedClient('')
    setMakePrimary(false)
    toast.success(
      wantsPrimary || !hasClients ? `${clientName(client)} assigned as Primary Client` : 'Client assigned',
    )
  }

  async function makeAssignmentPrimary(assignment: ProjectAssignment) {
    const name = clientName(assignment.profile)
    if (currentPrimary && !confirmAction(primaryChangeMessage(name))) return
    try {
      await setPrimaryClient.mutateAsync({ projectId, profileId: assignment.profile_id })
      toast.success(`${name} is now the Primary Client`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the Primary Client')
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

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Clients</p>
        <p className="text-xs text-muted-foreground">
          Assigned clients can see this project in the client portal. The Primary Client is the contact
          employees see and call.
        </p>
      </div>

      {canManage && resolution.status === 'needs_selection' ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <p className="font-medium">Primary client not selected</p>
          <p>
            Choose who employees should call. Until then, schedules use the earliest assigned client (
            {clientName(resolution.contact?.profile)}).
          </p>
        </div>
      ) : null}

      {canManage ? (
        <div className="space-y-2">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger>
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {availableClients.length === 0 ? (
                <SelectItem value="none" disabled>
                  No available clients
                </SelectItem>
              ) : (
                availableClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {fullName(client.first_name, client.last_name)}
                    {client.company_name ? ` · ${client.company_name}` : ''}
                    {client.email ? ` (${client.email})` : ''}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {hasClients ? (
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
            disabled={!selectedClient || selectedClient === 'none' || busy}
            onClick={assignClient}
          >
            Assign client
          </Button>
        </div>
      ) : null}

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
      ) : (
        ordered.map((assignment) => {
          const isPrimary = assignment.id === primaryId
          const eligible = isEligibleClientAssignment(assignment)
          const tel = isPrimary && canManage ? phoneHref(assignment.profile?.phone) : null
          const phoneLabel = isPrimary && canManage ? formatPhoneDisplay(assignment.profile?.phone) : null
          return (
            <div
              key={assignment.id}
              className={cn(
                'flex flex-col gap-2 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
                isPrimary ? 'border-accent bg-accent/10' : 'border-border',
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  {isPrimary ? <Star className="h-4 w-4 shrink-0 fill-accent text-accent" aria-hidden /> : null}
                  <span className="truncate">{clientName(assignment.profile)}</span>
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
                      onClick={() => makeAssignmentPrimary(assignment)}
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
    </div>
  )
}
