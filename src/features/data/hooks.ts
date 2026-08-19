import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { documentStorageBucket, buildIlikeOrFilter, defaultWarrantyEndDate } from '@/lib/utils'
import { validateUploadFile, validateImageUploadFile, uploadErrorMessage, prepareUploadFileAsync } from '@/lib/uploads'
import type { ProjectFormValues, ProfileFormValues, CertificationFormValues } from '@/lib/validations'
import type {
  ActivityLog,
  AssignmentHistory,
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

export function useProjects(options?: {
  assignedOnly?: boolean
  search?: string
  status?: ProjectStatus | 'all'
  /** active = not archived (default); archived = archived only; all = both */
  archived?: 'active' | 'archived' | 'all'
  /** Client-side style filter applied after fetch for archived warranty views */
  warranty?: 'all' | 'active' | 'expired'
}) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['projects', options, profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      let query = supabase.from('projects').select('*').order('updated_at', { ascending: false })

      const archivedMode = options?.archived ?? 'active'
      if (archivedMode === 'active') {
        query = query.is('archived_at', null)
      } else if (archivedMode === 'archived') {
        query = query.not('archived_at', 'is', null)
      }

      if (options?.search) {
        const term = options.search.trim()
        if (term) {
          query = query.or(`name.ilike.%${term}%,location.ilike.%${term}%,description.ilike.%${term}%`)
        }
      }

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status)
      }

      const { data, error } = await query
      if (error) throw error
      let projects = (data ?? []) as Project[]

      if (options?.warranty && options.warranty !== 'all') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        projects = projects.filter((project) => {
          if (!project.warranty_ends_on) return options.warranty === 'active'
          const end = new Date(`${project.warranty_ends_on}T00:00:00`)
          const active = end >= today
          return options.warranty === 'active' ? active : !active
        })
      }

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

/** Active client assignees for a set of projects (for archived warranty lookup cards). */
export function useProjectClientAssignees(projectIds: string[]) {
  const idsKey = projectIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['project-client-assignees', idsKey],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('project_id, profile:profiles!profile_id(id, first_name, last_name, company_name, role, email)')
        .in('project_id', projectIds)
        .eq('is_active', true)
      if (error) throw error

      const byProject = new Map<string, Profile[]>()
      for (const row of data ?? []) {
        const assignment = row as {
          project_id: string
          profile: Profile | Profile[] | null
        }
        const profile = Array.isArray(assignment.profile)
          ? assignment.profile[0]
          : assignment.profile
        if (!profile || profile.role !== 'client') continue
        const list = byProject.get(assignment.project_id) ?? []
        list.push(profile)
        byProject.set(assignment.project_id, list)
      }
      return byProject
    },
  })
}

export function useProjectWarrantyAudit(projectId?: string) {
  return useQuery({
    queryKey: ['project-warranty-audit', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*, actor:profiles!actor_id(*)')
        .eq('entity_type', 'project')
        .eq('entity_id', projectId!)
        .in('action', ['project_archived', 'project_restored', 'warranty_date_changed'])
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as ActivityLog[]
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

export function useAssignmentHistory(projectId?: string) {
  return useQuery({
    queryKey: ['assignment-history', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_history')
        .select('*, profile:profiles!profile_id(*)')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Array<AssignmentHistory & { profile?: Profile }>
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
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectNote[]
    },
  })
}

export function useCreateProjectUpdate() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      projectId,
      content,
      parentId,
      photo,
      mentionedUserIds,
      requiresAttention,
      referencedProjectIds,
      visibleToClient = false,
    }: {
      projectId: string
      content: string
      parentId?: string | null
      photo?: File | null
      mentionedUserIds?: string[]
      requiresAttention?: boolean
      referencedProjectIds?: string[]
      /** When false, clients on the project do not see this note (staff-only). */
      visibleToClient?: boolean
    }) => {
      if (!profile?.id) throw new Error('Missing profile')

      const trimmed = content.trim()
      if (!trimmed && !photo) throw new Error('Write an update or add a photo')

      let photoPath: string | null = null

      if (photo) {
        const validationError = validateImageUploadFile(photo)
        if (validationError) throw new Error(validationError)

        const prepared = await prepareUploadFileAsync(photo)
        const safeName = prepared.displayName.replace(/[^\w.\-()+ ]+/g, '_') || 'photo'
        photoPath = `${profile.id}/${projectId}/updates/${Date.now()}-${crypto.randomUUID()}-${safeName}`

        const { error: uploadError } = await supabase.storage.from('project-files').upload(photoPath, prepared.file, {
          contentType: prepared.contentType,
          upsert: false,
        })
        if (uploadError) throw new Error(uploadErrorMessage(uploadError))
      }

      // Only send columns that are needed. Sending null parent_id/photo_path
      // fails if the project_updates migration has not been applied yet.
      const payload: {
        project_id: string
        author_id: string
        content: string | null
        parent_id?: string
        photo_path?: string
        requires_attention?: boolean
        visible_to_client: boolean
      } = {
        project_id: projectId,
        author_id: profile.id,
        content: trimmed || null,
        // Explicit boolean — never omit/undefined (that previously defaulted to true).
        visible_to_client: visibleToClient === true,
      }
      if (parentId) payload.parent_id = parentId
      if (photoPath) payload.photo_path = photoPath
      if (requiresAttention) payload.requires_attention = true

      const { data, error } = await supabase
        .from('project_notes')
        .insert(payload)
        .select('*, author:profiles(*)')
        .single()

      if (error) {
        if (photoPath) await supabase.storage.from('project-files').remove([photoPath])
        const missingColumn =
          /parent_id|photo_path|requires_attention|visible_to_client|schema cache|PGRST204/i.test(
            error.message,
          ) || error.code === 'PGRST204'
        if (missingColumn) {
          throw new Error(
            'Project Updates / activity notifications are not fully set up in the database yet. Run the latest SQL migrations in Supabase, then try again.',
          )
        }
        throw error
      }

      const note = data as ProjectNote
      if (mentionedUserIds?.length) {
        const { error: mentionError } = await supabase.rpc('register_project_note_mentions', {
          p_note_id: note.id,
          p_mentioned_user_ids: mentionedUserIds,
        })
        if (mentionError) {
          throw new Error(
            mentionError.message ||
              'Update saved, but mention notifications could not be sent. Try mentioning again.',
          )
        }
      }
      if (referencedProjectIds?.length) {
        const { error: refError } = await supabase.rpc('register_project_note_project_refs', {
          p_note_id: note.id,
          p_project_ids: referencedProjectIds,
        })
        if (refError) console.warn(refError.message)
      }

      return note
    },
    onSuccess: async (note, variables) => {
      await queryClient.cancelQueries({ queryKey: ['project-notes', variables.projectId] })
      queryClient.setQueryData<ProjectNote[]>(['project-notes', variables.projectId], (old) => {
        if (!old) return [note]
        if (old.some((row) => row.id === note.id)) return old
        return [...old, note]
      })
      await queryClient.invalidateQueries({ queryKey: ['project-notes', variables.projectId] })
      void queryClient.invalidateQueries({ queryKey: ['my-project-updates'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['project-activity'] })
    },
  })
}

/**
 * Post already-uploaded project photos into the shared project message thread
 * so staff and clients see them in the same reply chain (not only under Files).
 */
export function usePostProjectPhotosToThread() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      projectId,
      photos,
      caption,
    }: {
      projectId: string
      photos: Array<{ storage_path: string; name?: string | null }>
      caption?: string
      /** @deprecated Always shared with assigned clients */
      visibleToClient?: boolean
    }) => {
      if (!profile?.id) throw new Error('Missing profile')
      if (photos.length === 0) return []

      const notes: ProjectNote[] = []
      const rootCaption =
        caption?.trim() ||
        (photos.length === 1 ? 'Shared a photo' : `Shared ${photos.length} photos`)

      const rootPayload = {
        project_id: projectId,
        author_id: profile.id,
        content: rootCaption,
        photo_path: photos[0]!.storage_path,
        visible_to_client: true,
      }

      const { data: root, error: rootError } = await supabase
        .from('project_notes')
        .insert(rootPayload)
        .select('*, author:profiles(*)')
        .single()
      if (rootError) throw rootError
      notes.push(root as ProjectNote)

      for (let index = 1; index < photos.length; index += 1) {
        const replyPayload = {
          project_id: projectId,
          author_id: profile.id,
          content: null as string | null,
          parent_id: (root as ProjectNote).id,
          photo_path: photos[index]!.storage_path,
          visible_to_client: true,
        }

        const { data: reply, error: replyError } = await supabase
          .from('project_notes')
          .insert(replyPayload)
          .select('*, author:profiles(*)')
          .single()
        if (replyError) throw replyError
        notes.push(reply as ProjectNote)
      }

      return notes
    },
    onSuccess: async (notes, variables) => {
      await queryClient.cancelQueries({ queryKey: ['project-notes', variables.projectId] })
      queryClient.setQueryData<ProjectNote[]>(['project-notes', variables.projectId], (old) => {
        if (!old) return notes
        const existing = new Set(old.map((row) => row.id))
        const extras = notes.filter((row) => !existing.has(row.id))
        return extras.length === 0 ? old : [...old, ...extras]
      })
      await queryClient.invalidateQueries({ queryKey: ['project-notes', variables.projectId] })
      void queryClient.invalidateQueries({ queryKey: ['my-project-updates'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['project-activity'] })
    },
  })
}
export function usePostProjectDocumentsToThread() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      projectId,
      documents,
    }: {
      projectId: string
      documents: Array<{ name: string }>
      /** @deprecated Always shared with assigned clients */
      visibleToClient?: boolean
    }) => {
      if (!profile?.id) throw new Error('Missing profile')
      if (documents.length === 0) return []

      const names = documents.map((doc) => doc.name)
      const content =
        names.length === 1
          ? `Shared a document: ${names[0]}`
          : `Shared ${names.length} documents:\n${names.map((name) => `• ${name}`).join('\n')}`

      const payload = {
        project_id: projectId,
        author_id: profile.id,
        content,
        visible_to_client: true,
      }

      const { data, error } = await supabase
        .from('project_notes')
        .insert(payload)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return [data as ProjectNote]
    },
    onSuccess: async (notes, variables) => {
      await queryClient.cancelQueries({ queryKey: ['project-notes', variables.projectId] })
      queryClient.setQueryData<ProjectNote[]>(['project-notes', variables.projectId], (old) => {
        if (!old) return notes
        const existing = new Set(old.map((row) => row.id))
        const extras = notes.filter((row) => !existing.has(row.id))
        return extras.length === 0 ? old : [...old, ...extras]
      })
      await queryClient.invalidateQueries({ queryKey: ['project-notes', variables.projectId] })
      void queryClient.invalidateQueries({ queryKey: ['my-project-updates'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['project-activity'] })
    },
  })
}

export async function createUpdatePhotoSignedUrl(photoPath: string) {
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(photoPath, 60 * 30)
  if (error || !data?.signedUrl) throw error ?? new Error('Unable to open photo')
  return data.signedUrl
}

export function useProjectDocuments(projectId?: string) {
  return useQuery({
    queryKey: ['project-documents', projectId],
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, owner:profiles!owner_id(*), uploader:profiles!uploaded_by(*)')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const payload = {
        ...values,
        start_date: values.start_date || null,
        deadline: values.deadline || null,
        warranty_ends_on: values.warranty_ends_on || null,
        description: values.description || null,
        location: values.location || null,
        organization_id: profile!.organization_id!,
        created_by: profile!.id,
      }
      const { data, error } = await supabase.from('projects').insert(payload).select().single()
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
      const payload: Record<string, unknown> = {
        ...values,
        start_date: values.start_date === '' ? null : values.start_date,
        deadline: values.deadline === '' ? null : values.deadline,
      }
      // Warranty dates cannot be cleared once set (DB enforces). Omit blank to leave unchanged.
      if (values.warranty_ends_on === '' || values.warranty_ends_on == null) {
        delete payload.warranty_ends_on
      } else {
        payload.warranty_ends_on = values.warranty_ends_on
      }
      const { data, error } = await supabase.from('projects').update(payload).eq('id', projectId).select().single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-warranty-audit', projectId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useArchiveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data: existing, error: loadError } = await supabase
        .from('projects')
        .select('status, warranty_ends_on')
        .eq('id', projectId)
        .single()
      if (loadError) throw loadError

      const payload: { archived_at: string; warranty_ends_on?: string } = {
        archived_at: new Date().toISOString(),
      }
      // Keep a warranty date on archive for completed jobs if one was never set.
      if (
        existing &&
        (existing as Project).status === 'completed' &&
        !(existing as Project).warranty_ends_on
      ) {
        payload.warranty_ends_on = defaultWarrantyEndDate()
      }

      const { error } = await supabase.from('projects').update(payload).eq('id', projectId)
      if (error) throw error
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-warranty-audit', projectId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useRestoreProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ archived_at: null })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-warranty-audit', projectId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

/** Permanently deletes a project (active or archived). Requires migration 000008. */
export function useHardDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      // Best-effort: remove storage objects linked to this project before DB cascade.
      const { data: docs } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('project_id', projectId)

      const paths = (docs ?? [])
        .map((doc) => doc.storage_path)
        .filter((path): path is string => Boolean(path))

      if (paths.length > 0) {
        await supabase.storage.from('project-files').remove(paths)
        await supabase.storage.from('documents').remove(paths)
      }

      const { data, error } = await supabase.rpc('admin_hard_delete_project', {
        p_project_id: projectId,
      })
      if (error) {
        if (/admin_hard_delete_project|schema cache|PGRST202|function .* does not exist/i.test(error.message)) {
          throw new Error(
            'Permanent delete is not set up in the database yet. Run migration 20260338000008_admin_hard_delete_project.sql in Supabase, then try again.',
          )
        }
        throw error
      }
      return data as { ok: boolean; id: string; name: string }
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.removeQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['profile-assignments'] })
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

export function useCertifications(filters?: {
  search?: string
  status?: string
  type?: string
  profileId?: string
}) {
  return useQuery({
    queryKey: ['certifications', filters],
    queryFn: async () => {
      let query = supabase
        .from('certifications')
        .select('*, profile:profiles(*)')
        .order('expiration_date', { ascending: true, nullsFirst: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.type) query = query.eq('certification_type', filters.type)
      if (filters?.search) query = query.ilike('name', `%${filters.search}%`)
      if (filters?.profileId) query = query.eq('profile_id', filters.profileId)

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
    mutationFn: async ({ values, file }: { values: CertificationFormValues; file?: File | null }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')

      let documentPath: string | null = null

      if (file) {
        const validationError = validateUploadFile(file)
        if (validationError) throw new Error(validationError)

        const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_')
        documentPath = `${profile.id}/certifications/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('documents').upload(documentPath, file)
        if (uploadError) throw uploadError
      }

      const { data, error } = await supabase
        .from('certifications')
        .insert({
          name: values.name,
          certification_type: values.certification_type,
          profile_id: values.profile_id,
          issue_date: values.issue_date || null,
          expiration_date: values.expiration_date || null,
          notes: values.notes || null,
          document_url: documentPath,
          organization_id: profile.organization_id,
        })
        .select()
        .single()

      if (error) {
        if (documentPath) await supabase.storage.from('documents').remove([documentPath])
        throw error
      }

      if (documentPath && file) {
        await supabase.from('documents').insert({
          organization_id: profile.organization_id,
          owner_id: profile.id,
          uploaded_by: profile.id,
          name: `${values.name} proof - ${file.name}`,
          category: 'certification',
          storage_path: documentPath,
          mime_type: file.type || null,
          file_size: file.size,
        })
        queryClient.invalidateQueries({ queryKey: ['documents'] })
      }

      return data as Certification
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certifications'] }),
  })
}

export function useUpdateCertification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      values,
      file,
      existingDocumentUrl,
    }: {
      id: string
      values: Partial<CertificationFormValues>
      file?: File | null
      existingDocumentUrl?: string | null
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')

      let documentPath = existingDocumentUrl ?? null

      if (file) {
        const validationError = validateUploadFile(file)
        if (validationError) throw new Error(validationError)

        const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_')
        const nextPath = `${profile.id}/certifications/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('documents').upload(nextPath, file)
        if (uploadError) throw uploadError

        if (existingDocumentUrl) {
          await supabase.storage.from('documents').remove([existingDocumentUrl])
        }

        documentPath = nextPath

        await supabase.from('documents').insert({
          organization_id: profile.organization_id,
          owner_id: profile.id,
          uploaded_by: profile.id,
          name: `${values.name ?? 'Certification'} proof - ${file.name}`,
          category: 'certification',
          storage_path: nextPath,
          mime_type: file.type || null,
          file_size: file.size,
        })
        queryClient.invalidateQueries({ queryKey: ['documents'] })
      }

      const { data, error } = await supabase
        .from('certifications')
        .update({
          name: values.name,
          certification_type: values.certification_type,
          profile_id: values.profile_id,
          notes: values.notes,
          issue_date: values.issue_date === '' ? null : values.issue_date,
          expiration_date: values.expiration_date === '' ? null : values.expiration_date,
          document_url: documentPath,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Certification
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certifications'] }),
  })
}

export function useDeleteCertification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cert: Pick<Certification, 'id' | 'document_url'>) => {
      const { error } = await supabase.from('certifications').delete().eq('id', cert.id)
      if (error) throw error
      if (cert.document_url) {
        await supabase.storage.from('documents').remove([cert.document_url])
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certifications'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export async function createCertificationProofUrl(documentUrl?: string | null) {
  if (!documentUrl) throw new Error('No proof file uploaded')
  // Legacy rows may store a full URL; prefer storage signed URLs for paths.
  if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
    return documentUrl
  }
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(documentUrl, 60 * 10)
  if (error || !data?.signedUrl) throw error ?? new Error('Unable to open proof file')
  return data.signedUrl
}

export function useDocuments(filters?: {
  search?: string
  category?: string
  projectId?: string
  ownerId?: string
  mineOnly?: boolean
}) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['documents', filters, profile?.id],
    enabled: Boolean(profile),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*, owner:profiles!owner_id(*), uploader:profiles!uploaded_by(*), project:projects(*)')
        .order('created_at', { ascending: false })

      if (filters?.category) query = query.eq('category', filters.category)
      if (filters?.search) query = query.ilike('name', `%${filters.search}%`)
      if (filters?.projectId) query = query.eq('project_id', filters.projectId)
      if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)
      if (filters?.mineOnly && profile?.id) {
        query = query.or(`owner_id.eq.${profile.id},uploaded_by.eq.${profile.id}`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      file,
      category,
      projectId,
      bucket = 'documents',
    }: {
      file: File
      category: DocumentRecord['category']
      projectId?: string | null
      bucket?: 'documents' | 'project-files'
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')

      const validationError = validateUploadFile(file)
      if (validationError) throw new Error(validationError)

      const prepared = await prepareUploadFileAsync(file)
      const safeName = prepared.displayName.replace(/[^\w.\-()+ ]+/g, '_') || 'upload'
      const path = projectId
        ? `${profile.id}/${projectId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`
        : `${profile.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, prepared.file, {
        contentType: prepared.contentType,
        upsert: false,
      })
      if (uploadError) throw new Error(uploadErrorMessage(uploadError))

      const { data, error } = await supabase
        .from('documents')
        .insert({
          organization_id: profile.organization_id,
          owner_id: profile.id,
          uploaded_by: profile.id,
          project_id: projectId || null,
          name: prepared.displayName,
          category,
          storage_path: path,
          mime_type: prepared.contentType,
          file_size: prepared.file.size || null,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(bucket).remove([path])
        throw new Error(uploadErrorMessage(error))
      }

      return data as DocumentRecord
    },
    onSuccess: async (doc) => {
      // Keep the new row visible even if a slower in-flight refetch returns older data.
      await queryClient.cancelQueries({ queryKey: ['documents'] })
      if (doc.project_id) {
        await queryClient.cancelQueries({ queryKey: ['project-documents', doc.project_id] })
      }

      const mergeDoc = (old: DocumentRecord[] | undefined) => {
        // Only patch queries that already have data (active list views).
        if (!old) return old
        if (old.some((row) => row.id === doc.id)) return old
        return [doc, ...old]
      }

      queryClient.setQueriesData<DocumentRecord[]>({ queryKey: ['documents'] }, mergeDoc)
      if (doc.project_id) {
        queryClient.setQueryData<DocumentRecord[]>(
          ['project-documents', doc.project_id],
          (old) => {
            if (!old) return [doc]
            if (old.some((row) => row.id === doc.id)) return old
            return [doc, ...old]
          },
        )
      }

      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (doc.project_id) {
        void queryClient.invalidateQueries({ queryKey: ['project-documents', doc.project_id] })
      }
      // Ensure mobile clients refetch before the user looks at the list.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['documents'] }),
        doc.project_id
          ? queryClient.refetchQueries({ queryKey: ['project-documents', doc.project_id] })
          : Promise.resolve(),
      ])
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (doc: DocumentRecord) => {
      const bucket = documentStorageBucket(doc)
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) throw error
      await supabase.storage.from(bucket).remove([doc.storage_path])
    },
    onSuccess: (_data, doc) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (doc.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-documents', doc.project_id] })
      }
    },
  })
}

export async function createDocumentSignedUrl(doc: DocumentRecord) {
  const primary = documentStorageBucket(doc)
  const fallback = primary === 'documents' ? 'project-files' : 'documents'

  const first = await supabase.storage.from(primary).createSignedUrl(doc.storage_path, 60 * 10)
  if (!first.error && first.data?.signedUrl) return first.data.signedUrl

  const second = await supabase.storage.from(fallback).createSignedUrl(doc.storage_path, 60 * 10)
  if (second.error || !second.data?.signedUrl) {
    throw second.error ?? first.error ?? new Error('Unable to create download link')
  }
  return second.data.signedUrl
}

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
async function softUnassignAllForProfile(
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
      action: 'removed',
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
      queryClient.invalidateQueries({ queryKey: ['assignment-history', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['profile-assignments', variables.profileId] })
    },
  })
}
