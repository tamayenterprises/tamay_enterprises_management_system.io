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
import { ProfileAssignmentsPanel } from '@/features/admin/profile-assignments-panel'
import { useAdminSetUserAccess, useProfiles, useUpdateProfile } from '@/features/data/hooks'
import { ProfileAvatar } from '@/features/profile/avatar'
import { fullName } from '@/lib/utils'
import { confirmAction } from '@/lib/uploads'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema, type ProfileFormValues } from '@/lib/validations'
import type { Profile } from '@/types/database'

export function SubcontractorsPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError } = useProfiles({ role: 'subcontractor', search })
  const updateProfile = useUpdateProfile()
  const setAccess = useAdminSetUserAccess()

  const subcontractors = useMemo(() => data ?? [], [data])

  if (isLoading) return <LoadingState />
  if (isError) {
    return (
      <EmptyState
        title="Unable to load subcontractors"
        description="Check your connection and try again."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Subcontractors</h1>
          <p className="text-sm text-muted-foreground">
            Manage trade partners, remove them when Tamay is done, and unassign projects when they are
            finished or replaced.
          </p>
        </div>
        <Input
          placeholder="Search subcontractors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
      </div>

      {subcontractors.length === 0 ? (
        <EmptyState title="No subcontractors found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {subcontractors.map((person) => (
            <SubcontractorCard
              key={person.id}
              person={person}
              onSave={async (values) => {
                try {
                  await updateProfile.mutateAsync({ id: person.id, values })
                  toast.success('Subcontractor updated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onToggleActive={async () => {
                try {
                  await setAccess.mutateAsync({ id: person.id, isActive: !person.is_active })
                  toast.success(person.is_active ? 'Subcontractor deactivated' : 'Subcontractor activated')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onArchive={async () => {
                const name = person.company_name || fullName(person.first_name, person.last_name)
                if (
                  !confirmAction(
                    `Remove ${name}? They will be archived, deactivated, and unassigned from all projects. You can restore them later.`,
                  )
                ) {
                  return
                }
                try {
                  const result = await setAccess.mutateAsync({ id: person.id, archived: true })
                  toast.success(
                    result.unassignedCount > 0
                      ? `Removed and unassigned from ${result.unassignedCount} project${result.unassignedCount === 1 ? '' : 's'}`
                      : 'Subcontractor removed',
                  )
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Remove failed')
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubcontractorCard({
  person,
  onSave,
  onToggleActive,
  onArchive,
}: {
  person: Profile
  onSave: (values: ProfileFormValues) => Promise<void>
  onToggleActive: () => Promise<void>
  onArchive: () => Promise<void>
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      first_name: person.first_name,
      last_name: person.last_name,
      phone: person.phone,
      company_name: person.company_name,
      trade_specialization: person.trade_specialization,
      insurance_info: person.insurance_info,
      license_info: person.license_info,
      is_active: person.is_active,
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <ProfileAvatar
            firstName={person.first_name}
            lastName={person.last_name}
            avatarUrl={person.avatar_url}
            className="mt-0.5 h-11 w-11"
            fallbackClassName="bg-muted text-sm"
          />
          <div className="min-w-0">
            <CardTitle className="text-xl">{person.company_name || fullName(person.first_name, person.last_name)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {fullName(person.first_name, person.last_name)} · {person.email}
            </p>
          </div>
        </div>
        <Badge variant={person.is_active ? 'success' : 'destructive'}>
          {person.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Trade: {person.trade_specialization || '—'}</p>
        <p>Insurance: {person.insurance_info || '—'}</p>
        <p>License: {person.license_info || '—'}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Edit</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit subcontractor</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={form.handleSubmit(onSave)}>
                <div className="grid grid-cols-2 gap-3">
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
                  <Label>Company</Label>
                  <Input {...form.register('company_name')} />
                </div>
                <div className="space-y-1">
                  <Label>Trade</Label>
                  <Input {...form.register('trade_specialization')} />
                </div>
                <div className="space-y-1">
                  <Label>Insurance</Label>
                  <Textarea {...form.register('insurance_info')} />
                </div>
                <div className="space-y-1">
                  <Label>License info</Label>
                  <Textarea {...form.register('license_info')} />
                </div>
                <Button type="submit">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={onToggleActive}>
            {person.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="destructive" onClick={onArchive}>
            Remove
          </Button>
        </div>
        <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2">
          <ProfileAssignmentsPanel
            profileId={person.id}
            personLabel={person.company_name || fullName(person.first_name, person.last_name)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
