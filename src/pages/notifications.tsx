import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  relevanceLabel,
  useCreateNotification,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useReviewNotification,
  useUpdateNotificationPreferences,
} from '@/features/notifications/hooks'
import { formatRelative, fullName, isManagementRole } from '@/lib/utils'
import type { Notification, NotificationPreferences } from '@/types/database'

export function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canManage = isManagementRole(profile?.role)
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('all')
  const [composeOpen, setComposeOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [recipientMode, setRecipientMode] = useState<'one' | 'all'>('one')
  const [recipientId, setRecipientId] = useState('')

  const { data: allNotifications = [], isLoading, isError, refetch } = useNotifications({
    status: 'all',
    limit: 80,
  })
  const { data: profiles = [] } = useProfiles({
    role: ['employee', 'subcontractor', 'project_manager', 'admin'],
  })
  const { data: prefs } = useNotificationPreferences()
  const updatePrefs = useUpdateNotificationPreferences()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const createNotification = useCreateNotification()
  const reviewNotification = useReviewNotification()

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
  if (isError) {
    return (
      <EmptyState
        title="We could not load your notifications. Please try again."
        action={
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Mentions, replies, assigned project activity, and alerts that need your attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/activity">Recent activity</Link>
          </Button>
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

      {prefs ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notification preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['replies_to_my_comments', 'Replies to my comments'],
                ['assigned_project_comments', 'Assigned project comments'],
                ['assigned_project_photos', 'Assigned project photo uploads'],
                ['general_project_activity', 'General project activity'],
                ['attendance_alerts', 'Attendance alerts (role-based)'],
                ['requires_attention_enabled', 'Requires attention'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key])}
                  disabled={updatePrefs.isPending}
                  onChange={async (e) => {
                    try {
                      await updatePrefs.mutateAsync({ [key]: e.target.checked } as Partial<NotificationPreferences>)
                      toast.success('Preferences saved')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not save')
                    }
                  }}
                />
                {label}
              </label>
            ))}
            {canManage ? (
              <div className="space-y-1 sm:col-span-2">
                <Label>Administrator activity scope</Label>
                <Select
                  value={prefs.admin_feed_mode}
                  onValueChange={async (value) => {
                    try {
                      await updatePrefs.mutateAsync({
                        admin_feed_mode: value as NotificationPreferences['admin_feed_mode'],
                      })
                      toast.success('Preferences saved')
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not save')
                    }
                  }}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high_priority">Only high-priority activity</SelectItem>
                    <SelectItem value="assigned_only">Only assigned project activity</SelectItem>
                    <SelectItem value="all">All authorized project activity</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Mentions stay enabled in-app. Email/SMS delivery is not configured yet.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          title={status === 'unread' ? 'You have no new notifications.' : 'You have no new notifications.'}
          description="Mentions, replies, and assigned project updates will appear here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              canReview={canManage && (item.review_status === 'new' || item.relevance === 'requires_attention')}
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
              onReview={async (reviewStatus) => {
                try {
                  await reviewNotification.mutateAsync({ id: item.id, reviewStatus })
                  toast.success(reviewStatus === 'resolved' ? 'Marked resolved' : 'Marked reviewed')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed')
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
                const destination = item.destination_route || item.link
                if (!destination) {
                  toast.message('This activity is no longer available.')
                  return
                }
                navigate(destination)
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
  canReview,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onReview,
  onOpen,
}: {
  item: Notification
  canReview: boolean
  onMarkRead: () => Promise<void>
  onMarkUnread: () => Promise<void>
  onDelete: () => Promise<void>
  onReview: (status: 'reviewed' | 'resolved') => Promise<void>
  onOpen: () => Promise<void>
}) {
  const actorName = item.actor ? fullName(item.actor.first_name, item.actor.last_name) : null
  const destination = item.destination_route || item.link

  return (
    <Card className={item.is_read ? 'opacity-90' : 'border-accent/40'}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg">{item.title}</CardTitle>
          {item.project?.name ? (
            <p className="text-sm text-muted-foreground">{item.project.name}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={item.is_read ? 'secondary' : 'accent'}>{item.is_read ? 'Read' : 'Unread'}</Badge>
          {item.relevance ? (
            <Badge variant="outline" className="text-[10px]">
              {relevanceLabel(item.relevance)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{item.preview_text || item.message}</p>
        <p className="text-xs text-muted-foreground">
          {actorName ? `${actorName} · ` : ''}
          {formatRelative(item.created_at)}
          {item.activity_type ? ` · ${item.activity_type.replaceAll('_', ' ')}` : ''}
          {item.review_status && item.review_status !== 'none' ? ` · ${item.review_status}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {destination ? (
            <Button size="sm" onClick={() => void onOpen()}>
              View activity
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.message('This activity is no longer available.')}
            >
              Unavailable
            </Button>
          )}
          {item.is_read ? (
            <Button size="sm" variant="outline" onClick={onMarkUnread}>
              Mark unread
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onMarkRead}>
              Mark read
            </Button>
          )}
          {canReview ? (
            <>
              <Button size="sm" variant="outline" onClick={() => void onReview('reviewed')}>
                Mark reviewed
              </Button>
              <Button size="sm" variant="outline" onClick={() => void onReview('resolved')}>
                Mark resolved
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
