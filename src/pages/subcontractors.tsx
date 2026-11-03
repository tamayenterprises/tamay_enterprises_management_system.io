import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CompactAccordion } from '@/components/ui/compact-accordion'
import {
  usePendingRequirementReviews,
  useSubcontractorReadiness,
  useSubcontractorWorkOrders,
} from '@/features/subcontractors/hooks'
import { ReadinessBadge } from '@/features/subcontractors/readiness-badge'
import { SharedResourcesManager } from '@/features/subcontractors/tamay-resources'
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
import { PersonRecordsPanel, PersonnelUploadButton } from '@/features/admin/person-records-panel'
import { ProfileAssignmentsPanel } from '@/features/admin/profile-assignments-panel'
import { useAdminSetUserAccess, useProfiles, useUpdateProfile } from '@/features/data/hooks'
import { useAuth } from '@/features/auth/auth-hooks'
import { ProfileAvatar } from '@/features/profile/avatar'
import { canManageProfileField } from '@/lib/profile-fields'
import { formatDate, fullName } from '@/lib/utils'
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
import type { Profile, SubcontractorReadiness } from '@/types/database'

export function SubcontractorsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PersonDirectoryFilter>('active')
  const { data, isLoading, isError } = useProfiles({
    role: 'subcontractor',
    search,
    includeArchived: true,
  })
  const updateProfile = useUpdateProfile()
  const setAccess = useAdminSetUserAccess()

  const subcontractors = useMemo(() => {
    const rows = data ?? []
    return rows.filter((row) => matchesPersonDirectoryFilter(row, statusFilter))
  }, [data, statusFilter])
  const list = useListPreview(subcontractors, `${search}:${statusFilter}`)
  const allIds = useMemo(() => (data ?? []).map((row) => row.id), [data])
  const { data: readiness } = useSubcontractorReadiness(allIds)
  const { data: workOrders = [] } = useSubcontractorWorkOrders(allIds)
  const activeWorkOrders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of workOrders) {
      if (row.work_status === 'completed') continue
      counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1)
    }
    return counts
  }, [workOrders])
  const namesById = useMemo(
    () => new Map((data ?? []).map((row) => [row.id, row.company_name || fullName(row.first_name, row.last_name)])),
    [data],
  )

  if (isLoading && !data) return <LoadingState />
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
            Review documents, see who is Ready to Work, and track their Work Orders.
          </p>
        </div>
        <Input
          placeholder="Search subcontractors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-w-0 sm:w-72"
        />
      </div>

      {readiness ? (
        <>
          <PendingReviewsPanel namesById={namesById} />
          <CompactAccordion
            title="Subcontractor Resources"
            summary="Forms and guides every subcontractor sees under Uploaded by Tamay (blank W-9, agreement, safety rules)."
          >
            <SharedResourcesManager />
          </CompactAccordion>
        </>
      ) : null}

      <PersonDirectoryFilters value={statusFilter} onChange={setStatusFilter} />

      {subcontractors.length === 0 ? (
        <EmptyState title={personDirectoryEmptyTitle('subcontractors', statusFilter)} />
      ) : (
        <div className="space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          {list.visible.map((person) => (
            <SubcontractorCard
              key={person.id}
              person={person}
              readiness={readiness?.get(person.id) ?? null}
              activeWorkOrders={activeWorkOrders.get(person.id) ?? 0}
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
                if (person.archived_at) {
                  if (!confirmAction(`Restore ${name}? They stay unassigned until you assign projects again.`)) {
                    return
                  }
                  try {
                    const result = await setAccess.mutateAsync({ id: person.id, archived: false })
                    if (result.loginWarning) toast.message(result.loginWarning)
                    else toast.success('Subcontractor restored')
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
        <SeeMoreButton shown={list.shown} total={list.total} step={LIST_PREVIEW} onMore={list.showMore} />
        </div>
      )}
    </div>
  )
}

function PendingReviewsPanel({ namesById }: { namesById: Map<string, string> }) {
  const { data: pending = [] } = usePendingRequirementReviews()
  if (pending.length === 0) return null
  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Waiting for review ({pending.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {pending.slice(0, 8).map((doc) => (
            <li key={doc.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">{namesById.get(doc.owner_id ?? '') ?? 'Subcontractor'}</span> ·{' '}
                {doc.name.split(' - ')[0]} · Submitted {formatDate(doc.created_at)}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to={`/subcontractors/${doc.owner_id}`}>Review</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function SubcontractorCard({
  person,
  readiness,
  activeWorkOrders,
  onSave,
  onToggleActive,
  onArchive,
}: {
  person: Profile
  readiness: SubcontractorReadiness | null
  activeWorkOrders: number
  onSave: (values: ProfileFormValues) => Promise<void>
  onToggleActive: () => Promise<void>
  onArchive: () => Promise<void>
}) {
  const { profile: viewer } = useAuth()
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
            <p className="truncate text-sm text-muted-foreground">
              {fullName(person.first_name, person.last_name)} · {person.email}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {person.archived_at ? (
            <Badge variant="destructive">Removed</Badge>
          ) : (
            <Badge variant={person.is_active ? 'success' : 'destructive'}>
              {person.is_active ? 'Active' : 'Inactive'}
            </Badge>
          )}
          {readiness ? <ReadinessBadge status={readiness.status} management /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Trade: {person.trade_specialization || '—'}</p>
        <p>Phone: {person.phone || '—'}</p>
        {readiness ? (
          <>
            <p>
              Documents: {readiness.approved_count}/{readiness.required_count} approved
            </p>
            {readiness.missing_labels.length + readiness.attention_labels.length > 0 ? (
              <p className="text-destructive">
                Missing: {[...readiness.attention_labels, ...readiness.missing_labels].join(', ')}
              </p>
            ) : null}
            {readiness.pending_labels.length > 0 ? (
              <p className="text-warning">Waiting for review: {readiness.pending_labels.join(', ')}</p>
            ) : null}
            <p>
              Work Orders: {activeWorkOrders} active
            </p>
          </>
        ) : null}
        {canManageProfileField(viewer?.role, 'internal_notes') && person.internal_notes ? (
          <p>Notes: {person.internal_notes}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          {readiness ? (
            <Button asChild size="sm" variant={readiness.status === 'ready' ? 'outline' : 'default'}>
              <Link to={`/subcontractors/${person.id}`}>{readiness.status === 'ready' ? 'View' : 'Review'}</Link>
            </Button>
          ) : null}
          <PersonnelUploadButton
            profileId={person.id}
            personLabel={person.company_name || fullName(person.first_name, person.last_name)}
          />
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Edit</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit subcontractor</DialogTitle>
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
          {person.archived_at ? null : (
            <Button size="sm" variant="outline" onClick={onToggleActive}>
              {person.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          )}
          <Button size="sm" variant={person.archived_at ? 'outline' : 'destructive'} onClick={onArchive}>
            {person.archived_at ? 'Restore' : 'Remove'}
          </Button>
        </div>
        {readiness ? null : (
          <>
            <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2">
              <ProfileAssignmentsPanel
                profileId={person.id}
                personLabel={person.company_name || fullName(person.first_name, person.last_name)}
              />
            </div>
            <PersonRecordsPanel
              profileId={person.id}
              personLabel={person.company_name || fullName(person.first_name, person.last_name)}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
