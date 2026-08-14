import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProfileAssignmentsPanel } from '@/features/admin/profile-assignments-panel'
import { useAuth } from '@/features/auth/auth-context'
import {
  useActivityLog,
  useAdminSetUserAccess,
  useApproveUser,
  usePendingApprovals,
  useProfiles,
  useRoles,
  useUpdateUserRole,
} from '@/features/data/hooks'
import {
  approvalStatusLabel,
  formatRelative,
  fullName,
  roleLabel,
} from '@/lib/utils'
import { confirmAction } from '@/lib/uploads'
import { ProfileAvatar } from '@/features/profile/avatar'
import type { ApprovalStatus, Profile, UserRole } from '@/types/database'

export function AdminPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [approvalFilter, setApprovalFilter] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)

  const pending = usePendingApprovals()
  const profiles = useProfiles({ includeArchived: true, search: search || undefined })
  const roles = useRoles()
  const activity = useActivityLog(20)
  const approveUser = useApproveUser()
  const updateRole = useUpdateUserRole()
  const setAccess = useAdminSetUserAccess()

  const roleOptions = roles.data ?? []

  const counts = useMemo(() => {
    const users = profiles.data ?? []
    const active = users.filter((u) => u.is_active && !u.archived_at).length
    const archived = users.filter((u) => Boolean(u.archived_at)).length
    const pendingCount = users.filter((u) => u.approval_status === 'pending').length
    const byRole = {
      admin: users.filter((u) => u.role === 'admin' && !u.archived_at).length,
      project_manager: users.filter((u) => u.role === 'project_manager' && !u.archived_at).length,
      employee: users.filter((u) => u.role === 'employee' && !u.archived_at).length,
      subcontractor: users.filter((u) => u.role === 'subcontractor' && !u.archived_at).length,
      client: users.filter((u) => u.role === 'client' && !u.archived_at).length,
    }
    return { active, archived, pending: pendingCount, byRole, total: users.length }
  }, [profiles.data])

  const directory = useMemo(() => {
    return (profiles.data ?? []).filter((user) => {
      if (!showArchived && user.archived_at) return false
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (approvalFilter !== 'all' && user.approval_status !== approvalFilter) return false
      return true
    })
  }, [profiles.data, showArchived, roleFilter, approvalFilter])

  if (pending.isLoading || profiles.isLoading || roles.isLoading) return <LoadingState />
  if (pending.isError || profiles.isError || roles.isError) {
    return <EmptyState title="Unable to load admin panel" />
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Admin panel</h1>
          <p className="text-sm text-muted-foreground">
            Approve registrations, assign roles, remove people when Tamay is done with them, and
            unassign projects when a worker is finished or replaced.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/employees">Employees</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/subcontractors">Subcontractors</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/projects">Projects</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/notifications">Notifications</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pending approvals" value={counts.pending} tone="warning" />
        <SummaryCard label="Active users" value={counts.active} />
        <SummaryCard label="Removed / archived" value={counts.archived} />
        <SummaryCard label="Total profiles" value={counts.total} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Admins" value={counts.byRole.admin} />
        <SummaryCard label="Project managers" value={counts.byRole.project_manager} />
        <SummaryCard label="Employees" value={counts.byRole.employee} />
        <SummaryCard label="Subcontractors" value={counts.byRole.subcontractor} />
        <SummaryCard label="Clients" value={counts.byRole.client} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending registrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(pending.data ?? []).length === 0 ? (
            <EmptyState title="No pending approvals" description="New sign-ups will appear here until you approve or reject them." />
          ) : (
            (pending.data ?? []).map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar
                    firstName={user.first_name}
                    lastName={user.last_name}
                    avatarUrl={user.avatar_url}
                    className="h-10 w-10"
                    fallbackClassName="bg-muted text-sm"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(user.first_name, user.last_name)}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.email} · {roleLabel(user.role)} · {formatRelative(user.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={approveUser.isPending}
                    onClick={async () => {
                      try {
                        await approveUser.mutateAsync({ id: user.id, approve: true })
                        toast.success('User approved')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Approval failed')
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={approveUser.isPending}
                    onClick={async () => {
                      try {
                        await approveUser.mutateAsync({ id: user.id, approve: false })
                        toast.success('User rejected')
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Rejection failed')
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
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>User directory</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter by Clients, Employees, Subcontractors, or Project managers. Remove archives the
              person and unassigns them from all projects (restorable later).
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="w-full sm:w-56"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleOptions.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={approvalFilter} onValueChange={setApprovalFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Approval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showArchived ? 'secondary' : 'outline'}
              size="sm"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? 'Hide removed' : 'Show removed'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {directory.length === 0 ? (
            <EmptyState title="No users match these filters" />
          ) : (
            directory.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === profile?.id}
                roleOptions={roleOptions}
                onRoleChange={async (role) => {
                  try {
                    await updateRole.mutateAsync({ id: user.id, role })
                    toast.success('Role updated')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Role update failed')
                  }
                }}
                onToggleActive={async () => {
                  try {
                    await setAccess.mutateAsync({ id: user.id, isActive: !user.is_active })
                    toast.success(user.is_active ? 'User deactivated' : 'User activated')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Update failed')
                  }
                }}
                onToggleRemove={async () => {
                  const name = fullName(user.first_name, user.last_name)
                  if (user.archived_at) {
                    if (!confirmAction(`Restore ${name}? They stay unassigned until you assign projects again.`)) {
                      return
                    }
                    try {
                      await setAccess.mutateAsync({ id: user.id, archived: false })
                      toast.success('User restored')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Restore failed')
                    }
                    return
                  }
                  if (
                    !confirmAction(
                      `Remove ${name} (${roleLabel(user.role)})? They will be archived, deactivated, and unassigned from all projects. You can restore them later.`,
                    )
                  ) {
                    return
                  }
                  try {
                    const result = await setAccess.mutateAsync({ id: user.id, archived: true })
                    toast.success(
                      result.unassignedCount > 0
                        ? `Removed and unassigned from ${result.unassignedCount} project${result.unassignedCount === 1 ? '' : 's'}`
                        : 'User removed',
                    )
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Remove failed')
                  }
                }}
                onReapprove={async () => {
                  try {
                    await setAccess.mutateAsync({ id: user.id, approvalStatus: 'approved' })
                    toast.success('User re-approved')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Update failed')
                  }
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent admin activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activity.isLoading ? (
            <LoadingState label="Loading activity..." />
          ) : (activity.data ?? []).length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Approvals, role changes, and access updates will appear here."
            />
          ) : (
            (activity.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium">{formatActivityAction(entry.action)}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.actor
                    ? fullName(entry.actor.first_name, entry.actor.last_name)
                    : 'System'}{' '}
                  · {formatRelative(entry.created_at)}
                  {typeof entry.metadata?.role === 'string'
                    ? ` · ${roleLabel(entry.metadata.role as UserRole)}`
                    : ''}
                  {typeof entry.metadata?.email === 'string' ? ` · ${entry.metadata.email}` : ''}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warning'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`mt-1 font-display text-3xl font-semibold ${
            tone === 'warning' ? 'text-warning' : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function UserRow({
  user,
  isSelf,
  roleOptions,
  onRoleChange,
  onToggleActive,
  onToggleRemove,
  onReapprove,
}: {
  user: Profile
  isSelf: boolean
  roleOptions: Array<{ id: UserRole; label: string }>
  onRoleChange: (role: UserRole) => Promise<void>
  onToggleActive: () => Promise<void>
  onToggleRemove: () => Promise<void>
  onReapprove: () => Promise<void>
}) {
  const [showProjects, setShowProjects] = useState(false)
  const personLabel = fullName(user.first_name, user.last_name)

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ProfileAvatar
            firstName={user.first_name}
            lastName={user.last_name}
            avatarUrl={user.avatar_url}
            className="mt-0.5 h-11 w-11"
            fallbackClassName="bg-muted text-sm"
          />
          <div className="min-w-0">
            <p className="font-medium">
              {personLabel}
              {isSelf ? ' (you)' : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              {user.email}
              {user.company_name ? ` · ${user.company_name}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">{roleLabel(user.role)}</Badge>
              <Badge
                variant={
                  user.approval_status === 'approved'
                    ? 'success'
                    : user.approval_status === 'pending'
                      ? 'warning'
                      : 'destructive'
                }
              >
                {approvalStatusLabel(user.approval_status as ApprovalStatus)}
              </Badge>
              <Badge variant={user.is_active ? 'success' : 'destructive'}>
                {user.is_active ? 'Active' : 'Inactive'}
              </Badge>
              {user.archived_at ? <Badge variant="secondary">Removed</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={user.role}
            disabled={isSelf}
            onValueChange={(value) => void onRoleChange(value as UserRole)}
          >
            <SelectTrigger className="h-11 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {user.approval_status === 'rejected' ? (
            <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onReapprove}>
              Re-approve
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={isSelf} onClick={onToggleActive}>
            {user.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => setShowProjects((open) => !open)}
          >
            {showProjects ? 'Hide projects' : 'Projects'}
          </Button>
          <Button size="sm" variant="destructive" className="min-h-11 w-full sm:w-auto" disabled={isSelf} onClick={onToggleRemove}>
            {user.archived_at ? 'Restore' : 'Remove'}
          </Button>
        </div>
      </div>
      {showProjects ? (
        <div className="rounded-md border border-border/80 bg-[#fbfcff] px-3 py-2">
          <ProfileAssignmentsPanel
            profileId={user.id}
            personLabel={personLabel}
            compact
          />
        </div>
      ) : null}
    </div>
  )
}

function formatActivityAction(action: string) {
  const labels: Record<string, string> = {
    approved_user: 'Approved registration',
    rejected_user: 'Rejected registration',
    updated_role: 'Updated user role',
    updated_access: 'Updated user access',
    removed_user: 'Removed user (archived + unassigned)',
  }
  return labels[action] ?? action.replaceAll('_', ' ')
}
