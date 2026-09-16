import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { buildIlikeOrFilter } from '@/lib/utils'
import { softUnassignAllForProfile } from '@/features/data/assignments'
import type { ProfileFormValues } from '@/lib/validations'
import type { Profile, RoleOption, UserRole } from '@/types/database'

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('sort_order')
      if (error) throw error
      return (data ?? []) as RoleOption[]
    },
  })
}

export function useProfiles(filters?: { role?: UserRole | UserRole[]; search?: string; includeArchived?: boolean }) {
  return useQuery({
    queryKey: ['profiles', filters],
    queryFn: async () => {
      let query = supabase.from('profiles').select('*').order('last_name')

      if (!filters?.includeArchived) {
        query = query.is('archived_at', null)
      }

      if (filters?.role) {
        if (Array.isArray(filters.role)) {
          query = query.in('role', filters.role)
        } else {
          query = query.eq('role', filters.role)
        }
      }

      if (filters?.search) {
        const peopleFilter = buildIlikeOrFilter(
          ['first_name', 'last_name', 'email', 'company_name'],
          filters.search,
        )
        if (peopleFilter) query = query.or(peopleFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Profile[]
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProfileFormValues }) => {
      const { data, error } = await supabase.from('profiles').update(values).eq('id', id).select().single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['profiles', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Profile[]
    },
  })
}

export function useApproveUser() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          approval_status: approve ? 'approved' : 'rejected',
          is_active: approve,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const approvedProfile = data as Profile

      if (approve && approvedProfile.organization_id) {
        await supabase.from('notifications').insert({
          organization_id: approvedProfile.organization_id,
          recipient_id: id,
          title: 'Account approved',
          message: 'Your Tamay Enterprises account has been approved. You can now access the system.',
          link: '/dashboard',
        })
      }

      if (profile?.organization_id) {
        await supabase.from('activity_log').insert({
          organization_id: profile.organization_id,
          actor_id: profile.id,
          entity_type: 'profile',
          entity_id: id,
          action: approve ? 'approved_user' : 'rejected_user',
          metadata: {
            email: approvedProfile.email,
            role: approvedProfile.role,
          },
        })
      }

      return approvedProfile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      if (profile?.organization_id) {
        await supabase.from('activity_log').insert({
          organization_id: profile.organization_id,
          actor_id: profile.id,
          entity_type: 'profile',
          entity_id: id,
          action: 'updated_role',
          metadata: { role },
        })
      }

      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useAdminSetUserAccess() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      isActive,
      archived,
      approvalStatus,
    }: {
      id: string
      isActive?: boolean
      archived?: boolean
      approvalStatus?: Profile['approval_status']
    }) => {
      const payload: Record<string, unknown> = {}
      if (typeof isActive === 'boolean') payload.is_active = isActive
      if (typeof archived === 'boolean') {
        payload.archived_at = archived ? new Date().toISOString() : null
        if (archived) payload.is_active = false
      }
      if (approvalStatus) {
        payload.approval_status = approvalStatus
        if (approvalStatus === 'approved') payload.is_active = true
      }

      const { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select().single()
      if (error) throw error

      // Removing someone from Tamay also pulls them off active jobs (replace / done).
      let unassignedCount = 0
      if (archived === true && profile?.id) {
        unassignedCount = await softUnassignAllForProfile(
          id,
          profile.id,
          profile.organization_id,
        )
      }

      if (profile?.organization_id) {
        await supabase.from('activity_log').insert({
          organization_id: profile.organization_id,
          actor_id: profile.id,
          entity_type: 'profile',
          entity_id: id,
          action: archived === true ? 'removed_user' : 'updated_access',
          metadata: { ...payload, unassigned_projects: unassignedCount },
        })
      }

      return { profile: data as Profile, unassignedCount }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['worker-eligibility'] })
      queryClient.invalidateQueries({ queryKey: ['profile-assignments', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useWorkerEligibility(workerId?: string | null) {
  return useQuery({
    queryKey: ['worker-eligibility', workerId],
    enabled: Boolean(workerId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_worker_eligibility', {
        p_user_id: workerId!,
      })
      if (error) throw error
      return data as import('@/lib/worker-eligibility').WorkerEligibility
    },
  })
}

export function useSetWorkerStatus() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({
      workerId,
      action,
      reason,
    }: {
      workerId: string
      action: 'activate' | 'deactivate' | 'suspend' | 'archive' | 'restore' | 'approve'
      reason: string
    }) => {
      const { data, error } = await supabase.rpc('set_worker_status', {
        p_worker_id: workerId,
        p_action: action,
        p_reason: reason,
      })
      if (error) throw error

      let unassignedCount = 0
      if (action === 'archive' && profile?.id) {
        unassignedCount = await softUnassignAllForProfile(
          workerId,
          profile.id,
          profile.organization_id,
        )
      }

      return {
        ...(data as {
          ok: boolean
          message?: string
          eligibility?: import('@/lib/worker-eligibility').WorkerEligibility
          profile?: Profile
        }),
        unassignedCount,
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['worker-eligibility', vars.workerId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status-history'] })
      if (vars.action === 'archive') {
        queryClient.invalidateQueries({ queryKey: ['profile-assignments', vars.workerId] })
        queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      }
    },
  })
}

export function useWorkerStatusHistory(workerId?: string | null) {
  return useQuery({
    queryKey: ['worker-status-history', workerId],
    enabled: Boolean(workerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_status_history')
        .select('*, changer:profiles!changed_by(*)')
        .eq('worker_id', workerId!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  })
}

