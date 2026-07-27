import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Notification } from '@/types/database'

function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId?: string,
) {
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
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
    refetchInterval: 60_000,
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

export function useNotifications(filters?: { status?: 'all' | 'unread' | 'read' }) {
  const { profile } = useAuth()
  const status = filters?.status ?? 'all'

  return useQuery({
    queryKey: ['notifications', profile?.id, status],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false })

      if (status === 'unread') query = query.eq('is_read', false)
      if (status === 'read') query = query.eq('is_read', true)

      const { data, error } = await query
      if (error) throw error
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
      }))

      const { error } = await supabase.from('notifications').insert(rows)
      if (error) throw error
    },
    onSuccess: () => invalidateNotificationQueries(queryClient, profile?.id),
  })
}
