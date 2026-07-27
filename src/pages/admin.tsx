import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApproveUser, usePendingApprovals, useProfiles } from '@/features/data/hooks'
import { formatRelative, fullName, roleLabel } from '@/lib/utils'
import type { UserRole } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'

export function AdminPage() {
  const pending = usePendingApprovals()
  const profiles = useProfiles({ includeArchived: true })
  const approveUser = useApproveUser()

  if (pending.isLoading || profiles.isLoading) return <LoadingState />
  if (pending.isError || profiles.isError) return <EmptyState title="Unable to load admin panel" />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin panel</h1>
        <p className="text-sm text-muted-foreground">
          Approve registrations, assign roles, and manage company-wide access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending registrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(pending.data ?? []).length === 0 ? (
            <EmptyState title="No pending approvals" />
          ) : (
            (pending.data ?? []).map((user) => (
              <div key={user.id} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{fullName(user.first_name, user.last_name)}</p>
                  <p className="text-sm text-muted-foreground">
                    {user.email} · {roleLabel(user.role)} · {formatRelative(user.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
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
        <CardHeader>
          <CardTitle>Role management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(profiles.data ?? []).map((user) => (
            <div key={user.id} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{fullName(user.first_name, user.last_name)}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{user.approval_status}</Badge>
                <Select
                  value={user.role}
                  onValueChange={async (value) => {
                    const { error } = await supabase
                      .from('profiles')
                      .update({ role: value as UserRole })
                      .eq('id', user.id)
                    if (error) toast.error(error.message)
                    else toast.success('Role updated')
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="project_manager">Project Manager</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account security</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/change-password">Change password</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
