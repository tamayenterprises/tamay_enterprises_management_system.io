import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Bell,
  Briefcase,
  Clock3,
  FileText,
  HardHat,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  ShieldCheck,
  Users,
  UserCog,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarProfileAvatar } from '@/features/profile/avatar'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { cn, isManagementRole } from '@/lib/utils'
import { useUnreadNotifications } from '@/features/notifications/hooks'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Briefcase },
  { to: '/updates', label: 'Updates', icon: MessageSquareText },
  { to: '/employees', label: 'Employees', icon: Users, management: true },
  { to: '/subcontractors', label: 'Subcontractors', icon: HardHat, management: true },
  { to: '/timesheets', label: 'Timesheets', icon: Clock3, management: true },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/certifications', label: 'Certifications', icon: ShieldCheck },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin', label: 'Admin', icon: UserCog, admin: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: unread = 0 } = useUnreadNotifications()

  const closeMenu = () => setOpen(false)

  const handleSignOut = async () => {
    closeMenu()
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  const visibleNav = navItems.filter((item) => {
    if (item.admin) return profile?.role === 'admin'
    if (item.management) return isManagementRole(profile?.role)
    return true
  })

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    closeMenu()
  }

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop()) return

    const { style } = document.body
    const previousOverflow = style.overflow
    const previousPosition = style.position
    const previousTop = style.top
    const previousWidth = style.width
    const scrollY = window.scrollY

    style.overflow = 'hidden'
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'

    const onResize = () => {
      if (isDesktop()) {
        style.overflow = previousOverflow
        style.position = previousPosition
        style.top = previousTop
        style.width = previousWidth
        window.scrollTo(0, scrollY)
        setOpen(false)
      }
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      style.overflow = previousOverflow
      style.position = previousPosition
      style.top = previousTop
      style.width = previousWidth
      window.scrollTo(0, scrollY)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="min-h-screen lg:flex">
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          // Full viewport height on mobile + desktop; sticky so long pages never stretch empty navy.
          'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[240px] shrink-0 flex-col border-r border-white/10 bg-sidebar text-sidebar-foreground transition-transform duration-300',
          'overflow-hidden overscroll-contain shadow-lg lg:sticky lg:top-0 lg:shadow-none lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="shrink-0 border-b border-white/10 px-3 py-2.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white p-1.5 shadow-[0_0_0_2px_rgba(255,255,255,0.2)]">
            <img
              src="/tamay-logo.png"
              alt="Tamay Enterprises"
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <p className="mt-1 text-center text-[11px] leading-tight text-sidebar-muted">
            Workforce & field operations
          </p>
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col justify-evenly overflow-y-auto overscroll-contain px-1.5 py-1"
          aria-label="Application sections"
        >
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/80 transition duration-150 hover:bg-white/10 hover:text-white',
                  isActive && 'bg-white/15 text-white shadow-[inset_3px_0_0_0_var(--color-accent)]',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 font-medium leading-none">{item.label}</span>
              {item.to === '/notifications' && unread > 0 ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-foreground">
                  {unread}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-2">
          <SidebarProfileAvatar />
          <Button
            variant="secondary"
            size="sm"
            className="min-h-8 w-full justify-start gap-2 border-0 bg-white/10 text-white hover:bg-white/20"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-[#092e4c]/45 backdrop-blur-[2px] lg:hidden"
          onClick={closeMenu}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 lg:hidden"
              aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <form onSubmit={onSearch} className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees, projects, documents..."
                className="h-9 border-border bg-[#fbfcff] pl-9"
              />
            </form>
            <NotificationBell />
            <Button variant="outline" size="sm" className="h-9" onClick={() => navigate('/change-password')}>
              Password
            </Button>
          </div>
        </header>
        <main className="animate-fade-in px-3 py-3 sm:px-4 sm:py-4 lg:px-5">{children}</main>
      </div>
    </div>
  )
}
