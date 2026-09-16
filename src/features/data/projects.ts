import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { buildIlikeOrFilter, defaultWarrantyEndDate } from '@/lib/utils'
import { canViewContractFinance, stripContractFinanceFromProject } from '@/lib/project-finance'
import { validateImageUploadFile, uploadErrorMessage, prepareUploadFileAsync } from '@/lib/uploads'
import type { ProjectFormValues } from '@/lib/validations'
import type {
  ActivityLog,
  AssignmentHistory,
  Profile,
  Project,
  ProjectAssignment,
  ProjectNote,
  ProjectStatus,
} from '@/types/database'

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
        const projectFilter = buildIlikeOrFilter(['name', 'location', 'description'], options.search)
        if (projectFilter) query = query.or(projectFilter)
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
        projects = projects.filter((project) => ids.has(project.id))
      }

      if (!canViewContractFinance(profile?.role) && profile?.role !== 'client') {
        return projects.map((project) => stripContractFinanceFromProject(project))
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
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['project', projectId, profile?.role ?? 'anon'],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId!).single()
      if (error) throw error
      const project = data as Project
      // Employees/subs must not receive contract totals even though projects SELECT is shared.
      if (!canViewContractFinance(profile?.role) && profile?.role !== 'client') {
        return stripContractFinanceFromProject(project)
      }
      return project
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

