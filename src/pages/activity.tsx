import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-hooks'
import { useProjects } from '@/features/data/hooks'
import { useProjectActivityFeed, relevanceLabel } from '@/features/notifications/hooks'
import { isManagementRole } from '@/lib/utils'
import type { ProjectActivityType } from '@/types/database'

const ATTENDANCE_TYPES: ProjectActivityType[] = [
  'ATTENDANCE_EXCEPTION_SUBMITTED',
  'ATTENDANCE_REJECTED',
  'ATTENDANCE_CORRECTED',
  'ATTENDANCE_STARTED',
  'ATTENDANCE_ENDED',
  'BREAK_STARTED',
  'BREAK_ENDED',
]

const PROJECT_CHANGE_TYPES: ProjectActivityType[] = [
  'USER_ASSIGNED_TO_PROJECT',
  'USER_REMOVED_FROM_PROJECT',
  'PROJECT_STATUS_CHANGED',
]

const FILTERS: {
  value: string
  label: string
  type?: ProjectActivityType | 'all'
  attention?: boolean
  group?: 'attendance' | 'project_changes'
}[] = [
  { value: 'all', label: 'All Activity', type: 'all' },
  { value: 'attention', label: 'Requires Attention', attention: true },
  { value: 'company', label: 'Company Updates', type: 'COMPANY_UPDATE_CREATED' },
  { value: 'comments', label: 'Comments', type: 'COMMENT_CREATED' },
  { value: 'replies', label: 'Replies', type: 'COMMENT_REPLIED' },
  { value: 'mentions', label: 'Mentions', type: 'USER_MENTIONED' },
  { value: 'photos', label: 'Photos', type: 'PHOTO_UPLOADED' },
  { value: 'files', label: 'Files', type: 'FILE_UPLOADED' },
  { value: 'attendance', label: 'Attendance', group: 'attendance' },
  { value: 'assignments', label: 'Project Changes', group: 'project_changes' },
]

export function RecentActivityPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canManage = isManagementRole(profile?.role)
  const [filter, setFilter] = useState('all')
  const [projectId, setProjectId] = useState<string>('all')
  const { data: projects = [] } = useProjects({ assignedOnly: !canManage })

  const active = FILTERS.find((f) => f.value === filter) ?? FILTERS[0]
  const { data = [], isLoading, isError, refetch } = useProjectActivityFeed({
    activityType: active.type && active.type !== 'all' ? active.type : undefined,
    activityTypes:
      active.group === 'attendance'
        ? ATTENDANCE_TYPES
        : active.group === 'project_changes'
          ? PROJECT_CHANGE_TYPES
          : undefined,
    requiresAttention: active.attention,
    projectId: projectId === 'all' ? undefined : projectId,
    limit: 50,
  })

  const visible = data

  if (!canManage && profile?.role !== 'employee' && profile?.role !== 'subcontractor') {
    return <EmptyState title="Activity feed unavailable" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Recent activity</h1>
          <p className="text-muted-foreground">
            {canManage
              ? 'See comments, replies, photos, and alerts across projects you can access.'
              : 'Activity from projects assigned to you.'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/notifications">Open notifications</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Focus on the activity that matters right now.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Activity type" />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{canManage ? 'All projects' : 'My projects'}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <LoadingState label="Loading activity..." /> : null}
          {isError ? (
            <EmptyState
              title="We could not load activity"
              description="Please try again."
              action={
                <Button size="sm" onClick={() => void refetch()}>
                  Retry
                </Button>
              }
            />
          ) : null}
          {!isLoading && !isError && visible.length === 0 ? (
            <EmptyState title="No activity matches the selected filters." />
          ) : null}
          {visible.map((item) => {
            const actorName = item.actor
              ? `${item.actor.first_name} ${item.actor.last_name}`.trim()
              : 'Someone'
            const relevance =
              item.requires_attention
                ? 'requires_attention'
                : canManage && !item.project_id
                  ? 'general'
                  : 'assigned_project'
            return (
              <div key={item.id} className="rounded-xl border border-border px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.preview_text}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{item.activity_type.replaceAll('_', ' ')}</Badge>
                      <Badge variant="outline">{relevanceLabel(relevance)}</Badge>
                      {item.project?.name ? <Badge variant="outline">{item.project.name}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {actorName} · {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!item.destination_route) {
                        toast.message('This activity is no longer available.')
                        return
                      }
                      navigate(item.destination_route)
                    }}
                  >
                    View activity
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
