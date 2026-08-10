import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { validateImageUploadFile, validateUploadFile } from '@/lib/uploads'
import type { ProjectRequestFormValues } from '@/lib/validations'
import type { Project, ProjectRequest, ProjectRequestFile, ProjectRequestStatus } from '@/types/database'

export function useMyProjectRequests() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['project-requests', 'mine', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_requests')
        .select('*, converted_project:projects(*), files:project_request_files(*)')
        .eq('client_id', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectRequest[]
    },
  })
}

export function useProjectRequest(requestId?: string) {
  return useQuery({
    queryKey: ['project-request', requestId],
    enabled: Boolean(requestId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_requests')
        .select('*, client:profiles!client_id(*), converted_project:projects(*), files:project_request_files(*)')
        .eq('id', requestId!)
        .single()
      if (error) throw error
      return data as ProjectRequest
    },
  })
}

export function useManagementProjectRequests(status?: ProjectRequestStatus | 'open') {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['project-requests', 'management', profile?.organization_id, status],
    enabled: Boolean(profile?.organization_id),
    queryFn: async () => {
      let query = supabase
        .from('project_requests')
        .select('*, client:profiles!client_id(*), converted_project:projects(*), files:project_request_files(*)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (status === 'open') {
        query = query.in('status', ['pending', 'under_review', 'approved'])
      } else if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProjectRequest[]
    },
  })
}

export function useCreateProjectRequest() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (values: ProjectRequestFormValues) => {
      if (!profile?.id || !profile.organization_id) throw new Error('Missing profile')
      const { data, error } = await supabase
        .from('project_requests')
        .insert({
          organization_id: profile.organization_id,
          client_id: profile.id,
          title: values.title.trim(),
          description: values.description.trim(),
          location: values.location.trim(),
          preferred_start_date: values.preferred_start_date || null,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data as ProjectRequest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests'] })
    },
  })
}

export function useUploadProjectRequestFile() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      requestId,
      file,
      fileKind,
    }: {
      requestId: string
      file: File
      fileKind: 'document' | 'photo'
    }) => {
      if (!profile?.id || !profile.organization_id) throw new Error('Missing profile')

      const validationError =
        fileKind === 'photo' ? validateImageUploadFile(file) : validateUploadFile(file)
      if (validationError) throw new Error(validationError)

      const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_')
      const storagePath = `${profile.id}/requests/${requestId}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage.from('project-files').upload(storagePath, file)
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('project_request_files')
        .insert({
          organization_id: profile.organization_id,
          request_id: requestId,
          uploaded_by: profile.id,
          name: file.name,
          file_kind: fileKind,
          storage_path: storagePath,
          mime_type: file.type || null,
          file_size: file.size,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from('project-files').remove([storagePath])
        throw error
      }

      return data as ProjectRequestFile
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-requests'] })
      queryClient.invalidateQueries({ queryKey: ['project-request', variables.requestId] })
    },
  })
}

export function useReviewProjectRequest() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
      adminNotes,
    }: {
      requestId: string
      status: Extract<ProjectRequestStatus, 'under_review' | 'approved' | 'declined'>
      adminNotes?: string
    }) => {
      const { data, error } = await supabase
        .from('project_requests')
        .update({
          status,
          admin_notes: adminNotes?.trim() || null,
          reviewed_by: profile?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single()
      if (error) throw error
      return data as ProjectRequest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests'] })
    },
  })
}

export function useConvertProjectRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc('convert_project_request', {
        p_request_id: requestId,
      })
      if (error) throw error
      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-assignments'] })
    },
  })
}

export async function createProjectRequestFileSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(storagePath, 60 * 10)
  if (error || !data?.signedUrl) throw error ?? new Error('Unable to open file')
  return data.signedUrl
}
