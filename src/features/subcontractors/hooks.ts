import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-hooks'
import { supabase } from '@/lib/supabase'
import {
  PAYMENT_REQUIREMENT_KEY,
  requirementStoragePath,
  sharedResourceStoragePath,
} from '@/lib/subcontractor-requirements'
import { prepareUploadFileAsync, uploadErrorMessage, validateUploadFile } from '@/lib/uploads'
import type {
  DocumentRecord,
  ProjectAssignment,
  SubcontractorCompanyProfile,
  SubcontractorReadiness,
  SubcontractorRequirementItem,
  SubcontractorRequirementKey,
} from '@/types/database'

/** The subcontractor MVP migration is not installed yet (function or table unknown to the API). */
function isNotInstalled(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42883'))
}

const WORK_ORDER_SELECT =
  '*, project:projects(id, name, location, job_site_address, status, start_date, deadline, archived_at)'

function invalidateRequirements(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['subcontractor-requirements'] })
  void queryClient.invalidateQueries({ queryKey: ['subcontractor-readiness'] })
  void queryClient.invalidateQueries({ queryKey: ['subcontractor-requirement-documents'] })
}

// ------------------------------------------------------------------ requirements / readiness

export function useRequirementItems(profileId?: string | null) {
  return useQuery({
    queryKey: ['subcontractor-requirements', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontractor_requirement_items', { p_profile_id: profileId! })
      if (error) throw error
      return (data ?? []) as SubcontractorRequirementItem[]
    },
  })
}

/**
 * Ready-to-Work status per subcontractor. Resolves to null when the subcontractor MVP migration
 * is not installed, so the app keeps its previous behaviour.
 */
export function useSubcontractorReadiness(profileIds: string[]) {
  const ids = [...new Set(profileIds)].sort()
  return useQuery({
    queryKey: ['subcontractor-readiness', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontractor_readiness', { p_profile_ids: ids })
      if (isNotInstalled(error)) return null
      if (error) throw error
      return new Map(((data ?? []) as SubcontractorReadiness[]).map((row) => [row.profile_id, row]))
    },
  })
}

export function useMyReadiness() {
  const { profile } = useAuth()
  const query = useSubcontractorReadiness(profile?.id ? [profile.id] : [])
  return {
    ...query,
    installed: query.data !== null,
    readiness: profile?.id ? query.data?.get(profile.id) ?? null : null,
  }
}

/** Every requirement submission for one subcontractor, newest first (history, licenses, review). */
export function useRequirementDocuments(profileId?: string | null) {
  return useQuery({
    queryKey: ['subcontractor-requirement-documents', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('owner_id', profileId!)
        .not('requirement_key', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

export function useSubmitRequirementDocument() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({
      requirementKey,
      requirementId,
      file,
      expiresOn,
      licenseType,
    }: {
      requirementKey: SubcontractorRequirementKey
      requirementId?: string | null
      file: File
      expiresOn?: string | null
      licenseType?: string | null
    }) => {
      if (!profile) throw new Error('Sign in again to upload.')
      const validationError = validateUploadFile(file)
      if (validationError) throw new Error(validationError)

      const prepared = await prepareUploadFileAsync(file)
      const bucket = requirementKey === PAYMENT_REQUIREMENT_KEY ? 'restricted-documents' : 'documents'
      const path = requirementStoragePath(profile.id, requirementKey, prepared.displayName)
      const upload = await supabase.storage.from(bucket).upload(path, prepared.file, {
        contentType: prepared.contentType,
        upsert: false,
      })
      if (upload.error) throw new Error(uploadErrorMessage(upload.error))

      const { data, error } = await supabase.rpc('submit_subcontractor_document', {
        p_requirement_key: requirementKey,
        p_storage_path: path,
        p_file_name: prepared.displayName,
        p_mime_type: prepared.contentType,
        p_file_size: prepared.file.size || null,
        p_expires_on: expiresOn || null,
        p_license_type: licenseType || null,
        p_requirement_id: requirementId || null,
      })
      if (error) {
        await supabase.storage.from(bucket).remove([path])
        throw error
      }
      return data as string
    },
    onSuccess: () => invalidateRequirements(queryClient),
  })
}

export function useReviewRequirementDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, approve, note }: { documentId: string; approve: boolean; note?: string | null }) => {
      const { data, error } = await supabase.rpc('review_subcontractor_document', {
        p_document_id: documentId,
        p_approve: approve,
        p_note: note?.trim() || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      invalidateRequirements(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['subcontractor-pending-reviews'] })
    },
  })
}

/** Requirement submissions waiting for management review, oldest first. */
export function usePendingRequirementReviews(enabled = true) {
  return useQuery({
    queryKey: ['subcontractor-pending-reviews'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('review_status', 'submitted')
        .not('requirement_key', 'is', null)
        .order('created_at', { ascending: true })
      if (isNotInstalled(error) || error?.code === '42703') return []
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

export function useSetRequirementRequired() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      profileId,
      item,
      required,
    }: {
      profileId: string
      item: Pick<SubcontractorRequirementItem, 'requirement_key' | 'requirement_id'>
      required: boolean
    }) => {
      if (item.requirement_key === 'other') {
        const { error } = await supabase
          .from('subcontractor_requirements')
          .update({ required, updated_at: new Date().toISOString() })
          .eq('id', item.requirement_id!)
        if (error) throw error
        return
      }
      const { error } = await supabase.rpc('set_subcontractor_requirement', {
        p_profile_id: profileId,
        p_requirement_key: item.requirement_key,
        p_required: required,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateRequirements(queryClient),
  })
}

export function useAddCustomRequirement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      profileId,
      label,
      required,
      needsExpiration,
    }: {
      profileId: string
      label: string
      required: boolean
      needsExpiration: boolean
    }) => {
      const { data, error } = await supabase.rpc('add_subcontractor_custom_requirement', {
        p_profile_id: profileId,
        p_label: label.trim(),
        p_required: required,
        p_needs_expiration: needsExpiration,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidateRequirements(queryClient),
  })
}

export function useRemoveCustomRequirement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requirementId: string) => {
      const { error } = await supabase.from('subcontractor_requirements').delete().eq('id', requirementId)
      if (error) throw error
    },
    onSuccess: () => invalidateRequirements(queryClient),
  })
}

// ------------------------------------------------------------------ Tamay shared resources

export function useSharedResources() {
  return useQuery({
    queryKey: ['subcontractor-shared-resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('audience', 'subcontractors')
        .order('created_at', { ascending: false })
      if (isNotInstalled(error) || error?.code === '42703') return []
      if (error) throw error
      return (data ?? []) as DocumentRecord[]
    },
  })
}

/** Files Tamay uploaded onto this person's record (Admin "Upload" on the worker card). */
export function useFilesFromTamay(profileId?: string | null) {
  return useQuery({
    queryKey: ['subcontractor-files-from-tamay', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('owner_id', profileId!)
        .neq('uploaded_by', profileId!)
        .is('project_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as DocumentRecord[]).filter((doc) => !doc.requirement_key && !doc.audience)
    },
  })
}

export function useUploadSharedResource() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ file, title }: { file: File; title: string }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      const validationError = validateUploadFile(file)
      if (validationError) throw new Error(validationError)
      const prepared = await prepareUploadFileAsync(file)
      const path = sharedResourceStoragePath(profile.id, prepared.displayName)
      const upload = await supabase.storage.from('documents').upload(path, prepared.file, {
        contentType: prepared.contentType,
        upsert: false,
      })
      if (upload.error) throw new Error(uploadErrorMessage(upload.error))
      const { error } = await supabase.from('documents').insert({
        organization_id: profile.organization_id,
        owner_id: profile.id,
        uploaded_by: profile.id,
        project_id: null,
        name: title.trim() || prepared.displayName,
        category: 'company',
        storage_path: path,
        mime_type: prepared.contentType,
        file_size: prepared.file.size || null,
        audience: 'subcontractors',
        team_visible: false,
      })
      if (error) {
        await supabase.storage.from('documents').remove([path])
        throw new Error(uploadErrorMessage(error))
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subcontractor-shared-resources'] }),
  })
}

// ------------------------------------------------------------------ company profile

export function useCompanyProfile(profileId?: string | null) {
  return useQuery({
    queryKey: ['subcontractor-company-profile', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_profiles')
        .select('*')
        .eq('profile_id', profileId!)
        .maybeSingle()
      if (isNotInstalled(error)) return null
      if (error) throw error
      return (data ?? null) as SubcontractorCompanyProfile | null
    },
  })
}

export function useSaveCompanyProfile() {
  const queryClient = useQueryClient()
  const { profile, refreshProfile } = useAuth()
  return useMutation({
    mutationFn: async (values: {
      profileId: string
      first_name: string
      last_name: string
      company_name: string
      phone: string
      trade_specialization: string
      business_address: string
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          company_name: values.company_name.trim() || null,
          phone: values.phone.trim() || null,
          trade_specialization: values.trade_specialization.trim() || null,
        })
        .eq('id', values.profileId)
      if (error) throw error
      const address = await supabase.from('subcontractor_profiles').upsert(
        {
          profile_id: values.profileId,
          organization_id: profile.organization_id,
          business_address: values.business_address.trim() || null,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      )
      if (address.error) throw address.error
    },
    onSuccess: async (_data, values) => {
      void queryClient.invalidateQueries({ queryKey: ['subcontractor-company-profile', values.profileId] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      if (values.profileId === profile?.id) await refreshProfile()
    },
  })
}

// ------------------------------------------------------------------ work orders

export type WorkOrder = Omit<ProjectAssignment, 'project' | 'profile'> & {
  project?: {
    id: string
    name: string
    location: string | null
    job_site_address: string | null
    status: string
    start_date: string | null
    deadline: string | null
    archived_at: string | null
  } | null
}

export function useMyWorkOrders() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['work-orders', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(WORK_ORDER_SELECT)
        .eq('profile_id', profile!.id)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as WorkOrder[]
    },
  })
}

export function useSubcontractorWorkOrders(profileIds: string[]) {
  const ids = [...new Set(profileIds)].sort()
  return useQuery({
    queryKey: ['work-orders', 'management', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(WORK_ORDER_SELECT)
        .in('profile_id', ids)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as WorkOrder[]
    },
  })
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assignmentId, action, note }: { assignmentId: string; action: 'start' | 'complete'; note?: string | null }) => {
      const { data, error } = await supabase.rpc('update_my_work_order', {
        p_assignment_id: assignmentId,
        p_action: action,
        p_note: note?.trim() || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
  })
}
