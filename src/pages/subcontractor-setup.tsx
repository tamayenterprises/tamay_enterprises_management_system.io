import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/features/auth/auth-hooks'
import { useMyReadiness } from '@/features/subcontractors/hooks'
import { ReadinessBadge, RequirementProgress } from '@/features/subcontractors/readiness-badge'
import { RequirementChecklist } from '@/features/subcontractors/requirement-checklist'
import { TamayResourcesList } from '@/features/subcontractors/tamay-resources'

/** Complete Your Setup / Documents & Compliance for the signed-in subcontractor. */
export function SubcontractorSetupPage() {
  const { profile } = useAuth()
  const { readiness, isLoading, installed } = useMyReadiness()

  if (!profile || isLoading) return <LoadingState label="Loading your setup..." />
  if (!installed) {
    return <p className="text-sm text-muted-foreground">Document setup is not available yet. Check back soon.</p>
  }

  const ready = readiness?.status === 'ready'
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">{ready ? 'Documents & Compliance' : 'Complete Your Setup'}</h1>
          {readiness ? <ReadinessBadge status={readiness.status} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {ready
            ? 'You are Ready to Work. Keep your documents current so Tamay can keep sending you work.'
            : 'Before receiving work from Tamay Enterprises, submit the required business and compliance documents.'}
        </p>
        {readiness ? <RequirementProgress completed={readiness.approved_count} total={readiness.required_count} /> : null}
        {ready ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/work-orders">Go to Work Orders</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded by Tamay</CardTitle>
          <CardDescription>Forms and guides from Tamay Enterprises. Download, complete and upload where required.</CardDescription>
        </CardHeader>
        <CardContent>
          <TamayResourcesList profileId={profile.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Required From You</CardTitle>
          <CardDescription>
            Upload each document. Tamay reviews it and you see the result here. Certificates must list Tamay Enterprises
            as the Certificate Holder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequirementChecklist profileId={profile.id} mode="self" />
        </CardContent>
      </Card>
    </div>
  )
}
