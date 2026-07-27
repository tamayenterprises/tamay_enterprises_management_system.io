import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { ProjectFormValues, ProfileFormValues, CertificationFormValues } from '@/lib/validations'
import type {
  Certification,
  DocumentRecord,
  Notification,
  Profile,
  Project,
  ProjectAssignment,
  ProjectNote,
  ProjectStatus,
  RoleOption,
  UserRole,
} from '@/types/database'

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

export function useProjects(options?: { assignedOnly?: boolean; search?: string }) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['projects', options, profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*')
        .is('archived_at', null)
        .order('updated_at', { ascending: false })

      if (options?.search) {
        query = query.ilike('name', `%${options.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      const projects = (data ?? []) as Project[]

      if (options?.assignedOnly && profile && !['admin', 'project_manager'].includes(profile.role)) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('project_assignments')
          .select('project_id')
          .eq('profile_id', profile.id)
          .eq('is_active', true)
        if (assignmentError) throw assignmentError
        const ids = new Set(((assignments ?? []) as Array<{ project_id: string }>).map((a) => a.project_id))
        return projects.filter((project) => ids.has(project.id))
      }

      return projects
    },
  })
}

export function useProject(projectId?: string) {
  return useQuery({
    queryKey: ['project', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId!).single()
      if (error) throw error
      return data as Project
    },
  })
}

export function useProjectAssignments(projectId?: string) {
  return useQuery({
    queryKey: ['project-assignments', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('*, profile:profiles(*)')
        .eq('project_id', projectId!)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as ProjectAssignment[]
    },
  })
}

export function useProjectNotes(projectId?: string) {
  return useQuery({
    queryKey: ['project-notes', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_notes')
        .select('*, author:profiles(*)')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectNote[]
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...values,
          organization_id: profile!.organization_id!,
          created_by: profile!.id,
        })
        .select()
        .single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<ProjectFormValues> & { status?: ProjectStatus }) => {
      const { data, error } = await supabase.from('projects').update(values).eq('id', projectId).select().single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
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
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`,
        )
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

  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ approval_status: approve ? 'approved' : 'rejected' })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const profile = data as Profile

      if (approve && profile.organization_id) {
        await supabase.from('notifications').insert({
          organization_id: profile.organization_id,
          recipient_id: id,
          title: 'Account approved',
          message: 'Your Tamay Enterprises account has been approved. You can now access the system.',
          link: '/dashboard',
        })
      }

      return profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useCertifications(filters?: { search?: string; status?: string }) {
  return useQuery({
    queryKey: ['certifications', filters],
    queryFn: async () => {
      let query = supabase
        .from('certifications')
        .select('*, profile:profiles(*)')
        .order('expiration_date', { ascending: true })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.search) query = query.ilike('name', `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Certification[]
    },
  })
}

export function useCreateCertification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (values: CertificationFormValues) => {
      const { data, error } = await supabase
        .from('certifications')
        .insert({
          ...values,
          organization_id: profile!.organization_id!,
        })
        .select()
        .single()
      if (error) throw error
      return data as Certification
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certifications'] }),
  })
}

export function useDocuments(filters?: { search?: string; category?: string }) {
  return useQuery({
    queryKey: ['documents', filters],
    queryFn: async () => {
      let query = supabase.from('documents').select('*').order('created_at', { ascending: false })
      if (filters?.category) query = query.eq('category', filters.category)
      if (filters?.search) query = query.ilike('name', `%${filters.search}%`)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

export function useDashboardData() {
  const { profile } = useAuth()
  const projects = useProjects({ assignedOnly: true })
  const certifications = useCertifications({ status: 'expiring_soon' })
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

  return { projects, certifications, notifications, profile }
}

export function useAssignWorker() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ projectId, profileId }: { projectId: string; profileId: string }) => {
      const { data, error } = await supabase
        .from('project_assignments')
        .upsert(
          {
            project_id: projectId,
            profile_id: profileId,
            assigned_by: profile!.id,
            is_active: true,
            removed_at: null,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,profile_id' },
        )
        .select()
        .single()
      if (error) throw error

      await supabase.from('assignment_history').insert({
        project_id: projectId,
        profile_id: profileId,
        action: 'assigned',
        performed_by: profile!.id,
      })

      const assignee = await supabase.from('profiles').select('organization_id').eq('id', profileId).single()
      const orgId = (assignee.data as { organization_id: string | null } | null)?.organization_id
      if (orgId) {
        await supabase.from('notifications').insert({
          organization_id: orgId,
          recipient_id: profileId,
          title: 'Assigned to project',
          message: 'You have been assigned to a new project.',
          link: `/projects/${projectId}`,
        })
      }

      return data as ProjectAssignment
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-assignments', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useRemoveAssignment() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      assignmentId,
      projectId,
      profileId,
    }: {
      assignmentId: string
      projectId: string
      profileId: string
    }) => {
      const { error } = await supabase
        .from('project_assignments')
        .update({ is_active: false, removed_at: new Date().toISOString() })
        .eq('id', assignmentId)
      if (error) throw error

      await supabase.from('assignment_history').insert({
        project_id: projectId,
        profile_id: profileId,
        action: 'removed',
        performed_by: profile!.id,
      })

      if (profile?.organization_id) {
        await supabase.from('notifications').insert({
          organization_id: profile.organization_id,
          recipient_id: profileId,
          title: 'Removed from project',
          message: 'You have been removed from a project assignment.',
          link: '/projects',
        })
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-assignments', variables.projectId] })
    },
  })
}
