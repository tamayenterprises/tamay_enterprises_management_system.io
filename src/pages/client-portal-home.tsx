import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useMyProjectRequests } from '@/features/client/hooks'
import { useProjects } from '@/features/data/hooks'
import { formatRelative, fullName } from '@/lib/utils'

export function ClientPortalHomePage() {
  const { profile } = useAuth()
  const { data: requests = [], isLoading: loadingRequests } = useMyProjectRequests()
  const { data: projects = [], isLoading: loadingProjects } = useProjects({ assignedOnly: true })

  if (loadingRequests || loadingProjects) return <LoadingState label="Loading portal..." />

  const openRequests = requests.filter((r) => r.status === 'pending' || r.status === 'under_review')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Welcome{profile ? `, ${profile.first_name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request work, share documents and space photos, and stay in touch on your Tamay projects.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/portal/requests">Request a project</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/portal/projects">View my projects</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/portal/documents">Upload documents</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open requests</CardTitle>
            <CardDescription>Project requests waiting on Tamay Enterprises.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openRequests.length === 0 ? (
              <EmptyState
                title="No open requests"
                description="Submit a project request when you are ready to start."
              />
            ) : (
              openRequests.slice(0, 5).map((request) => (
                <Link
                  key={request.id}
                  to="/portal/requests"
                  className="block rounded-lg border border-border px-3 py-2 transition hover:bg-muted/40"
                >
                  <p className="font-medium">{request.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.status.replace('_', ' ')} · {formatRelative(request.created_at)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My projects</CardTitle>
            <CardDescription>Active projects Tamay has set up for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="Once Tamay converts an approved request, it will appear here."
              />
            ) : (
              projects.slice(0, 5).map((project) => (
                <Link
                  key={project.id}
                  to={`/portal/projects/${project.id}`}
                  className="block rounded-lg border border-border px-3 py-2 transition hover:bg-muted/40"
                >
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.location || 'No location'} · {formatRelative(project.updated_at)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {profile ? (
        <p className="text-xs text-muted-foreground">
          Signed in as {fullName(profile.first_name, profile.last_name)} · Client
        </p>
      ) : null}
    </div>
  )
}
