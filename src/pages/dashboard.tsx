import { Link } from 'react-router-dom'
import { AlertTriangle, Briefcase, CalendarClock, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useDashboardData } from '@/features/data/hooks'
import { formatDate, formatRelative, fullName, projectStatusLabel } from '@/lib/utils'

export function DashboardPage() {
  const { projects, certifications, notifications, profile } = useDashboardData()

  if (projects.isLoading || certifications.isLoading || notifications.isLoading) {
    return <LoadingState label="Loading dashboard..." />
  }

  if (projects.isError) {
    return (
      <EmptyState
        title="Unable to load dashboard"
        description="Check your connection and Supabase configuration, then try again."
      />
    )
  }

  const projectList = projects.data ?? []
  const activeProjects = projectList.filter((p) => p.status === 'in_progress' || p.status === 'waiting')
  const upcoming = [...projectList]
    .filter((p) => p.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5)
  const certAlerts = certifications.data ?? []
  const recentNotifications = notifications.data ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-wide">
          Welcome back{profile ? `, ${profile.first_name}` : ''}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Track assigned work, deadlines, certifications, and company updates in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned projects" value={projectList.length} icon={<Briefcase className="h-4 w-4" />} />
        <StatCard label="Active projects" value={activeProjects.length} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Upcoming deadlines" value={upcoming.length} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Cert alerts" value={certAlerts.length} icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assigned projects</CardTitle>
            <CardDescription>Projects currently connected to your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectList.length === 0 ? (
              <EmptyState title="No assigned projects" description="You will see projects here once management assigns you." />
            ) : (
              projectList.slice(0, 6).map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-3 transition hover:bg-muted/60"
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.location || 'No location set'}</p>
                  </div>
                  <Badge variant="secondary">{projectStatusLabel(project.status)}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming deadlines</CardTitle>
            <CardDescription>Nearest project due dates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming deadlines" />
            ) : (
              upcoming.map((project) => (
                <div key={project.id} className="flex items-center justify-between rounded-md border border-border px-3 py-3">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(project.deadline)}</p>
                  </div>
                  <Badge variant="warning">{project.priority}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certification alerts</CardTitle>
            <CardDescription>Credentials that need attention soon.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {certAlerts.length === 0 ? (
              <EmptyState title="No certification alerts" />
            ) : (
              certAlerts.slice(0, 5).map((cert) => (
                <div key={cert.id} className="rounded-md border border-border px-3 py-3">
                  <p className="font-medium">{cert.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cert.profile ? fullName(cert.profile.first_name, cert.profile.last_name) : 'Worker'} · expires{' '}
                    {formatDate(cert.expiration_date)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest notifications for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentNotifications.length === 0 ? (
              <EmptyState title="No recent notifications" />
            ) : (
              recentNotifications.map((item) => (
                <div key={item.id} className="rounded-md border border-border px-3 py-3">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.message} · {formatRelative(item.created_at)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
      </CardContent>
    </Card>
  )
}
