import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import {
  PROJECT_DOCUMENT_UPLOAD_DENIED,
  canCreateProjectFile,
  canViewerSeeDocument,
} from '@/lib/document-visibility'
import { documentStorageBucket, sanitizeSearchTerm } from '@/lib/utils'
import { validateUploadFile, uploadErrorMessage, prepareUploadFileAsync } from '@/lib/uploads'
import type { DocumentCategory, DocumentRecord } from '@/types/database'

// Document lists depend on who is signed in and on management's sharing choices, so they are
// keyed by user and always refetched instead of served from a cached earlier answer.
const AUTHORIZED_LIST_OPTIONS = { staleTime: 0, refetchOnWindowFocus: true } as const

export function useProjectDocuments(projectId?: string) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['project-documents', projectId, profile?.id],
    enabled: Boolean(projectId && profile?.id),
    ...AUTHORIZED_LIST_OPTIONS,
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
  /** Files this person owns or uploaded. */
  personId?: string
  mineOnly?: boolean
}) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['documents', filters, profile?.id],
    enabled: Boolean(profile),
    ...AUTHORIZED_LIST_OPTIONS,
    // Keep the previous list while typing a search, but never across a change of user.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === profile?.id ? previous : undefined,
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
      if (filters?.personId) {
        query = query.or(`owner_id.eq.${filters.personId},uploaded_by.eq.${filters.personId}`)
      } else if (filters?.ownerId) {
        query = query.eq('owner_id', filters.ownerId)
      }
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
      const target = { project_id: projectId || null, category, mime_type: prepared.contentType }
      if (!canCreateProjectFile(profile, target)) throw new Error(PROJECT_DOCUMENT_UPLOAD_DENIED)
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

      const insertRow = (row: typeof insertPayload) =>
        supabase.from('documents').insert(row).select().single()

      let insert = await insertRow(insertPayload)

      // Development may not have kind_label yet — retry without it so uploads still work.
      if (
        insert.error &&
        trimmedKind &&
        /kind_label|schema cache|Could not find/i.test(
          [insert.error.message, insert.error.details, insert.error.hint].filter(Boolean).join(' '),
        )
      ) {
        insert = await insertRow(baseRow)
      }

      if (insert.error) {
        await supabase.storage.from(bucket).remove([path])
        throw new Error(uploadErrorMessage(insert.error))
      }

      return insert.data as DocumentRecord
    },
    onSuccess: async (doc) => {
      const visibleToUploader = canViewerSeeDocument(doc, profile)
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

      if (visibleToUploader) {
        queryClient.setQueriesData<DocumentRecord[]>({ queryKey: ['documents'] }, mergeDoc)
        if (doc.project_id) {
          queryClient.setQueriesData<DocumentRecord[]>(
            { queryKey: ['project-documents', doc.project_id] },
            mergeDoc,
          )
        }
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
      const { data, error } = await supabase.from('documents').delete().eq('id', doc.id).select('id')
      if (error) throw error
      // Row-level security turns a forbidden delete into "0 rows", not an error.
      if (!data || data.length === 0) throw new Error('You do not have permission to remove this file.')
      const removed = await supabase.storage.from(bucket).remove([doc.storage_path])
      if (removed.error) console.error('[documents] storage cleanup failed', removed.error)
    },
    onSuccess: (_data, doc) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (doc.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-documents', doc.project_id] })
      }
    },
  })
}

export function useSetDocumentTeamVisibility() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ doc, teamVisible }: { doc: DocumentRecord; teamVisible: boolean }) => {
      const { data, error } = await supabase
        .from('documents')
        .update({ team_visible: teamVisible })
        .eq('id', doc.id)
        .select()
        .single()
      if (error) {
        if (/team_visible|schema cache|PGRST204/i.test(error.message) || error.code === 'PGRST204') {
          throw new Error(
            'Project team access is not set up in the database yet. Run migration 20261001080000_project_document_team_visibility.sql in Development first.',
          )
        }
        throw error
      }
      return data as DocumentRecord
    },
    onSuccess: (row) => {
      if (row.project_id) {
        queryClient.setQueriesData<DocumentRecord[]>(
          { queryKey: ['project-documents', row.project_id] },
          (old) =>
            old?.map((item) => (item.id === row.id ? { ...item, team_visible: row.team_visible } : item)),
        )
        void queryClient.invalidateQueries({ queryKey: ['project-documents', row.project_id] })
      }
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['project-activity'] })
    },
  })
}

const FILE_UNAVAILABLE = 'This file is not available. Ask management for access.'

export async function createDocumentSignedUrl(doc: DocumentRecord) {
  const primary = documentStorageBucket(doc)
  const fallback = primary === 'documents' ? 'project-files' : 'documents'

  const first = await supabase.storage.from(primary).createSignedUrl(doc.storage_path, 60 * 10)
  if (!first.error && first.data?.signedUrl) return first.data.signedUrl

  const second = await supabase.storage.from(fallback).createSignedUrl(doc.storage_path, 60 * 10)
  if (second.error || !second.data?.signedUrl) {
    console.error('[documents] signed URL failed', second.error ?? first.error)
    throw new Error(FILE_UNAVAILABLE)
  }
  return second.data.signedUrl
}

/**
 * View: the tab is opened synchronously inside the click so browsers (iOS Safari especially)
 * do not block it or leave it blank after the async signed-URL request.
 */
export async function viewDocumentFile(doc: DocumentRecord) {
  const tab = window.open('', '_blank')
  try {
    const url = await createDocumentSignedUrl(doc)
    if (tab && !tab.closed) {
      tab.opener = null
      tab.location.replace(url)
    } else {
      window.location.assign(url)
    }
  } catch (error) {
    tab?.close()
    throw error
  }
}

/** Download: fetched through the caller's own storage permissions and saved under its name. */
export async function downloadDocumentFile(doc: DocumentRecord) {
  const primary = documentStorageBucket(doc)
  const fallback = primary === 'documents' ? 'project-files' : 'documents'
  let result = await supabase.storage.from(primary).download(doc.storage_path)
  if (result.error || !result.data) result = await supabase.storage.from(fallback).download(doc.storage_path)
  if (result.error || !result.data) {
    console.error('[documents] download failed', result.error)
    throw new Error(FILE_UNAVAILABLE)
  }
  if (result.data.size === 0) throw new Error('This file is empty. Ask management to upload it again.')

  const href = URL.createObjectURL(result.data)
  const link = document.createElement('a')
  link.href = href
  link.download = doc.name || 'document'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

