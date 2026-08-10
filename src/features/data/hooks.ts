import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { documentStorageBucket, buildIlikeOrFilter } from '@/lib/utils'
import { validateUploadFile, validateImageUploadFile } from '@/lib/uploads'
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

export function useProjects(options?: { assignedOnly?: boolean; search?: string; status?: ProjectStatus | 'all' }) {
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

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status)
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
      visibleToClient,
    }: {
      projectId: string
      content: string
      parentId?: string | null
      photo?: File | null
      mentionedUserIds?: string[]
      requiresAttention?: boolean
      referencedProjectIds?: string[]
      visibleToClient?: boolean
    }) => {
      if (!profile?.id) throw new Error('Missing profile')

      const trimmed = content.trim()
      if (!trimmed && !photo) throw new Error('Write an update or add a photo')

      let photoPath: string | null = null

      if (photo) {
        const validationError = validateImageUploadFile(photo)
        if (validationError) throw new Error(validationError)

        const safeName = photo.name.replace(/[^\w.\-()+ ]+/g, '_')
        photoPath = `${profile.id}/${projectId}/updates/${Date.now()}-${safeName}`

        const { error: uploadError } = await supabase.storage.from('project-files').upload(photoPath, photo)
        if (uploadError) throw uploadError
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
        visible_to_client?: boolean
      } = {
        project_id: projectId,
        author_id: profile.id,
        content: trimmed || null,
      }
      if (parentId) payload.parent_id = parentId
      if (photoPath) payload.photo_path = photoPath
      if (requiresAttention) payload.requires_attention = true
      if (visibleToClient) payload.visible_to_client = true

      const { data, error } = await supabase
        .from('project_notes')
        .insert(payload)
        .select('*, author:profiles(*)')
        .single()

      if (error) {
        if (photoPath) await supabase.storage.from('project-files').remove([photoPath])
        const missingColumn =
          /parent_id|photo_path|requires_attention|schema cache|PGRST204/i.test(error.message) ||
          error.code === 'PGRST204'
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
          console.warn(mentionError.message)
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-notes', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['my-project-updates'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['project-activity'] })
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
      const payload = {
        ...values,
        start_date: values.start_date === '' ? null : values.start_date,
        deadline: values.deadline === '' ? null : values.deadline,
      }
      const { data, error } = await supabase.from('projects').update(payload).eq('id', projectId).select().single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useArchiveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
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

      if (profile?.organization_id) {
        await supabase.from('activity_log').insert({
          organization_id: profile.organization_id,
          actor_id: profile.id,
          entity_type: 'profile',
          entity_id: id,
          action: 'updated_access',
          metadata: payload,
        })
      }

      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['worker-eligibility'] })
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
      return data as {
        ok: boolean
        message?: string
        eligibility?: import('@/lib/worker-eligibility').WorkerEligibility
        profile?: Profile
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['worker-eligibility', vars.workerId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status-history'] })
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

      const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_')
      const path = projectId
        ? `${profile.id}/${projectId}/${Date.now()}-${safeName}`
        : `${profile.id}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file)
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('documents')
        .insert({
          organization_id: profile.organization_id,
          owner_id: profile.id,
          uploaded_by: profile.id,
          project_id: projectId || null,
          name: file.name,
          category,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(bucket).remove([path])
        throw error
      }

      return data as DocumentRecord
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (doc.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-documents', doc.project_id] })
      }
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
      queryClient.invalidateQueries({ queryKey: ['assignment-history', variables.projectId] })
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
    },
  })
}
