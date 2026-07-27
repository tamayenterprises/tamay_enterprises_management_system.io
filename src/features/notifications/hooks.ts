import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Notification } from '@/types/database'

export function useUnreadNotifications() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['notifications', 'unread-count', profile?.id],
    enabled: Boolean(profile?.id),
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

export function useNotifications() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['notifications', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Notification[]
    },
  })
}
