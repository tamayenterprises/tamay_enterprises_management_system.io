import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PersonRecordsPanel, PersonnelUploadButton } from '@/features/admin/person-records-panel'
import { ProfileAssignmentsPanel } from '@/features/admin/profile-assignments-panel'
import { fetchProfile } from '@/features/data/profile-list'
import { useCompanyProfile, useFilesFromTamay, useSubcontractorReadiness } from '@/features/subcontractors/hooks'
import { ReadinessBadge, RequirementProgress } from '@/features/subcontractors/readiness-badge'
import { RequirementChecklist } from '@/features/subcontractors/requirement-checklist'
import { useSubcontractorWorkOrders, useWorkOrderProjectSummaries } from '@/features/work-orders/hooks'
import { WorkOrderCard } from '@/features/work-orders/work-order-card'
import { formatDate, fullName } from '@/lib/utils'
import { sortWorkOrders } from '@/lib/work-orders'

export function SubcontractorDetailPage() {
  const { profileId = '' } = useParams()
  const person = useQuery({
    queryKey: ['profiles', 'detail', profileId],
    enabled: Boolean(profileId),
    queryFn: () => fetchProfile(profileId),
  })
  const { data: readinessMap } = useSubcontractorReadiness(profileId ? [profileId] : [])
  const { data: company } = useCompanyProfile(profileId)
  const { data: workOrders = [] } = useSubcontractorWorkOrders(profileId ? [profileId] : [])
  const { data: tamayFiles = [] } = useFilesFromTamay(profileId)
  const { data: summaries } = useWorkOrderProjectSummaries(workOrders.map((row) => row.id))

  if (person.isLoading) return <LoadingState label="Loading subcontractor..." />
  if (person.isError || !person.data || person.data.role !== 'subcontractor') {
    return <EmptyState title="Subcontractor not found" description="Go back to the Subcontractors list." />
  }

  const sub = person.data
  const readiness = readinessMap?.get(sub.id) ?? null
  const name = sub.company_name || fullName(sub.first_name, sub.last_name)
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild size="sm" variant="outline">
        <Link to="/subcontractors">← Subcontractors</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">{sub.trade_specialization || 'Trade not set'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sub.archived_at ? (
            <Badge variant="destructive">Removed</Badge>
          ) : (
            <Badge variant={sub.is_active ? 'success' : 'destructive'}>{sub.is_active ? 'Active' : 'Inactive'}</Badge>
          )}
          {readiness ? <ReadinessBadge status={readiness.status} management /> : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium">{fullName(sub.first_name, sub.last_name)}</p>
            <p>{sub.email || '—'}</p>
            <p>{sub.phone || 'No phone on file'}</p>
            <p className="text-muted-foreground">{company?.business_address || 'Business address not set'}</p>
          </div>
          <div className="space-y-2">
            {readiness ? (
              <>
                <RequirementProgress completed={readiness.approved_count} total={readiness.required_count} />
                {readiness.missing_labels.length > 0 ? (
                  <p className="text-destructive">Missing: {readiness.missing_labels.join(', ')}</p>
                ) : null}
                {readiness.attention_labels.length > 0 ? (
                  <p className="text-destructive">Rejected or expired: {readiness.attention_labels.join(', ')}</p>
                ) : null}
                {readiness.pending_labels.length > 0 ? (
                  <p className="text-warning">Waiting for review: {readiness.pending_labels.join(', ')}</p>
                ) : null}
                {readiness.payment_status ? (
                  <p className="text-muted-foreground">Payment information: {readiness.payment_status}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Document status is not available yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>Approve or reject each submission and choose which documents this subcontractor needs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RequirementChecklist profileId={sub.id} mode="management" />
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Uploaded by Tamay for {name}</h3>
              <PersonnelUploadButton profileId={sub.id} personLabel={name} />
            </div>
            {tamayFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files uploaded for this subcontractor. Shared forms are on the Subcontractors page.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {tamayFiles.map((doc) => (
                  <li key={doc.id}>
                    {doc.name} <span className="text-muted-foreground">· {formatDate(doc.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <PersonRecordsPanel profileId={sub.id} personLabel={name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Work Orders</CardTitle>
          <CardDescription>Create work orders from each project&apos;s Work Orders section.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work orders yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sortWorkOrders(workOrders).map((row) => (
                <WorkOrderCard key={row.id} workOrder={row} project={summaries?.get(row.id)} />
              ))}
            </div>
          )}
          <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2">
            <ProfileAssignmentsPanel profileId={sub.id} personLabel={name} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
