import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotifications,
  relevanceLabel,
} from '@/features/notifications/hooks'
import { cn, isClientRole } from '@/lib/utils'

export function NotificationBell() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const notificationsPath = isClientRole(profile?.role) ? '/portal/notifications' : '/notifications'
  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadNotifications()
  const { data: items = [], isError } = useNotifications({ status: 'all', limit: 8 })
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        aria-label="Notifications"
        className="relative"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-3 right-3 top-14 z-50 flex max-h-[min(28rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-xl border border-border bg-white p-3 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(24rem,calc(100vw-2rem))] sm:max-h-none">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {unread > 0 ? `${unread} unread` : 'You are caught up'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                disabled={unread === 0 || markAll.isPending}
                onClick={async () => {
                  try {
                    await markAll.mutateAsync()
                    toast.success('All notifications marked read')
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Could not update')
                  }
                }}
              >
                Mark all read
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto sm:max-h-80">
              {isError ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  We could not load your notifications. Please try again.
                </p>
              ) : null}
              {!isError && items.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  You have no new notifications.
                </p>
              ) : null}
              {items.map((item) => {
                let destination = item.destination_route || item.link
                if (isClientRole(profile?.role) && destination?.startsWith('/projects/')) {
                  destination = destination.replace('/projects/', '/portal/projects/')
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'w-full rounded-lg border border-border px-3 py-2 text-left transition hover:bg-[#fbfcff]',
                      !item.is_read && 'border-accent/40 bg-accent/5',
                    )}
                    onClick={async () => {
                      try {
                        if (!item.is_read) await markRead.mutateAsync({ id: item.id, isRead: true })
                      } catch {
                        /* still navigate */
                      }
                      setOpen(false)
                      if (destination) navigate(destination)
                      else navigate(notificationsPath)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      {!item.is_read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {item.preview_text || item.message}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {item.relevance ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {relevanceLabel(item.relevance)}
                        </Badge>
                      ) : null}
                      {item.project?.name ? (
                        <span className="text-[10px] text-muted-foreground">{item.project.name}</span>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <Button
              className="mt-3 w-full"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false)
                navigate(notificationsPath)
              }}
            >
              View all notifications
            </Button>
            {!isClientRole(profile?.role) ? (
              <Button
                className="mt-2 w-full"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  navigate('/activity')
                }}
              >
                View recent activity
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
