import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useProjects } from '@/features/data/hooks'
import { formatRelative, projectStatusLabel } from '@/lib/utils'

export function ClientProjectsPage() {
  const { data: projects = [], isLoading, isError } = useProjects({ assignedOnly: true })

  if (isLoading) return <LoadingState label="Loading projects..." />
  if (isError) return <EmptyState title="Unable to load projects" />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">My projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Projects Tamay Enterprises has set up for you. Open one to share files, photos, and replies.
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Submit a project request first. After Tamay approves it, your project will show here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} to={`/portal/projects/${project.id}`}>
              <Card className="h-full transition hover:border-primary/40">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant="outline">{projectStatusLabel(project.status)}</Badge>
                  </div>
                  <CardDescription>{project.location || 'No location listed'}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Updated {formatRelative(project.updated_at)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
