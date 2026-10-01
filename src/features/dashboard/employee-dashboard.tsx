import { Link } from 'react-router-dom'
import { Briefcase, MessageSquareText, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-hooks'
import { ClockInOutCard } from '@/features/attendance/clock-card'
import { useProjects } from '@/features/data/hooks'
import { canHaveWorkSchedule } from '@/features/schedule/hooks'
import { MyWorkStatusCard } from '@/features/workforce/status-cards'
import { AttentionCard } from '@/features/dashboard/attention-card'
import { TodayHeroCard } from '@/features/dashboard/today-hero-card'
import { UpNextCard } from '@/features/dashboard/up-next-card'

function QuickLinks() {
  const { data: projects = [] } = useProjects({ assignedOnly: true })
  const links = [
    { to: '/projects', label: 'My Projects', icon: Briefcase, count: projects.length },
    { to: '/updates', label: 'Updates', icon: MessageSquareText },
    { to: '/certifications', label: 'Certifications', icon: ShieldCheck },
  ]
  return (
    <nav aria-label="Quick links" className="grid grid-cols-3 gap-2">
      {links.map(({ to, label, icon: Icon, count }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-2.5 text-center text-xs font-semibold text-primary transition hover:border-accent/70 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-row lg:gap-2.5"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20">
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          </span>
          <span>
            {label}
            {count != null ? <span className="font-medium text-muted-foreground"> ({count})</span> : null}
          </span>
        </Link>
      ))}
    </nav>
  )
}

/**
 * Mobile-first dashboard for employees and subcontractors. Column wrappers use
 * `contents` below lg so `order-*` can interleave both columns into one mobile stack;
 * quick links span both columns at the bottom on desktop.
 */
export function EmployeeDashboard() {
  const { profile } = useAuth()
  const scheduled = canHaveWorkSchedule(profile?.role)

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-wide text-primary">
        Hi{profile?.first_name ? `, ${profile.first_name}` : ''}
      </h1>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {scheduled ? (
            <div className="order-1">
              <TodayHeroCard />
            </div>
          ) : null}
          {scheduled ? (
            <div className="order-3">
              <UpNextCard />
            </div>
          ) : null}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-2">
            <ClockInOutCard compact moreOptions={<MyWorkStatusCard inline />} />
          </div>
          <div className="order-4">
            <AttentionCard />
          </div>
        </div>

        <div className="order-5 lg:col-span-2">
          <QuickLinks />
        </div>
      </div>
    </div>
  )
}
