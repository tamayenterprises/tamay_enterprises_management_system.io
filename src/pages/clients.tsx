import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Textarea } from '@/components/ui/textarea'
import { SeeMoreButton } from '@/components/ui/see-more-button'
import { ProfileAssignmentsPanel } from '@/features/admin/profile-assignments-panel'
import { useAdminSetUserAccess, useProfiles, useUpdateProfile } from '@/features/data/hooks'
import { ProfileAvatar } from '@/features/profile/avatar'
import { approvalStatusLabel, fullName, roleLabel } from '@/lib/utils'
import { PersonDirectoryFilters } from '@/components/ui/person-directory-filters'
import { LIST_PREVIEW, useListPreview } from '@/lib/list-preview'
import {
  matchesPersonDirectoryFilter,
  personDirectoryEmptyTitle,
  type PersonDirectoryFilter,
} from '@/lib/person-directory'
import { confirmAction } from '@/lib/uploads'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema, type ProfileFormValues } from '@/lib/validations'
import type { Profile } from '@/types/database'

export function ClientsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PersonDirectoryFilter>('active')
  const { data, isLoading, isError } = useProfiles({ role: 'client', search, includeArchived: true })
  const updateProfile = useUpdateProfile()
  const setAccess = useAdminSetUserAccess()

  const clients = useMemo(() => {
    const rows = data ?? []
    return rows.filter((row) => matchesPersonDirectoryFilter(row, statusFilter))
  }, [data, statusFilter])
  const list = useListPreview(clients, `${search}:${statusFilter}`)

  if (isLoading && !data) return <LoadingState />
  if (isError) {
    return <EmptyState title="Unable to load clients" description="Verify Supabase access and try again." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Homeowners and customer accounts. Assign them to projects so they can use the client portal.
            Only admins see this directory.
          </p>
        </div>
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full min-w-0 sm:w-64"
        />
      </div>

      <PersonDirectoryFilters value={statusFilter} onChange={setStatusFilter} />

      {clients.length === 0 ? (
        <EmptyState
          title={personDirectoryEmptyTitle('clients', statusFilter)}
          description="Approve client registrations or adjust filters."
        />
      ) : (
        <div className="space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          {list.visible.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onSave={async (values) => {
                try {
                  await updateProfile.mutateAsync({ id: client.id, values })
                  toast.success('Client updated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onToggleActive={async () => {
                try {
                  await setAccess.mutateAsync({ id: client.id, isActive: !client.is_active })
                  toast.success(client.is_active ? 'Client deactivated' : 'Client activated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onArchive={async () => {
                const name = fullName(client.first_name, client.last_name) || client.company_name || client.email
                if (client.archived_at) {
                  if (!confirmAction(`Restore ${name}? They stay unassigned until you assign projects again.`)) {
                    return
                  }
                  try {
                    const result = await setAccess.mutateAsync({ id: client.id, archived: false })
                    if (result.loginWarning) toast.message(result.loginWarning)
                    else toast.success('Client restored')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Restore failed')
                  }
                  return
                }
                if (
                  !confirmAction(
                    `Remove ${name}? They will be archived, deactivated, and unassigned from all projects. You can restore them later.`,
                  )
                ) {
                  return
                }
                try {
                  const result = await setAccess.mutateAsync({ id: client.id, archived: true })
                  toast.success(
                    result.unassignedCount > 0
                      ? `Removed and unassigned from ${result.unassignedCount} project${result.unassignedCount === 1 ? '' : 's'}`
                      : 'Client removed',
                  )
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Remove failed')
                }
              }}
            />
          ))}
        </div>
        <SeeMoreButton shown={list.shown} total={list.total} step={LIST_PREVIEW} onMore={list.showMore} />
        </div>
      )}
    </div>
  )
}

function ClientCard({
  client,
  onSave,
  onToggleActive,
  onArchive,
}: {
  client: Profile
  onSave: (values: ProfileFormValues) => Promise<void>
  onToggleActive: () => Promise<void>
  onArchive: () => Promise<void>
}) {
  const displayName = fullName(client.first_name, client.last_name).trim() || client.company_name || client.email
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone,
      company_name: client.company_name,
      internal_notes: client.internal_notes,
      is_active: client.is_active,
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <ProfileAvatar
            firstName={client.first_name}
            lastName={client.last_name}
            avatarUrl={client.avatar_url}
            className="mt-0.5 h-11 w-11"
            fallbackClassName="bg-muted text-sm"
          />
          <div className="min-w-0">
            <CardTitle className="text-xl">{displayName}</CardTitle>
            <p className="truncate text-sm text-muted-foreground">{client.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="secondary">{roleLabel(client.role)}</Badge>
          {client.archived_at ? (
            <Badge variant="destructive">Removed</Badge>
          ) : (
            <Badge variant={client.is_active ? 'success' : 'destructive'}>
              {client.is_active ? 'Active' : 'Inactive'}
            </Badge>
          )}
          {client.approval_status === 'pending' ? <Badge variant="outline">Pending</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Phone: {client.phone || '—'}</p>
        <p>Company: {client.company_name || '—'}</p>
        <p>Approval: {approvalStatusLabel(client.approval_status)}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Edit</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit client</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={form.handleSubmit(onSave)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>First name</Label>
                    <Input {...form.register('first_name')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Last name</Label>
                    <Input {...form.register('last_name')} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input {...form.register('phone')} />
                </div>
                <div className="space-y-1">
                  <Label>Company</Label>
                  <Input {...form.register('company_name')} />
                </div>
                <div className="space-y-1">
                  <Label>Internal notes</Label>
                  <Textarea {...form.register('internal_notes')} />
                </div>
                <Button type="submit">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
          {client.archived_at ? null : (
            <Button size="sm" variant="outline" onClick={onToggleActive}>
              {client.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          )}
          <Button size="sm" variant={client.archived_at ? 'outline' : 'destructive'} onClick={onArchive}>
            {client.archived_at ? 'Restore' : 'Remove'}
          </Button>
        </div>
        <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2">
          <ProfileAssignmentsPanel profileId={client.id} personLabel={displayName} />
        </div>
      </CardContent>
    </Card>
  )
}
