import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useAuth } from '@/features/auth/auth-hooks'
import { useCompanyProfile } from '@/features/subcontractors/hooks'
import { ReadinessBadge, RequirementProgress } from '@/features/subcontractors/readiness-badge'
import { useMyWorkOrders } from '@/features/work-orders/hooks'
import { MyWorkOrderGroups } from '@/features/work-orders/my-work-order-groups'
import { fullName } from '@/lib/utils'
import type { SubcontractorReadiness } from '@/types/database'

/** Dashboard for a subcontractor who has finished setup (Ready to Work or Action Required). */
export function SubcontractorDashboard({ readiness }: { readiness: SubcontractorReadiness }) {
  const { profile } = useAuth()
  const { data: workOrders = [], isLoading } = useMyWorkOrders()
  const { data: company } = useCompanyProfile(profile?.id)
  const ready = readiness.status === 'ready'
  const attention = [...readiness.attention_labels, ...readiness.missing_labels]
  const toAccept = workOrders.filter((row) => row.status === 'assigned').length
  const toStart = workOrders.filter((row) => row.status === 'accepted').length

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">
            {profile?.company_name || fullName(profile?.first_name ?? '', profile?.last_name ?? '')}
          </h1>
          {profile?.trade_specialization ? <p className="text-sm text-muted-foreground">{profile.trade_specialization}</p> : null}
        </div>
        <ReadinessBadge status={readiness.status} />
      </div>

      {attention.length > 0 || toAccept > 0 || (ready && toStart > 0) ? (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {attention.map((label) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-2">
                <span>{label} needs a new upload.</span>
                <Button asChild size="sm">
                  <Link to="/setup">Upload Replacement</Link>
                </Button>
              </div>
            ))}
            {toAccept > 0 ? (
              <p>
                {toAccept} new work order{toAccept === 1 ? '' : 's'} to accept.
              </p>
            ) : null}
            {ready && toStart > 0 ? (
              <p>
                {toStart} work order{toStart === 1 ? '' : 's'} ready to start.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">My Work Orders</h2>
            <Button asChild size="sm" variant="outline">
              <Link to="/work-orders">View all</Link>
            </Button>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading work orders…</p>
          ) : workOrders.length === 0 ? (
            <EmptyState title="No work orders yet" description="New work from Tamay shows up here." />
          ) : (
            <MyWorkOrderGroups workOrders={workOrders} completedLimit={3} />
          )}
        </section>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Documents & Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RequirementProgress completed={readiness.approved_count} total={readiness.required_count} />
              <Button asChild size="sm" variant="outline">
                <Link to="/setup">View documents</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Company Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{profile?.company_name || '—'}</p>
              <p>{fullName(profile?.first_name ?? '', profile?.last_name ?? '')}</p>
              <p className="text-muted-foreground">{profile?.phone || 'No phone on file'}</p>
              <p className="text-muted-foreground">{profile?.email}</p>
              <p className="text-muted-foreground">{profile?.trade_specialization || 'Trade not set'}</p>
              <p className="text-muted-foreground">{company?.business_address || 'Business address not set'}</p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/company-profile">Edit Company Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
