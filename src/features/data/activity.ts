import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActivityLog } from '@/types/database'

export function useActivityLog(limit = 25) {
  return useQuery({
    queryKey: ['activity-log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*, actor:profiles!actor_id(*)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as ActivityLog[]
    },
  })
}

