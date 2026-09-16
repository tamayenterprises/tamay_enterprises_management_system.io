import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import { documentStorageBucket, sanitizeSearchTerm } from '@/lib/utils'
import { validateUploadFile, uploadErrorMessage, prepareUploadFileAsync } from '@/lib/uploads'
import type { DocumentCategory, DocumentRecord } from '@/types/database'

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

export function useDocuments(filters?: {
  search?: string
  category?: DocumentCategory
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
      if (filters?.search) {
        const safe = sanitizeSearchTerm(filters.search)
        if (safe) query = query.ilike('name', `%${safe}%`)
      }
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
      kindLabel,
    }: {
      file: File
      category: DocumentRecord['category']
      projectId?: string | null
      bucket?: 'documents' | 'project-files'
      kindLabel?: string | null
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

      const baseRow = {
        organization_id: profile.organization_id,
        owner_id: profile.id,
        uploaded_by: profile.id,
        project_id: projectId || null,
        name: prepared.displayName,
        category,
        storage_path: path,
        mime_type: prepared.contentType,
        file_size: prepared.file.size || null,
      }

      const trimmedKind = kindLabel?.trim() || null
      const insertPayload = {
        ...baseRow,
        ...(trimmedKind ? { kind_label: trimmedKind } : {}),
      }

      let insert = await supabase.from('documents').insert(insertPayload).select().single()

      // Development may not have kind_label yet — retry without it so uploads still work.
      if (
        insert.error &&
        trimmedKind &&
        /kind_label|schema cache|Could not find/i.test(
          [insert.error.message, insert.error.details, insert.error.hint].filter(Boolean).join(' '),
        )
      ) {
        insert = await supabase.from('documents').insert(baseRow).select().single()
      }

      if (insert.error) {
        await supabase.storage.from(bucket).remove([path])
        throw new Error(uploadErrorMessage(insert.error))
      }

      return insert.data as DocumentRecord
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

