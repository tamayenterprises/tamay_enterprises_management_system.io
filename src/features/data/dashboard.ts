import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { useProjects } from '@/features/data/projects'
import { useCertifications } from '@/features/data/certifications'
import { usePendingApprovals, useProfiles } from '@/features/data/people'
import type { Notification } from '@/types/database'

export function useDashboardData() {
  const { profile } = useAuth()
  const isManagement = profile?.role === 'admin' || profile?.role === 'project_manager'
  const queryClient = useQueryClient()

  useQuery({
    queryKey: ['certification-maintenance', profile?.id],
    enabled: Boolean(profile?.id),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('run_certification_maintenance')
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['certifications'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      return data
    },
  })

  const projects = useProjects({ assignedOnly: !isManagement })
  const certifications = useCertifications()
  const pendingApprovals = usePendingApprovals()
  const employees = useProfiles({ role: 'employee' })
  const subcontractors = useProfiles({ role: 'subcontractor' })
  const notifications = useQuery({
    queryKey: ['notifications', 'dashboard', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
  })

  return {
    projects,
    certifications,
    notifications,
    pendingApprovals,
    employees,
    subcontractors,
    profile,
    isManagement,
  }
}

