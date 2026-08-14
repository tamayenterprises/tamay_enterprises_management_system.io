import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/hooks'
import { cn, formatRelative } from '@/lib/utils'

export function ClientNotificationsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const { data: all = [], isLoading, isError, refetch } = useNotifications({ status: 'all', limit: 80 })
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const unreadCount = useMemo(() => all.filter((n) => !n.is_read).length, [all])
  const notifications = useMemo(() => {
    if (filter === 'unread') return all.filter((n) => !n.is_read)
    return all
  }, [all, filter])

  if (isLoading) return <LoadingState label="Loading notifications..." />
  if (isError) {
    return (
      <EmptyState
        title="Unable to load notifications"
        action={
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates about your account, project requests, and messages from Tamay.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filter === 'unread' ? 'secondary' : 'outline'}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </Button>
          {unreadCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={markAllRead.isPending}
              onClick={async () => {
                try {
                  await markAllRead.mutateAsync()
                  toast.success('All marked as read')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to update')
                }
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="You’ll be notified when Tamay reviews a request or shares a project update."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((item) => (
            <Card
              key={item.id}
              className={cn(!item.is_read && 'border-accent/40 bg-accent/5')}
            >
              <CardContent className="p-3">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={async () => {
                    try {
                      if (!item.is_read) await markRead.mutateAsync({ id: item.id, isRead: true })
                    } catch {
                      /* still navigate */
                    }
                    const link = item.destination_route || item.link
                    if (link?.startsWith('/')) {
                      // Map staff project links into the portal when possible
                      if (link.startsWith('/projects/')) {
                        navigate(link.replace('/projects/', '/portal/projects/'))
                      } else if (link.startsWith('/portal')) {
                        navigate(link)
                      } else if (link.includes('request') || link.includes('client')) {
                        navigate('/portal/requests')
                      } else {
                        navigate('/portal')
                      }
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {!item.is_read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRelative(item.created_at)}</p>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
