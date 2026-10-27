import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { sanitizeSearchTerm } from '@/lib/utils'
import { validateUploadFile } from '@/lib/uploads'
import type { CertificationFormValues } from '@/lib/validations'
import type { Certification, CertificationStatus } from '@/types/database'
import { PROFILE_DIRECTORY_COLUMNS } from '@/lib/profile-fields'

export function useCertifications(filters?: {
  search?: string
  status?: CertificationStatus
  type?: string
  profileId?: string
}) {
  return useQuery({
    queryKey: ['certifications', filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('certifications')
        .select(`*, profile:profiles(${PROFILE_DIRECTORY_COLUMNS})`)
        .order('expiration_date', { ascending: true, nullsFirst: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.type) query = query.eq('certification_type', filters.type)
      if (filters?.search) {
        const safe = sanitizeSearchTerm(filters.search)
        if (safe) query = query.ilike('name', `%${safe}%`)
      }
      if (filters?.profileId) query = query.eq('profile_id', filters.profileId)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Certification[]
    },
  })
}

/** Proofs live in the worker's own folder, whoever uploads them. */
export function certificationProofPath(workerId: string, fileName: string, now = Date.now()) {
  const safeName = fileName.replace(/[^\w.\-()+ ]+/g, '_')
  return `${workerId}/certifications/${now}-${safeName}`
}

/** Shown when the record changed but an old proof file could not be deleted from Storage. */
export const PROOF_FILE_CLEANUP_WARNING =
  'The old proof file could not be deleted from storage. Ask an admin to remove it from the worker’s documents.'

async function removeProofFile(path: string | null | undefined): Promise<string | undefined> {
  if (!path || path.startsWith('http://') || path.startsWith('https://')) return undefined
  const { data, error } = await supabase.storage.from('documents').remove([path])
  // Storage reports a denied delete as success with no removed objects.
  if (error || !data || data.length === 0) return PROOF_FILE_CLEANUP_WARNING
  return undefined
}

async function attachProof(certification: Pick<Certification, 'id' | 'profile_id'>, file: File) {
  const validationError = validateUploadFile(file)
  if (validationError) throw new Error(validationError)

  const path = certificationProofPath(certification.profile_id, file.name)
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
  if (uploadError) throw uploadError

  const { data: previousPath, error } = await supabase.rpc('set_certification_proof', {
    p_certification_id: certification.id,
    p_storage_path: path,
    p_file_name: file.name,
    p_mime_type: file.type || null,
    p_file_size: file.size,
  })
  if (error) {
    await supabase.storage.from('documents').remove([path])
    throw error
  }
  return previousPath ?? null
}

export function useCreateCertification() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ values, file }: { values: CertificationFormValues; file?: File | null }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      if (file) {
        const validationError = validateUploadFile(file)
        if (validationError) throw new Error(validationError)
      }

      const baseRow = {
        name: values.name,
        certification_type: values.certification_type,
        profile_id: values.profile_id,
        issue_date: values.issue_date || null,
        expiration_date: values.expiration_date || null,
        notes: values.notes || null,
        document_url: null,
        organization_id: profile.organization_id,
      }
      const insertRow = (row: typeof baseRow & { created_by?: string }) =>
        supabase.from('certifications').insert(row).select().single()

      let insert = await insertRow({ ...baseRow, created_by: profile.id })
      if (
        insert.error &&
        /created_by|schema cache|Could not find/i.test(
          [insert.error.message, insert.error.details, insert.error.hint].filter(Boolean).join(' '),
        )
      ) {
        insert = await insertRow(baseRow)
      }
      if (insert.error) throw insert.error
      const certification = insert.data as Certification

      if (file) {
        try {
          await attachProof(certification, file)
        } catch (proofError) {
          await supabase.from('certifications').delete().eq('id', certification.id)
          throw proofError
        }
        queryClient.invalidateQueries({ queryKey: ['documents'] })
      }

      return certification
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
    }: {
      id: string
      values: Partial<CertificationFormValues>
      file?: File | null
    }): Promise<{ certification: Certification; fileWarning?: string }> => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      if (file) {
        const validationError = validateUploadFile(file)
        if (validationError) throw new Error(validationError)
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
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      let certification = data as Certification

      let fileWarning: string | undefined
      if (file) {
        const previousPath = await attachProof(certification, file)
        fileWarning = await removeProofFile(previousPath)
        queryClient.invalidateQueries({ queryKey: ['documents'] })
        const { data: refreshed } = await supabase.from('certifications').select('*').eq('id', id).single()
        if (refreshed) certification = refreshed as Certification
      }
      return { certification, fileWarning }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certifications'] }),
  })
}

export function useDeleteCertification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cert: Pick<Certification, 'id'>): Promise<{ fileWarning?: string }> => {
      const { data: proofPath, error } = await supabase.rpc('remove_certification', {
        p_certification_id: cert.id,
      })
      if (error) throw error
      return { fileWarning: await removeProofFile(proofPath) }
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

