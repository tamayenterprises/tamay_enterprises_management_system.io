import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Briefcase,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-hooks'
import { Button } from '@/components/ui/button'
import { ProfileAvatar, SidebarProfileAvatar } from '@/features/profile/avatar'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { cn, fullName } from '@/lib/utils'
import { useUnreadNotifications } from '@/features/notifications/hooks'

const navItems = [
  { to: '/portal', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/portal/requests', label: 'Project requests', icon: ClipboardList },
  { to: '/portal/projects', label: 'My projects', icon: Briefcase },
  { to: '/portal/documents', label: 'Documents', icon: FileText },
  { to: '/portal/notifications', label: 'Notifications', icon: Bell },
]

export function ClientPortalShell({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const { data: unread = 0 } = useUnreadNotifications()

  const closeMenu = () => setOpen(false)
  const clientName = profile
    ? fullName(profile.first_name, profile.last_name)
    : 'Client'

  const handleSignOut = async () => {
    closeMenu()
    setAccountOpen(false)
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  useEffect(() => {
    setOpen(false)
    setAccountOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop()) return

    const { style } = document.body
    const previousOverflow = style.overflow
    const scrollY = window.scrollY
    style.overflow = 'hidden'
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'

    return () => {
      style.overflow = previousOverflow
      style.position = ''
      style.top = ''
      style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  useEffect(() => {
    if (!accountOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [accountOpen])

  return (
    <div className="min-h-screen lg:flex">
      <aside
        id="client-sidebar"
        aria-label="Client portal navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[240px] shrink-0 flex-col border-r border-white/10 bg-sidebar text-sidebar-foreground transition-transform duration-300',
          'overflow-hidden shadow-lg lg:sticky lg:top-0 lg:shadow-none lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
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
            Client portal
          </p>
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col justify-evenly overflow-y-auto px-1.5 py-1"
          aria-label="Client sections"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={closeMenu}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white',
                  isActive && 'bg-white/15 text-white shadow-[inset_3px_0_0_0_var(--color-accent)]',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 font-medium leading-none">{item.label}</span>
              {item.to === '/portal/notifications' && unread > 0 ? (
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
        <header className="sticky top-0 z-20 border-b border-border/70 bg-white/90 backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 lg:hidden"
              aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={open}
              aria-controls="client-sidebar"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <img
                src="/tamay-logo.png"
                alt=""
                className="hidden h-8 w-8 rounded-full object-contain sm:block lg:hidden"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-primary">
                  Client Portal
                </p>
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  Tamay Enterprises
                </p>
              </div>
            </div>

            <NotificationBell />

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                className="flex max-w-[11rem] items-center gap-2 rounded-full border border-border/80 bg-white py-1 pl-1 pr-2 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-none sm:pr-2.5"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((v) => !v)}
              >
                {profile ? (
                  <ProfileAvatar
                    firstName={profile.first_name}
                    lastName={profile.last_name}
                    avatarUrl={profile.avatar_url}
                    className="h-8 w-8"
                    fallbackClassName="bg-primary/10 text-primary text-xs"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    C
                  </span>
                )}
                <span className="hidden min-w-0 truncate text-left text-sm font-medium sm:block">
                  {clientName}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
              </button>

              {accountOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium">{clientName}</p>
                    <p className="text-xs text-muted-foreground">Client account</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => {
                      setAccountOpen(false)
                      navigate('/change-password')
                    }}
                  >
                    Change password
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted/50"
                    onClick={() => void handleSignOut()}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="animate-fade-in px-3 py-3 sm:px-5 sm:py-5 lg:px-6">{children}</main>
      </div>
    </div>
  )
}
