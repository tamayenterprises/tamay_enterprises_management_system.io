import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { sanitizeSearchTerm } from '@/lib/utils'
import { validateUploadFile } from '@/lib/uploads'
import type { CertificationFormValues } from '@/lib/validations'
import type { Certification, CertificationStatus } from '@/types/database'

export function useCertifications(filters?: {
  search?: string
  status?: CertificationStatus
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

