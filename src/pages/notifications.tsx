import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { useProfiles } from '@/features/data/hooks'
import {
  useCreateNotification,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/hooks'
import { formatRelative, fullName, isManagementRole } from '@/lib/utils'
import type { Notification } from '@/types/database'

export function NotificationsPage() {
  const { profile } = useAuth()
  const canManage = isManagementRole(profile?.role)
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('all')
  const [composeOpen, setComposeOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [recipientMode, setRecipientMode] = useState<'one' | 'all'>('one')
  const [recipientId, setRecipientId] = useState('')

  const { data: allNotifications = [], isLoading, isError } = useNotifications({ status: 'all' })
  const { data: profiles = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager', 'admin'],
  })
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const createNotification = useCreateNotification()

  const counts = useMemo(() => {
    const unread = allNotifications.filter((item) => !item.is_read).length
    return {
      total: allNotifications.length,
      unread,
      read: allNotifications.length - unread,
    }
  }, [allNotifications])

  const notifications = useMemo(() => {
    if (status === 'unread') return allNotifications.filter((item) => !item.is_read)
    if (status === 'read') return allNotifications.filter((item) => item.is_read)
    return allNotifications
  }, [allNotifications, status])

  const recipients = useMemo(
    () =>
      profiles.filter(
        (person) =>
          person.approval_status === 'approved' &&
          person.is_active &&
          !person.archived_at &&
          person.id !== profile?.id,
      ),
    [profiles, profile?.id],
  )

  if (isLoading) return <LoadingState />
  if (isError) return <EmptyState title="Unable to load notifications" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Assignments, approvals, document updates, and company alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={counts.unread === 0 || markAllRead.isPending}
            onClick={async () => {
              try {
                await markAllRead.mutateAsync()
                toast.success('All marked as read')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Update failed')
              }
            }}
          >
            Mark all read
          </Button>
          {canManage ? (
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger asChild>
                <Button>Send notification</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send notification</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Recipients</Label>
                    <Select
                      value={recipientMode}
                      onValueChange={(value) => setRecipientMode(value as 'one' | 'all')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one">One person</SelectItem>
                        <SelectItem value="all">Everyone active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {recipientMode === 'one' ? (
                    <div className="space-y-1">
                      <Label>Worker</Label>
                      <Select value={recipientId} onValueChange={setRecipientId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select recipient" />
                        </SelectTrigger>
                        <SelectContent>
                          {recipients.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {fullName(person.first_name, person.last_name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Message</Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
                  </div>
                  <div className="space-y-1">
                    <Label>Link (optional)</Label>
                    <Input
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="/projects"
                    />
                  </div>
                  <Button
                    disabled={!title.trim() || !message.trim() || createNotification.isPending}
                    onClick={async () => {
                      try {
                        const recipientIds =
                          recipientMode === 'all'
                            ? recipients.map((person) => person.id)
                            : recipientId
                              ? [recipientId]
                              : []
                        await createNotification.mutateAsync({
                          recipientIds,
                          title: title.trim(),
                          message: message.trim(),
                          link: link.trim() || null,
                        })
                        toast.success(
                          recipientMode === 'all'
                            ? `Sent to ${recipientIds.length} people`
                            : 'Notification sent',
                        )
                        setTitle('')
                        setMessage('')
                        setLink('')
                        setRecipientId('')
                        setComposeOpen(false)
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Send failed')
                      }
                    }}
                  >
                    {createNotification.isPending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total" value={counts.total} />
        <SummaryCard label="Unread" value={counts.unread} tone="accent" />
        <SummaryCard label="Read" value={counts.read} />
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={status === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="Assignment changes, approvals, and company alerts will show up here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onMarkRead={async () => {
                try {
                  await markRead.mutateAsync({ id: item.id, isRead: true })
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onMarkUnread={async () => {
                try {
                  await markRead.mutateAsync({ id: item.id, isRead: false })
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
                }
              }}
              onDelete={async () => {
                try {
                  await deleteNotification.mutateAsync(item.id)
                  toast.success('Notification deleted')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Delete failed')
                }
              }}
              onOpen={async () => {
                if (!item.is_read) {
                  try {
                    await markRead.mutateAsync({ id: item.id, isRead: true })
                  } catch {
                    // Still allow navigation even if mark-read fails.
                  }
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'accent'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 font-display text-3xl font-semibold ${tone === 'accent' ? 'text-accent' : ''}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function NotificationCard({
  item,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onOpen,
}: {
  item: Notification
  onMarkRead: () => Promise<void>
  onMarkUnread: () => Promise<void>
  onDelete: () => Promise<void>
  onOpen: () => Promise<void>
}) {
  return (
    <Card className={item.is_read ? 'opacity-80' : 'border-accent/40'}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{item.title}</CardTitle>
        <Badge variant={item.is_read ? 'secondary' : 'accent'}>{item.is_read ? 'Read' : 'Unread'}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{item.message}</p>
        <p className="text-xs text-muted-foreground">{formatRelative(item.created_at)}</p>
        <div className="flex flex-wrap gap-2">
          {item.link ? (
            <Button asChild size="sm" variant="outline">
              <Link to={item.link} onClick={() => void onOpen()}>
                Open
              </Link>
            </Button>
          ) : null}
          {item.is_read ? (
            <Button size="sm" variant="outline" onClick={onMarkUnread}>
              Mark unread
            </Button>
          ) : (
            <Button size="sm" onClick={onMarkRead}>
              Mark read
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
