import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useNotifications } from '@/features/notifications/hooks'
import { formatRelative } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { Link } from 'react-router-dom'

export function NotificationsPage() {
  const { data, isLoading, isError } = useNotifications()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load notifications" />

  const notifications = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Assignments, approvals, document updates, and cert alerts.</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            if (!profile) return
            const { error } = await supabase
              .from('notifications')
              .update({ is_read: true })
              .eq('recipient_id', profile.id)
              .eq('is_read', false)
            if (error) toast.error(error.message)
            else {
              toast.success('All marked as read')
              queryClient.invalidateQueries({ queryKey: ['notifications'] })
            }
          }}
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <Card key={item.id} className={item.is_read ? 'opacity-80' : ''}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <Badge variant={item.is_read ? 'secondary' : 'accent'}>{item.is_read ? 'Read' : 'Unread'}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{item.message}</p>
                <p className="text-xs text-muted-foreground">{formatRelative(item.created_at)}</p>
                <div className="flex gap-2">
                  {item.link ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={item.link}>Open</Link>
                    </Button>
                  ) : null}
                  {!item.is_read ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('notifications')
                          .update({ is_read: true })
                          .eq('id', item.id)
                        if (error) toast.error(error.message)
                        else queryClient.invalidateQueries({ queryKey: ['notifications'] })
                      }}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
