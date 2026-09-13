import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CreditCard,
  FileText,
  FolderOpen,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import {
  ClientHomeActiveProjectCard,
  ClientHomeOtherProjectCard,
} from '@/features/client/home-project-card'
import { ClientProjectSummaryCards } from '@/features/client/project-summary-cards'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  createUpdatePhotoSignedUrl,
  useProjectNotes,
  useProjects,
} from '@/features/data/hooks'
import { useProjectPayments } from '@/features/projects/finance-hooks'
import {
  paymentProgressPercent,
  pickPrimaryClientProject,
} from '@/lib/client-portal-progress'
import { CLIENT_PORTAL_FALLBACK_IMAGE } from '@/lib/project-visuals'
import {
  activeStripePayLink,
  remainingBalance,
  sumValidPayments,
} from '@/lib/project-finance'
import { cn, formatRelative } from '@/lib/utils'
import type { Project, ProjectNote } from '@/types/database'

function ActivityThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    createUpdatePhotoSignedUrl(path)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!url) {
    return <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" />
  }
  return (
    <img
      src={url}
      alt=""
      className="h-12 w-12 shrink-0 rounded-lg object-cover"
      loading="lazy"
    />
  )
}

function HomeWelcome({ firstName }: { firstName?: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70 shadow-brand animate-rise">
      <div className="absolute inset-0">
        <img
          src={CLIENT_PORTAL_FALLBACK_IMAGE}
          alt=""
          className="h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f7fafc] via-[#f7fafc]/92 to-[#0b3c5d]/25" />
      </div>
      <div className="relative flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/70">
            Client portal
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Welcome back{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-foreground/80 sm:text-base">
            Your project is moving forward.
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-primary backdrop-blur sm:flex">
          <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
          Private project experience
        </div>
      </div>
    </section>
  )
}

function QuickActions({
  projectId,
  payLink,
}: {
  projectId: string
  payLink: string | null
}) {
  const actions = [
    {
      label: 'View project',
      to: `/portal/projects/${projectId}`,
      icon: FolderOpen,
      primary: true,
    },
    payLink
      ? {
          label: 'Make payment',
          href: payLink,
          icon: CreditCard,
          primary: false,
        }
      : null,
    {
      label: 'View documents',
      to: '/portal/documents',
      icon: FileText,
      primary: false,
    },
    {
      label: 'Message Tamay',
      to: `/portal/projects/${projectId}#client-ask-question`,
      icon: MessageCircle,
      primary: false,
    },
  ].filter(Boolean) as Array<{
    label: string
    to?: string
    href?: string
    icon: typeof FolderOpen
    primary: boolean
  }>

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04)] sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Quick actions
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {actions.map((action) => {
          const className = cn(
            'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition',
            action.primary
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : action.label === 'Make payment'
                ? 'bg-accent text-accent-foreground hover:brightness-95'
                : 'border border-border bg-white text-primary hover:bg-muted/40',
          )
          const Icon = action.icon
          if (action.href) {
            return (
              <a
                key={action.label}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </a>
            )
          }
          return (
            <Link key={action.label} to={action.to!} className={className}>
              <Icon className="h-4 w-4" />
              {action.label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function RecentActivity({
  projectId,
  notes,
}: {
  projectId: string
  notes: ProjectNote[]
}) {
  const recent = useMemo(() => {
    return [...notes]
      .filter((n) => !n.parent_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
  }, [notes])

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(9,46,76,0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent activity
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-primary">
            Latest from your project
          </h2>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-lg">
          <Link to={`/portal/projects/${projectId}#client-ask-question`}>
            View project updates
          </Link>
        </Button>
      </div>

      {recent.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          When Tamay posts an update, a short preview will appear here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {recent.map((note) => {
            const excerpt = note.content?.trim()
              ? note.content.trim().slice(0, 110) +
                (note.content.trim().length > 110 ? '…' : '')
              : note.photo_path
                ? 'New project photo shared'
                : 'Project update'
            return (
              <li
                key={note.id}
                className="flex gap-3 rounded-xl border border-border/70 bg-[#fbfcff] px-3 py-2.5"
              >
                {note.photo_path ? <ActivityThumb path={note.photo_path} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-foreground">{excerpt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelative(note.created_at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function HomeWithProject({
  primary,
  others,
  firstName,
}: {
  primary: Project
  others: Project[]
  firstName?: string
}) {
  const { data: notes = [] } = useProjectNotes(primary.id)
  const { data: payments = [] } = useProjectPayments(primary.id, { clientSafe: true })

  const totalPaid = useMemo(() => sumValidPayments(payments), [payments])
  const balance = remainingBalance(primary.current_project_total, totalPaid)
  const payLink = activeStripePayLink(payments)
  const payPct = paymentProgressPercent(primary.current_project_total, totalPaid)
  const latestUpdate = useMemo(() => {
    const roots = notes.filter((n) => !n.parent_id)
    if (roots.length === 0) return null
    return [...roots].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]
  }, [notes])

  const attentionLabel = payLink
    ? 'A payment is ready when you are'
    : primary.status === 'waiting'
      ? 'Tamay may be waiting on a decision or material'
      : 'No action needed'

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <HomeWelcome firstName={firstName} />

      <ClientHomeActiveProjectCard
        project={primary}
        paymentPercent={primary.current_project_total != null ? payPct : null}
      />

      <ClientProjectSummaryCards
        project={primary}
        totalPaid={totalPaid}
        remaining={balance}
        latestUpdate={latestUpdate}
        attentionLabel={attentionLabel}
        payLink={payLink}
        askHref={`/portal/projects/${primary.id}#client-ask-question`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <RecentActivity projectId={primary.id} notes={notes} />
        <QuickActions projectId={primary.id} payLink={payLink} />
      </div>

      {others.length > 0 ? (
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Other projects
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-primary">
              More of your work with Tamay
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map((project) => (
              <ClientHomeOtherProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function ClientPortalHomePage() {
  const { profile } = useAuth()
  const { data: projects = [], isLoading, isError } = useProjects({ assignedOnly: true })

  if (isLoading) return <LoadingState label="Loading portal..." />
  if (isError) {
    return (
      <EmptyState
        title="Unable to load your portal"
        description="Please refresh and try again. If this continues, message Tamay."
      />
    )
  }

  const primary = pickPrimaryClientProject(projects)
  const others = primary ? projects.filter((p) => p.id !== primary.id) : []

  if (!primary) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
        <HomeWelcome firstName={profile?.first_name} />
        <section className="rounded-2xl border border-border/80 bg-white p-6 text-center shadow-brand sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight text-primary">
            No active projects yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Once your project is assigned, you will see progress, updates, documents, and payments
            here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild className="rounded-xl">
              <Link to="/portal/requests">Request a project</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/portal/documents">Upload documents</Link>
            </Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <HomeWithProject
      primary={primary}
      others={others}
      firstName={profile?.first_name}
    />
  )
}