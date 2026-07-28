import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  HardHat,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useDashboardData } from '@/features/data/hooks'
import { MyWorkStatusCard, WorkforceStatusPanel } from '@/features/workforce/status-cards'
import {
  formatDate,
  formatRelative,
  fullName,
  projectStatusLabel,
  roleLabel,
} from '@/lib/utils'

export function DashboardPage() {
  const {
    projects,
    certifications,
    notifications,
    pendingApprovals,
    employees,
    subcontractors,
    profile,
    isManagement,
  } = useDashboardData()

  const loading =
    projects.isLoading ||
    certifications.isLoading ||
    notifications.isLoading ||
    (isManagement && (pendingApprovals.isLoading || employees.isLoading || subcontractors.isLoading))

  if (loading) {
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

  const certList = certifications.data ?? []
  const certAlerts = certList.filter((c) => c.status === 'expiring_soon' || c.status === 'expired')
  const recentNotifications = notifications.data ?? []
  const pendingCount = pendingApprovals.data?.length ?? 0
  const employeeCount = employees.data?.length ?? 0
  const subcontractorCount = subcontractors.data?.length ?? 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide">
            Welcome back{profile ? `, ${profile.first_name}` : ''}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isManagement
              ? 'Oversee projects, people, approvals, and certification alerts.'
              : 'Track your assigned work, deadlines, certifications, and company updates.'}
          </p>
          {profile ? (
            <p className="mt-1 text-xs text-muted-foreground">Signed in as {roleLabel(profile.role)}</p>
          ) : null}
        </div>
        {isManagement ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/projects">Manage projects</Link>
            </Button>
            {profile?.role === 'admin' ? (
              <Button asChild variant="outline">
                <Link to="/admin">Review approvals</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Button asChild variant="outline">
            <Link to="/projects">View my projects</Link>
          </Button>
        )}
      </div>

      {profile?.role === 'employee' || profile?.role === 'subcontractor' || profile?.role === 'project_manager' ? (
        <MyWorkStatusCard />
      ) : null}

      {isManagement ? <WorkforceStatusPanel /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isManagement ? (
          <>
            <StatCard label="Active projects" value={activeProjects.length} icon={<Briefcase className="h-4 w-4" />} />
            <StatCard label="Employees" value={employeeCount} icon={<Users className="h-4 w-4" />} to="/employees" />
            <StatCard
              label="Subcontractors"
              value={subcontractorCount}
              icon={<HardHat className="h-4 w-4" />}
              to="/subcontractors"
            />
            {profile?.role === 'admin' ? (
              <StatCard
                label="Pending approvals"
                value={pendingCount}
                icon={<UserPlus className="h-4 w-4" />}
                to="/admin"
              />
            ) : (
              <StatCard
                label="Cert alerts"
                value={certAlerts.length}
                icon={<ShieldAlert className="h-4 w-4" />}
                to="/certifications"
              />
            )}
          </>
        ) : (
          <>
            <StatCard label="Assigned projects" value={projectList.length} icon={<Briefcase className="h-4 w-4" />} />
            <StatCard label="Active projects" value={activeProjects.length} icon={<CalendarClock className="h-4 w-4" />} />
            <StatCard label="Upcoming deadlines" value={upcoming.length} icon={<AlertTriangle className="h-4 w-4" />} />
            <StatCard
              label="Cert alerts"
              value={certAlerts.filter((c) => c.profile_id === profile?.id).length}
              icon={<ShieldAlert className="h-4 w-4" />}
              to="/certifications"
            />
          </>
        )}
      </div>

      {isManagement && profile?.role === 'admin' && pendingCount > 0 ? (
        <Card className="border-accent/40 bg-accent/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xl">Pending registrations</CardTitle>
              <CardDescription>{pendingCount} user{pendingCount === 1 ? '' : 's'} waiting for approval.</CardDescription>
            </div>
            <Button asChild size="sm">
              <Link to="/admin">Open admin</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(pendingApprovals.data ?? []).slice(0, 3).map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{fullName(user.first_name, user.last_name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.email} · {roleLabel(user.role)}
                  </p>
                </div>
                <Badge variant="warning">Pending</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{isManagement ? 'Projects' : 'Assigned projects'}</CardTitle>
              <CardDescription>
                {isManagement ? 'All active company projects.' : 'Projects currently connected to your account.'}
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/projects">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectList.length === 0 ? (
              <EmptyState
                title={isManagement ? 'No projects yet' : 'No assigned projects'}
                description={
                  isManagement
                    ? 'Create a project to start assigning work.'
                    : 'You will see projects here once management assigns you.'
                }
                action={
                  isManagement ? (
                    <Button asChild size="sm">
                      <Link to="/projects">Create project</Link>
                    </Button>
                  ) : undefined
                }
              />
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
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-3 transition hover:bg-muted/60"
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(project.deadline)}</p>
                  </div>
                  <Badge variant="warning">{project.priority}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Certification alerts</CardTitle>
              <CardDescription>
                {isManagement ? 'Expiring or expired credentials across the workforce.' : 'Your credentials that need attention.'}
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/certifications">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const alerts = isManagement
                ? certAlerts
                : certAlerts.filter((c) => c.profile_id === profile?.id)
              if (alerts.length === 0) return <EmptyState title="No certification alerts" />
              return alerts.slice(0, 5).map((cert) => (
                <div key={cert.id} className="rounded-md border border-border px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{cert.name}</p>
                    <Badge variant={cert.status === 'expired' ? 'destructive' : 'warning'}>
                      {cert.status === 'expired' ? 'Expired' : 'Expiring soon'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isManagement && cert.profile
                      ? `${fullName(cert.profile.first_name, cert.profile.last_name)} · `
                      : ''}
                    expires {formatDate(cert.expiration_date)}
                  </p>
                </div>
              ))
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest notifications for your account.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/notifications">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentNotifications.length === 0 ? (
              <EmptyState title="No recent notifications" />
            ) : (
              recentNotifications.map((item) => (
                <Link
                  key={item.id}
                  to={item.link || '/notifications'}
                  className="block rounded-md border border-border px-3 py-3 transition hover:bg-muted/60"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.message} · {formatRelative(item.created_at)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  to,
}: {
  label: string
  value: number
  icon: React.ReactNode
  to?: string
}) {
  const content = (
    <CardContent className="flex items-center justify-between p-5">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      </div>
      <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
    </CardContent>
  )

  if (to) {
    return (
      <Link to={to} className="block transition hover:opacity-90">
        <Card>{content}</Card>
      </Link>
    )
  }

  return <Card>{content}</Card>
}
