import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCurrentWorkforceStatuses,
  useMyCurrentStatus,
  useUpdateWorkerStatus,
} from '@/features/workforce/hooks'
import { useProjects } from '@/features/data/hooks'
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

export function MyWorkStatusCard() {
  const { data: current, isLoading, isError } = useMyCurrentStatus()
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const updateStatus = useUpdateWorkerStatus()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<WorkforceStatus>('active')
  const [projectId, setProjectId] = useState<string>('none')

  if (isLoading) return <LoadingState label="Loading work status..." />
  if (isError) return <EmptyState title="Unable to load work status" />

  const activeStatus = current?.status ?? 'inactive'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Work status</CardTitle>
          <CardDescription>Keep management updated on where you are.</CardDescription>
        </div>
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
            <Button size="sm">Update status</Button>
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
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [selected, setSelected] = useState<CurrentWorkerStatus | null>(null)
  const { data: projects = [] } = useProjects()
  const { data = [], isLoading, isError } = useCurrentWorkforceStatuses(
    projectFilter === 'all' ? undefined : projectFilter,
  )

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
            <CardDescription>Live availability across employees and subcontractors.</CardDescription>
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-52">
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
          data.map((worker) => (
            <button
              key={worker.user_id}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left transition hover:bg-muted/50"
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
                  <p className="font-medium">{fullName(worker.first_name, worker.last_name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(worker.role)}
                    {worker.project_name ? ` · ${worker.project_name}` : ''}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                {workforceStatusEmoji(worker.status)} {workforceStatusLabel(worker.status)}
              </Badge>
            </button>
          ))
        )}
      </CardContent>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Worker status</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-2 text-sm">
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
              <p>Project: {selected.project_name || '—'}</p>
              <p>Last update: {format(new Date(selected.updated_at), 'MMM d, yyyy h:mm a')}</p>
              <p className="text-muted-foreground">{formatRelative(selected.updated_at)}</p>
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
