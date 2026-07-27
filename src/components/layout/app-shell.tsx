import { NavLink, useNavigate } from 'react-router-dom'
import {
  Bell,
  Briefcase,
  FileText,
  HardHat,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Users,
  UserCog,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, fullName, getInitials, isManagementRole, roleLabel } from '@/lib/utils'
import { useUnreadNotifications } from '@/features/notifications/hooks'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Briefcase },
  { to: '/employees', label: 'Employees', icon: Users, management: true },
  { to: '/subcontractors', label: 'Subcontractors', icon: HardHat, management: true },
  { to: '/certifications', label: 'Certifications', icon: ShieldCheck },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin', label: 'Admin', icon: UserCog, admin: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: unread = 0 } = useUnreadNotifications()

  const visibleNav = navItems.filter((item) => {
    if (item.admin) return profile?.role === 'admin'
    if (item.management) return isManagementRole(profile?.role)
    return true
  })

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    setOpen(false)
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[260px] border-r border-border bg-[#16382b] text-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="font-display text-2xl font-semibold tracking-wide">Tamay Enterprises</p>
            <p className="mt-1 text-xs text-white/70">Employee & Subcontractor System</p>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white',
                    isActive && 'bg-white/15 text-white',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.to === '/notifications' && unread > 0 ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <div className="mb-3 flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-white/20 text-white">
                  {profile ? getInitials(profile.first_name, profile.last_name) : 'TE'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {profile ? fullName(profile.first_name, profile.last_name) : 'User'}
                </p>
                <p className="truncate text-xs text-white/60">
                  {profile ? roleLabel(profile.role) : ''}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full justify-start gap-2 bg-white/10 text-white hover:bg-white/20"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-[#fffcf7]/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <form onSubmit={onSearch} className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees, projects, documents..."
                className="pl-9"
              />
            </form>
            <Button variant="outline" size="icon" onClick={() => navigate('/notifications')}>
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
