import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import type { ProjectAssignment, UserRole } from '@/types/database'

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

      const assignee = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', profileId)
        .single()
      const assigneeRow = assignee.data as { organization_id: string | null; role: UserRole } | null
      const orgId = assigneeRow?.organization_id
      if (orgId) {
        const isClient = assigneeRow?.role === 'client'
        await supabase.from('notifications').insert({
          organization_id: orgId,
          recipient_id: profileId,
          title: isClient ? 'Project shared with you' : 'Assigned to project',
          message: isClient
            ? 'Tamay Enterprises shared a project with you in the client portal.'
            : 'You have been assigned to a new project.',
          link: isClient ? `/portal/projects/${projectId}` : `/projects/${projectId}`,
        })
      }

      return data as ProjectAssignment
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-assignments', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['assignment-history', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['profile-assignments', variables.profileId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useProfileAssignments(profileId?: string | null) {
  return useQuery({
    queryKey: ['profile-assignments', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('*, project:projects(*)')
        .eq('profile_id', profileId!)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectAssignment[]
    },
  })
}

/** Soft-unassign every active project for a person (done / replaced). */
export async function softUnassignAllForProfile(
  profileId: string,
  performedBy: string,
  organizationId?: string | null,
) {
  const { data: rows, error } = await supabase
    .from('project_assignments')
    .select('id, project_id')
    .eq('profile_id', profileId)
    .eq('is_active', true)
  if (error) throw error
  if (!rows?.length) return 0

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('project_assignments')
    .update({ is_active: false, removed_at: now })
    .eq('profile_id', profileId)
    .eq('is_active', true)
  if (updateError) throw updateError

  await supabase.from('assignment_history').insert(
    rows.map((row) => ({
      project_id: row.project_id,
      profile_id: profileId,
      action: 'removed' as const,
      performed_by: performedBy,
    })),
  )

  if (organizationId) {
    await supabase.from('notifications').insert({
      organization_id: organizationId,
      recipient_id: profileId,
      title: 'Removed from projects',
      message:
        rows.length === 1
          ? 'You were unassigned from a project.'
          : `You were unassigned from ${rows.length} projects.`,
      link: '/projects',
    })
  }

  return rows.length
}

export function useClearProfileAssignments() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (profileId: string) => {
      if (!profile?.id) throw new Error('Missing profile')
      return softUnassignAllForProfile(profileId, profile.id, profile.organization_id)
    },
    onSuccess: (_count, profileId) => {
      queryClient.invalidateQueries({ queryKey: ['profile-assignments', profileId] })
      queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['assignment-history'] })
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
        action: 'removed' as const,
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
      queryClient.invalidateQueries({ queryKey: ['assignment-history', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['profile-assignments', variables.profileId] })
    },
  })
}

