import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type {
  Notification,
  NotificationPreferences,
  NotificationRelevance,
  ProjectActivityEvent,
  ProjectActivityType,
} from '@/types/database'

export { relevanceLabel } from '@/features/notifications/relevance'

function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId?: string,
) {
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
  queryClient.invalidateQueries({ queryKey: ['project-activity'] })
  if (profileId) {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', profileId] })
    queryClient.invalidateQueries({ queryKey: ['notifications', 'dashboard', profileId] })
  }
}

export function useUnreadNotifications() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['notifications', 'unread-count', profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', profile!.id)
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useNotifications(filters?: {
  status?: 'all' | 'unread' | 'read'
  limit?: number
}) {
  const { profile } = useAuth()
  const status = filters?.status ?? 'all'
  const limit = filters?.limit ?? 40

  return useQuery({
    queryKey: ['notifications', profile?.id, status, limit],
    enabled: Boolean(profile?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select('*, actor:profiles!actor_id(*), project:projects(*)')
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status === 'unread') query = query.eq('is_read', false)
      if (status === 'read') query = query.eq('is_read', true)

      const { data, error } = await query
      if (error) {
        // Fallback if new columns/joins are not migrated yet
        const legacy = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', profile!.id)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (legacy.error) throw error
        let rows = (legacy.data ?? []) as Notification[]
        if (status === 'unread') rows = rows.filter((n) => !n.is_read)
        if (status === 'read') rows = rows.filter((n) => n.is_read)
        return rows
      }
      return (data ?? []) as Notification[]
    },
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ id, isRead = true }: { id: string; isRead?: boolean }) => {
      const { error } = await supabase.from('notifications').update({ is_read: isRead }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not signed in')
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', profile.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}

export function useCreateNotification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      recipientIds,
      title,
      message,
      link,
    }: {
      recipientIds: string[]
      title: string
      message: string
      link?: string | null
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      if (recipientIds.length === 0) throw new Error('Select at least one recipient')

      const rows = recipientIds.map((recipientId) => ({
        organization_id: profile.organization_id!,
        recipient_id: recipientId,
        title,
        message,
        link: link || null,
        destination_route: link || null,
        activity_type: 'GENERAL' as ProjectActivityType,
        relevance: 'general' as NotificationRelevance,
      }))

      const { error } = await supabase.from('notifications').insert(rows)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}

export function useProjectActivityFeed(filters?: {
  activityType?: ProjectActivityType | 'all'
  activityTypes?: ProjectActivityType[]
  projectId?: string
  requiresAttention?: boolean
  limit?: number
}) {
  const { profile } = useAuth()
  const limit = filters?.limit ?? 40

  return useQuery({
    queryKey: ['project-activity', profile?.organization_id, filters],
    enabled: Boolean(profile?.organization_id),
    refetchInterval: 45_000,
    queryFn: async () => {
      let query = supabase
        .from('project_activity_events')
        .select('*, actor:profiles!actor_id(*), project:projects(*)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (filters?.projectId) query = query.eq('project_id', filters.projectId)
      if (filters?.activityTypes?.length) {
        query = query.in('activity_type', filters.activityTypes)
      } else if (filters?.activityType && filters.activityType !== 'all') {
        query = query.eq('activity_type', filters.activityType)
      }
      if (filters?.requiresAttention) query = query.eq('requires_attention', true)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProjectActivityEvent[]
    },
  })
}

export function useNotificationPreferences() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notification-preferences', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      if (data) return data as NotificationPreferences
      const { data: created, error: insertError } = await supabase
        .from('notification_preferences')
        .insert({ user_id: profile!.id })
        .select('*')
        .single()
      if (insertError) throw insertError
      return created as NotificationPreferences
    },
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (values: Partial<NotificationPreferences>) => {
      if (!profile?.id) throw new Error('Not signed in')
      const { error } = await supabase.from('notification_preferences').upsert({
        user_id: profile.id,
        ...values,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences', profile?.id] })
    },
  })
}

export function useReviewNotification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({
      id,
      reviewStatus,
    }: {
      id: string
      reviewStatus: 'reviewed' | 'resolved'
    }) => {
      const { error } = await supabase
        .from('notifications')
        .update({
          review_status: reviewStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.id,
          resolved_at: reviewStatus === 'resolved' ? new Date().toISOString() : null,
          is_read: true,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}
