import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { CurrentWorkerStatus, WorkforceStatus, WorkerStatusUpdate } from '@/types/database'

export function useMyCurrentStatus() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['worker-status', 'me', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_status_updates')
        .select('*, project:projects(*)')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as WorkerStatusUpdate | null) ?? null
    },
  })
}

export function useMyStatusHistory(limit = 20) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['worker-status', 'history', profile?.id, limit],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_status_updates')
        .select('*, project:projects(*)')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as WorkerStatusUpdate[]
    },
  })
}

export function useCurrentWorkforceStatuses(projectId?: string) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['worker-status', 'current', profile?.organization_id, projectId],
    enabled: Boolean(profile?.organization_id),
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase.from('current_worker_statuses').select('*').order('updated_at', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as CurrentWorkerStatus[]
    },
  })
}

export function useUpdateWorkerStatus() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      status,
      projectId,
      note,
    }: {
      status: WorkforceStatus
      projectId?: string | null
      note?: string | null
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')

      const { data, error } = await supabase
        .from('worker_status_updates')
        .insert({
          organization_id: profile.organization_id,
          user_id: profile.id,
          project_id: projectId || null,
          status,
          note: note || null,
        })
        .select('*, project:projects(*)')
        .single()
      if (error) throw error
      return data as WorkerStatusUpdate
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}
