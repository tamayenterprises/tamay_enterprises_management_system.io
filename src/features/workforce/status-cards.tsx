import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SeeMoreButton } from '@/components/ui/see-more-button'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  useAdminClockOutWorker,
  useCurrentWorkforceStatuses,
  useMyCurrentStatus,
  useUpdateWorkerStatus,
} from '@/features/workforce/hooks'
import { useProjects, useSetWorkerStatus } from '@/features/data/hooks'
import { accountChangeReason, workforceAdminActions } from '@/features/workforce/admin-actions'
import { LIST_PREVIEW, useListPreview } from '@/lib/list-preview'
import { confirmAction } from '@/lib/uploads'
import {
  WORKFORCE_STATUSES,
  formatRelative,
  fullName,
  roleLabel,
  workforceStatusEmoji,
  workforceStatusLabel,
} from '@/lib/utils'
import { ProfileAvatar } from '@/features/profile/avatar'
import type { CurrentWorkerStatus, WorkforceStatus } from '@/types/database'
import { format } from 'date-fns'

/** `inline` renders a single row (Employee Dashboard "More options") with the same update dialog. */
export function MyWorkStatusCard({ inline = false }: { inline?: boolean } = {}) {
  const { data: current, isLoading, isError } = useMyCurrentStatus()
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const updateStatus = useUpdateWorkerStatus()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<WorkforceStatus>('active')
  const [projectId, setProjectId] = useState<string>('none')

  if (isLoading) {
    return inline ? (
      <p className="text-sm text-muted-foreground">Loading status…</p>
    ) : (
      <LoadingState label="Loading work status..." />
    )
  }
  if (isError) {
    return inline ? (
      <p className="text-sm text-muted-foreground">Unable to load status.</p>
    ) : (
      <EmptyState title="Unable to load work status" />
    )
  }

  const activeStatus = current?.status ?? 'inactive'

  const updateDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setStatus(activeStatus)
          setProjectId(current?.project_id ?? 'none')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={inline ? 'outline' : 'default'} className={inline ? 'h-11' : undefined}>
          Update status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update work status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as WorkforceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFORCE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {workforceStatusEmoji(item)} {workforceStatusLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <Button
            disabled={updateStatus.isPending}
            onClick={async () => {
              try {
                await updateStatus.mutateAsync({
                  status,
                  projectId: projectId === 'none' ? null : projectId,
                })
                toast.success('Status updated')
                setOpen(false)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Update failed')
              }
            }}
          >
            {updateStatus.isPending ? 'Saving…' : 'Save status'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  if (inline) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Status shared with management</p>
          <p className="font-semibold text-primary">
            {workforceStatusLabel(activeStatus)}
            {current?.project?.name ? (
              <span className="text-muted-foreground"> · {current.project.name}</span>
            ) : null}
          </p>
        </div>
        {updateDialog}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Work status</CardTitle>
          <CardDescription>Keep management updated on where you are.</CardDescription>
        </div>
        {updateDialog}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-display text-2xl font-semibold">
          {workforceStatusEmoji(activeStatus)} {workforceStatusLabel(activeStatus)}
        </p>
        <p className="text-sm text-muted-foreground">
          Last updated:{' '}
          {current?.created_at
            ? `${format(new Date(current.created_at), 'h:mm a')} (${formatRelative(current.created_at)})`
            : 'Not set yet'}
        </p>
        {current?.project?.name ? (
          <p className="text-sm text-muted-foreground">Project: {current.project.name}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function WorkforceStatusPanel() {
  const { profile } = useAuth()
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [selected, setSelected] = useState<CurrentWorkerStatus | null>(null)
  const [reason, setReason] = useState('')
  const { data: projects = [] } = useProjects()
  const { data = [], isLoading, isError } = useCurrentWorkforceStatuses(
    projectFilter === 'all' ? undefined : projectFilter,
  )
  const list = useListPreview(data, projectFilter)
  const clockOut = useAdminClockOutWorker()
  const setWorkerStatus = useSetWorkerStatus()
  const selectedActions = selected
    ? workforceAdminActions({
        viewerRole: profile?.role,
        viewerId: profile?.id,
        workerId: selected.user_id,
        isActive: selected.is_active !== false,
      })
    : null
  const busy = clockOut.isPending || setWorkerStatus.isPending

  const counts = useMemo(() => {
    const summary: Record<WorkforceStatus, number> = {
      active: 0,
      on_site: 0,
      traveling_to_site: 0,
      on_break: 0,
      completed_for_day: 0,
      off_site: 0,
      inactive: 0,
    }
    for (const row of data) summary[row.status] += 1
    return summary
  }, [data])

  if (isLoading) return <LoadingState label="Loading workforce status..." />
  if (isError) return <EmptyState title="Unable to load workforce status" />

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Workforce status</CardTitle>
            <CardDescription>
              Live availability across employees and subcontractors. Admins can clock people out,
              deactivate, or remove them from this board.
            </CardDescription>
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full min-w-0 sm:w-52">
              <SelectValue placeholder="Filter by project" />
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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CountPill label="On Site" value={counts.on_site} />
          <CountPill label="Traveling" value={counts.traveling_to_site} />
          <CountPill label="On Break" value={counts.on_break} />
          <CountPill label="Completed" value={counts.completed_for_day} />
          <CountPill label="Active" value={counts.active} />
          <CountPill label="Off Site" value={counts.off_site} />
          <CountPill label="Inactive" value={counts.inactive} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <EmptyState title="No workforce status yet" description="Workers will appear here after their first update." />
        ) : (
          list.visible.map((worker) => (
            <button
              key={worker.user_id}
              type="button"
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-left transition hover:bg-muted/50"
              onClick={() => setSelected(worker)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar
                  firstName={worker.first_name}
                  lastName={worker.last_name}
                  avatarUrl={worker.avatar_url}
                  fallbackClassName="bg-muted text-xs"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{fullName(worker.first_name, worker.last_name)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabel(worker.role)}
                    {worker.project_name ? ` · ${worker.project_name}` : ''}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {workforceStatusEmoji(worker.status)} {workforceStatusLabel(worker.status)}
              </Badge>
            </button>
          ))
        )}
        <SeeMoreButton shown={list.shown} total={list.total} step={LIST_PREVIEW} onMore={list.showMore} />
      </CardContent>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setReason('')
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Worker status</DialogTitle>
          </DialogHeader>
          {selected && selectedActions ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  firstName={selected.first_name}
                  lastName={selected.last_name}
                  avatarUrl={selected.avatar_url}
                  className="h-12 w-12"
                  fallbackClassName="bg-muted"
                />
                <p className="font-medium">{fullName(selected.first_name, selected.last_name)}</p>
              </div>
              <p>Role: {roleLabel(selected.role)}</p>
              <p>
                Status: {workforceStatusEmoji(selected.status)} {workforceStatusLabel(selected.status)}
              </p>
              <p>Account: {selected.is_active === false ? 'Inactive' : 'Active'}</p>
              <p>Project: {selected.project_name || '—'}</p>
              <p>Last update: {format(new Date(selected.updated_at), 'MMM d, yyyy h:mm a')}</p>
              <p className="text-muted-foreground">{formatRelative(selected.updated_at)}</p>

              {selectedActions.canClockOut || selectedActions.canRemove ? (
                <div className="space-y-3 border-t border-border pt-4">
                  {profile?.role === 'admin' ? (
                    <div className="space-y-1">
                      <Label>Reason (optional)</Label>
                      <Textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why is this worker’s status changing? Deactivate and Remove work without this."
                        rows={3}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {selectedActions.canClockOut ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const result = await clockOut.mutateAsync({
                              workerId: selected.user_id,
                              note: reason.trim() || undefined,
                            })
                            toast.success(result.message)
                            setSelected(null)
                            setReason('')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Clock out failed')
                          }
                        }}
                      >
                        Clock out
                      </Button>
                    ) : null}
                    {selectedActions.canDeactivate ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await setWorkerStatus.mutateAsync({
                              workerId: selected.user_id,
                              action: 'deactivate',
                              reason: accountChangeReason(reason, 'Deactivated from Workforce status'),
                            })
                            toast.success('Worker deactivated')
                            setSelected(null)
                            setReason('')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Deactivate failed')
                          }
                        }}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                    {selectedActions.canHireBack ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await setWorkerStatus.mutateAsync({
                              workerId: selected.user_id,
                              action: 'activate',
                              reason: accountChangeReason(reason, 'Activated from Workforce status'),
                            })
                            toast.success('Worker activated')
                            setSelected(null)
                            setReason('')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Activate failed')
                          }
                        }}
                      >
                        Hire back / activate
                      </Button>
                    ) : null}
                    {selectedActions.canRemove ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={async () => {
                          const name = fullName(selected.first_name, selected.last_name)
                          if (
                            !confirmAction(
                              `Remove ${name}? They will be taken off all jobs and will not be able to sign in until an admin restores them.`,
                            )
                          ) {
                            return
                          }
                          try {
                            const result = await setWorkerStatus.mutateAsync({
                              workerId: selected.user_id,
                              action: 'archive',
                              reason: accountChangeReason(reason, 'Removed from Workforce status'),
                            })
                            toast.success(
                              result.unassignedCount > 0
                                ? `Removed and locked login. Unassigned from ${result.unassignedCount} project${result.unassignedCount === 1 ? '' : 's'}.`
                                : 'Removed. Login is locked until an admin restores this person.',
                            )
                            setSelected(null)
                            setReason('')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Remove failed')
                          }
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  {profile?.role === 'admin' ? (
                    <p className="text-xs text-muted-foreground">
                      Remove means they are off duty. They cannot sign in again until you restore
                      them from Employees or Admin.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-[#fbfcff] px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-semibold">{value}</p>
    </div>
  )
}
